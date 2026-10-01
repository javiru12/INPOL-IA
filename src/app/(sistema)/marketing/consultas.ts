import 'server-only'
import { conTenant, type Sql } from '@/lib/db'
import type { Alcance, Canal, Destinatario, Segmento } from './catalogo'

/**
 * Consultas del módulo de Comunicación.
 *
 * Dos lecturas distintas conviven aquí:
 *  · los avisos pendientes, que miran la petición resuelta y preguntan
 *    si alguien se lo dijo al ciudadano;
 *  · el segmento de una campaña, que mira al ciudadano y pregunta a
 *    cuántos alcanza un conjunto de criterios.
 *
 * El predicado del segmento vive en una sola función porque lo usan tres
 * caminos —el contador en vivo, la vista previa y el alta de la campaña—
 * y si se separaran, el número que se enseña y la lista que se guarda
 * acabarían no coincidiendo.
 */

export const POR_PAGINA = 20

/**
 * Predicado del segmento sobre `ciudadanos c`.
 *
 * Cada criterio se compara contra null para que el mismo texto sirva con
 * y sin filtro; así la consulta se planea una sola vez y no hay que armar
 * SQL por concatenación.
 */
export function condicionSegmento(tx: Sql, s: Segmento) {
  return tx`
    c.activo
    and (${s.colonia ?? null}::text is null or c.colonia = ${s.colonia ?? null})
    and (${s.municipio ?? null}::text is null or exists (
          select 1 from secciones se
          join municipios mu on mu.id = se.municipio_id
          where se.id = c.seccion_id and mu.nombre = ${s.municipio ?? null}))
    and (${s.seccion ?? null}::text is null or exists (
          select 1 from secciones se
          where se.id = c.seccion_id and se.clave = ${s.seccion ?? null}))
    and (${s.sexo ?? null}::text is null or c.sexo = ${s.sexo ?? null})
    and (${s.edadMin ?? null}::int is null or c.edad >= ${s.edadMin ?? null}::int)
    and (${s.edadMax ?? null}::int is null or c.edad <= ${s.edadMax ?? null}::int)
    and (${s.problematica ?? null}::text is null or exists (
          select 1 from peticiones p
          join problematicas pr on pr.id = p.problematica_id
          where p.ciudadano_id = c.id and pr.titulo = ${s.problematica ?? null}))
    and (${s.estatus ?? null}::text is null or exists (
          select 1 from peticiones p
          join estatus_peticiones e on e.id = p.estatus_id
          where p.ciudadano_id = c.id and e.descripcion = ${s.estatus ?? null}))`
}

/**
 * Quién tiene el dato de contacto que el canal necesita.
 *
 * No es un detalle menor: el segmento puede alcanzar a 300 personas y el
 * canal elegido llegarle a 12. La pantalla enseña las dos cifras.
 */
export function condicionCanal(tx: Sql, canal: Canal) {
  return canal === 'correo'
    ? tx`c.correo is not null and btrim(c.correo) <> ''`
    : tx`c.telefono_movil is not null and btrim(c.telefono_movil) <> ''`
}

export function campoDestino(tx: Sql, canal: Canal) {
  return canal === 'correo' ? tx`c.correo` : tx`c.telefono_movil`
}

/** El nombre y los datos que sustituyen a los marcadores del mensaje. */
export function camposDestinatario(tx: Sql) {
  return tx`
    nullif(btrim(coalesce(c.nombre_completo,
      concat_ws(' ', c.nombre, c.apellido_paterno))), '') as nombre,
    (select upper(substr(p.id::text, 1, 6)) from peticiones p
      where p.ciudadano_id = c.id
      order by p.fecha_apertura desc limit 1) as folio,
    (select pr.titulo from peticiones p
      join problematicas pr on pr.id = p.problematica_id
      where p.ciudadano_id = c.id
      order by p.fecha_apertura desc limit 1) as problematica`
}

/** Contador en vivo del formulario de campaña. */
export async function medirAlcance(
  tenantId: string,
  segmento: Segmento,
  canal: Canal,
): Promise<Alcance> {
  return conTenant(tenantId, async (tx) => {
    const donde = condicionSegmento(tx, segmento)
    const contactable = condicionCanal(tx, canal)

    const [conteo, muestra] = await Promise.all([
      tx<{ personas: number; alcanzables: number }[]>`
        select count(*)::int as personas,
               count(*) filter (where ${contactable})::int as alcanzables
        from ciudadanos c
        where ${donde}`,
      tx<Destinatario[]>`
        select ${camposDestinatario(tx)}, ${campoDestino(tx, canal)} as destino
        from ciudadanos c
        where ${donde} and ${contactable}
        order by c.nombre_completo nulls last, c.id
        limit 1`,
    ])

    return {
      personas: conteo[0]?.personas ?? 0,
      alcanzables: conteo[0]?.alcanzables ?? 0,
      muestra: muestra[0] ?? null,
    }
  })
}

// --- Avisos pendientes --------------------------------------------------

export type FilaAviso = {
  id: string
  ciudadano_id: string
  folio: string
  ciudadano: string | null
  telefono: string | null
  correo: string | null
  colonia: string | null
  descripcion: string | null
  problematica: string | null
  estatus: string
  resuelto_en: string
  dias: number
}

/**
 * Peticiones con desenlace que nadie le comunicó al ciudadano.
 *
 * `resuelto_en` es la fecha del desenlace: el cierre si lo hubo y, si no,
 * el último cambio de estatus registrado. Un aviso solo cuenta si se
 * registró *después* de ese momento; si la petición se reabre y vuelve a
 * cerrarse, el aviso viejo ya no vale y la fila reaparece.
 */
export function fuenteAvisos(tx: Sql) {
  return tx`
    from (
      select p.id,
             p.ciudadano_id,
             p.descripcion,
             p.problematica_id,
             e.descripcion as estatus,
             greatest(
               coalesce(p.fecha_cierre, p.fecha_apertura),
               coalesce((select max(s.creado_en)
                         from peticion_seguimientos s
                         where s.peticion_id = p.id and s.tipo = 'cambio_estatus'),
                        p.fecha_apertura)
             ) as resuelto_en
      from peticiones p
      join estatus_peticiones e on e.id = p.estatus_id
      where p.activo and e.descripcion in ('Completada', 'Cancelada')
    ) r
    join ciudadanos c on c.id = r.ciudadano_id
    left join problematicas pr on pr.id = r.problematica_id
    where not exists (
      select 1 from mensajes_enviados m
      where m.peticion_id = r.id and m.activo and m.creado_en >= r.resuelto_en)`
}

export async function listarAvisosPendientes(
  tenantId: string,
  f: { q?: string; estatus?: string; problematica?: string; pagina?: number },
) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    const desde = fuenteAvisos(tx)
    const filtros = tx`
      and (${f.q ?? null}::text is null or (
            coalesce(c.nombre_completo, concat_ws(' ', c.nombre, c.apellido_paterno))
              ilike ${'%' + (f.q ?? '') + '%'}
            or c.colonia ilike ${'%' + (f.q ?? '') + '%'}
            or r.descripcion ilike ${'%' + (f.q ?? '') + '%'}))
      and (${f.estatus ?? null}::text is null or r.estatus = ${f.estatus ?? null})
      and (${f.problematica ?? null}::text is null or pr.titulo = ${f.problematica ?? null})`

    const [filas, [{ total }], problematicas] = await Promise.all([
      tx<FilaAviso[]>`
        select r.id,
               r.ciudadano_id,
               upper(substr(r.id::text, 1, 6)) as folio,
               nullif(btrim(coalesce(c.nombre_completo,
                 concat_ws(' ', c.nombre, c.apellido_paterno))), '') as ciudadano,
               c.telefono_movil as telefono,
               c.correo,
               c.colonia,
               r.descripcion,
               pr.titulo as problematica,
               r.estatus,
               r.resuelto_en::text as resuelto_en,
               (current_date - r.resuelto_en::date)::int as dias
        ${desde} ${filtros}
        order by r.resuelto_en asc
        limit ${POR_PAGINA} offset ${salto}`,

      tx<{ total: number }[]>`select count(*)::int as total ${desde} ${filtros}`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select pr.titulo as valor, pr.titulo as etiqueta, count(*)::int as conteo
        ${desde} and pr.titulo is not null
        group by 1, 2 order by 3 desc`,
    ])

    return { filas, total, pagina, problematicas }
  })
}

export type Resumen = {
  pendientes: number
  dias_promedio: number
  mas_antiguo: number
  avisados_30: number
  campanias: number
  preparados: number
}

export async function resumenComunicacion(tenantId: string): Promise<Resumen> {
  return conTenant(tenantId, async (tx) => {
    const desde = fuenteAvisos(tx)

    // `avg` devuelve numeric, que el driver entrega como texto: sin el
    // ::float8 llegaría una cadena y las comparaciones fallarían calladas.
    const [pendientes, otros] = await Promise.all([
      tx<{ pendientes: number; dias_promedio: number; mas_antiguo: number }[]>`
        select count(*)::int as pendientes,
               coalesce(avg(current_date - r.resuelto_en::date), 0)::float8 as dias_promedio,
               coalesce(max(current_date - r.resuelto_en::date), 0)::int as mas_antiguo
        ${desde}`,
      tx<{ avisados_30: number; campanias: number; preparados: number }[]>`
        select (select count(*)::int from mensajes_enviados
                where peticion_id is not null and estado = 'enviado'
                  and creado_en >= now() - interval '30 days') as avisados_30,
               (select count(*)::int from campanias_mensaje where activo) as campanias,
               (select count(*)::int from mensajes_enviados
                where campania_mensaje_id is not null and estado = 'preparado')
                 as preparados`,
    ])

    return {
      pendientes: pendientes[0]?.pendientes ?? 0,
      dias_promedio: Math.round(pendientes[0]?.dias_promedio ?? 0),
      mas_antiguo: pendientes[0]?.mas_antiguo ?? 0,
      avisados_30: otros[0]?.avisados_30 ?? 0,
      campanias: otros[0]?.campanias ?? 0,
      preparados: otros[0]?.preparados ?? 0,
    }
  })
}

// --- Campañas -----------------------------------------------------------

export type FilaCampania = {
  id: string
  nombre: string
  canal: Canal
  asunto: string | null
  estado: string
  destinatarios: number
  segmento: Segmento
  creado_en: string
  autor: string | null
}

export async function listarCampanias(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx<FilaCampania[]>`
      select cm.id, cm.nombre, cm.canal, cm.asunto, cm.estado,
             cm.destinatarios, cm.segmento,
             cm.creado_en::text as creado_en,
             nullif(btrim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as autor
      from campanias_mensaje cm
      left join usuarios u on u.id = cm.creado_por
      where cm.activo
      order by cm.creado_en desc
      limit 50`,
  )
}

/** Catálogos con los que se arma un segmento: solo valores que existen. */
export async function catalogosSegmento(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const [colonias, municipios, secciones, problematicas, estatus] = await Promise.all([
      tx<{ valor: string; conteo: number }[]>`
        select colonia as valor, count(*)::int as conteo
        from ciudadanos where activo and colonia is not null
        group by 1 order by 2 desc, 1`,
      tx<{ valor: string; conteo: number }[]>`
        select mu.nombre as valor, count(*)::int as conteo
        from ciudadanos c
        join secciones se on se.id = c.seccion_id
        join municipios mu on mu.id = se.municipio_id
        where c.activo
        group by 1 order by 2 desc, 1`,
      tx<{ valor: string; conteo: number }[]>`
        select se.clave as valor, count(*)::int as conteo
        from ciudadanos c
        join secciones se on se.id = c.seccion_id
        where c.activo
        group by 1 order by 1
        limit 400`,
      tx<{ valor: string; conteo: number }[]>`
        select pr.titulo as valor, count(p.id)::int as conteo
        from problematicas pr
        left join peticiones p on p.problematica_id = pr.id
        where pr.activo
        group by 1 order by 1`,
      tx<{ valor: string; conteo: number }[]>`
        select e.descripcion as valor, count(p.id)::int as conteo
        from estatus_peticiones e
        left join peticiones p on p.estatus_id = e.id
        where e.activo
        group by 1 order by 2 desc`,
    ])
    return { colonias, municipios, secciones, problematicas, estatus }
  })
}

export type FilaDestinatario = {
  id: string
  ciudadano_id: string
  ciudadano: string | null
  destino: string | null
  estado: string
  cuerpo: string | null
}

export async function detalleCampania(tenantId: string, id: string) {
  return conTenant(tenantId, async (tx) => {
    const [campania] = await tx<
      (FilaCampania & { cuerpo: string; preparada_en: string })[]
    >`
      select cm.id, cm.nombre, cm.canal, cm.asunto, cm.cuerpo, cm.estado,
             cm.destinatarios, cm.segmento,
             cm.creado_en::text as creado_en,
             cm.preparada_en::text as preparada_en,
             nullif(btrim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as autor
      from campanias_mensaje cm
      left join usuarios u on u.id = cm.creado_por
      where cm.id = ${id} and cm.activo`

    if (!campania) return null

    const destinatarios = await tx<FilaDestinatario[]>`
      select m.id, m.ciudadano_id, m.destino, m.estado, m.cuerpo,
             nullif(btrim(coalesce(c.nombre_completo,
               concat_ws(' ', c.nombre, c.apellido_paterno))), '') as ciudadano
      from mensajes_enviados m
      join ciudadanos c on c.id = m.ciudadano_id
      where m.campania_mensaje_id = ${id}
      order by c.nombre_completo nulls last
      limit 100`

    return { campania, destinatarios }
  })
}
