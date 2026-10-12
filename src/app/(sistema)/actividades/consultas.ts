import 'server-only'
import { conTenant, sinTenant } from '@/lib/db'

export const POR_PAGINA = 25

export type TipoActividad = 'recorrido' | 'evento'

export function tipoValido(valor: string | undefined): TipoActividad | undefined {
  return valor === 'recorrido' || valor === 'evento' ? valor : undefined
}

/** Las actividades no tienen folio propio: se identifican por UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResumenMes = {
  total: number
  recorridos: number
  eventos: number
  programados: number
  reales: number
}

export type ActividadEnRejilla = {
  id: string
  tipo: TipoActividad
  titulo: string
  fecha: string
  hora: string | null
}

export type FilaActividad = {
  id: string
  tipo: TipoActividad
  titulo: string
  fecha: string | null
  colonia: string | null
  programados: number | null
  reales: number | null
  responsable: string | null
}

export type DetalleActividad = {
  id: string
  titulo: string
  descripcion: string | null
  fecha: string | null
  inicia: string | null
  termina: string | null
  direccion: string | null
  entre: string | null
  cp: string | null
  partida: string | null
  llegada: string | null
  colonia: string | null
  responsable: string | null
  vestimenta: string | null
  visita: string | null
  prensa: boolean | null
  montaje: boolean | null
  programados: number | null
  reales: number | null
  logistica: string | null
  notas: string | null
  activo: boolean
}

export type PeticionDeActividad = {
  id: string
  folio: string
  ciudadano: string | null
  problematica: string | null
  estatus: string | null
}

/**
 * Recorridos y eventos viven en tablas distintas y con columnas distintas.
 * Esta vista común es lo único que comparten para listarse juntos.
 *
 * Las fechas salen crudas ('AAAA-MM-DD') y se formatean con `@/lib/formato`.
 * La hora sí se arma aquí con `to_char`: el patrón es numérico, no depende
 * del `lc_time`, y así se expresa en el huso de la sesión de la base.
 */
function unionActividades(tx: Parameters<Parameters<typeof conTenant>[1]>[0]) {
  return tx`
    with actividades as (
      select r.id,
             'recorrido' as tipo,
             r.titulo,
             r.fecha_recorrido::text as fecha,
             to_char(r.hora_inicia, 'HH24:MI') as hora,
             r.colonia,
             r.asistentes_programados as programados,
             r.asistentes_reales as reales,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable
      from recorridos r
      left join usuarios u on u.id = r.usuario_responsable_id
      where r.activo
      union all
      select e.id,
             'evento',
             e.titulo,
             e.fecha_evento::text,
             to_char(e.hora_inicia, 'HH24:MI'),
             e.colonia,
             e.asistentes_programados,
             e.asistentes_reales,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '')
      from eventos e
      left join usuarios u on u.id = e.usuario_responsable_id
      where e.activo
    )`
}

/** Meses con al menos una actividad, del más reciente al más antiguo. */
export async function mesesConActividad(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const filas = await tx<{ mes: string }[]>`
      ${unionActividades(tx)}
      select distinct substr(fecha, 1, 7) as mes
      from actividades
      where fecha is not null
      order by 1 desc`
    return filas.map((f) => f.mes)
  })
}

/**
 * Indicadores del mes y actividades de toda la rejilla visible.
 *
 * El resumen se limita al mes; la rejilla se extiende a los días de los
 * meses vecinos que completan las semanas, para que esos días no aparezcan
 * vacíos cuando sí tienen actividad.
 */
export async function panoramaDelMes(
  tenantId: string,
  mes: string,
  rango: { desde: string; hasta: string },
  hoy: string,
) {
  return conTenant(tenantId, async (tx) => {
    const [[resumen], actividades] = await Promise.all([
      tx<ResumenMes[]>`
        ${unionActividades(tx)}
        select count(*)::int as total,
               count(*) filter (
                 where tipo = 'recorrido' and fecha <= ${hoy})::int as recorridos,
               count(*) filter (
                 where tipo = 'evento' and fecha <= ${hoy})::int as eventos,
               coalesce(sum(programados), 0)::int as programados,
               coalesce(sum(reales), 0)::int as reales
        from actividades
        where substr(fecha, 1, 7) = ${mes}`,

      tx<ActividadEnRejilla[]>`
        ${unionActividades(tx)}
        select id, tipo, titulo, fecha, hora
        from actividades
        where fecha between ${rango.desde} and ${rango.hasta}
        order by fecha, hora nulls last, titulo`,
    ])

    return {
      resumen: resumen ?? { total: 0, recorridos: 0, eventos: 0, programados: 0, reales: 0 },
      actividades,
    }
  })
}

export type FiltrosActividades = {
  tipo?: TipoActividad
  mes?: string
  pagina?: number
}

export async function listarActividades(tenantId: string, f: FiltrosActividades) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    // El mismo predicado para el conteo y para la página: así el total
    // nunca se contradice con lo que se ve en la tabla.
    const donde = tx`
      where (${f.tipo ?? null}::text is null or tipo = ${f.tipo ?? null})
        and (${f.mes ?? null}::text is null or substr(fecha, 1, 7) = ${f.mes ?? null})`

    const [filas, [conteo]] = await Promise.all([
      tx<FilaActividad[]>`
        ${unionActividades(tx)}
        select id, tipo, titulo, fecha, colonia, programados, reales, responsable
        from actividades ${donde}
        order by fecha desc nulls last, titulo
        limit ${POR_PAGINA} offset ${salto}`,

      tx<{ total: number }[]>`
        ${unionActividades(tx)}
        select count(*)::int as total from actividades ${donde}`,
    ])

    return { filas, total: conteo?.total ?? 0, pagina }
  })
}

/** Detalle de una actividad con las peticiones que se levantaron en ella. */
export async function detalleDeActividad(
  tenantId: string,
  tipo: TipoActividad,
  id: string,
): Promise<(DetalleActividad & { peticiones: PeticionDeActividad[] }) | null> {
  if (!UUID.test(id)) return null

  return conTenant(tenantId, async (tx) => {
    const [actividad] =
      tipo === 'recorrido'
        ? await tx<DetalleActividad[]>`
            select r.id,
                   r.titulo,
                   r.descripcion,
                   r.fecha_recorrido::text as fecha,
                   to_char(r.hora_inicia, 'HH24:MI') as inicia,
                   to_char(r.hora_termina, 'HH24:MI') as termina,
                   null::text as direccion,
                   null::text as entre,
                   null::text as cp,
                   r.punto_inicia as partida,
                   r.punto_finaliza as llegada,
                   r.colonia,
                   nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno,
                     u.apellido_materno)), '') as responsable,
                   v.descripcion as vestimenta,
                   null::text as visita,
                   r.prensa,
                   r.montaje,
                   r.asistentes_programados as programados,
                   r.asistentes_reales as reales,
                   r.detalle_logistica as logistica,
                   r.notas_adicionales as notas,
                   r.activo
            from recorridos r
            left join usuarios u on u.id = r.usuario_responsable_id
            left join vestimentas v on v.id = r.vestimenta_id
            where r.id = ${id}::uuid`
        : await tx<DetalleActividad[]>`
            select e.id,
                   e.titulo,
                   e.descripcion,
                   e.fecha_evento::text as fecha,
                   to_char(e.hora_inicia, 'HH24:MI') as inicia,
                   to_char(e.hora_termina, 'HH24:MI') as termina,
                   nullif(trim(concat_ws(' ', e.calle, e.numero)), '') as direccion,
                   nullif(concat_ws(' y ', e.entre_calle_1, e.entre_calle_2), '') as entre,
                   e.codigo_postal as cp,
                   null::text as partida,
                   null::text as llegada,
                   e.colonia,
                   nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno,
                     u.apellido_materno)), '') as responsable,
                   v.descripcion as vestimenta,
                   tv.descripcion as visita,
                   e.prensa,
                   e.montaje,
                   e.asistentes_programados as programados,
                   e.asistentes_reales as reales,
                   e.detalle_logistica as logistica,
                   e.notas_adicionales as notas,
                   e.activo
            from eventos e
            left join usuarios u on u.id = e.usuario_responsable_id
            left join vestimentas v on v.id = e.vestimenta_id
            left join tipos_visita tv on tv.id = e.tipo_visita_id
            where e.id = ${id}::uuid`

    if (!actividad) return null

    const seleccion = tx`
      select p.id,
             upper(substr(p.id::text, 1, 6)) as folio,
             nullif(trim(coalesce(ci.nombre_completo,
               concat_ws(' ', ci.nombre, ci.apellido_paterno))), '') as ciudadano,
             pr.titulo as problematica,
             es.descripcion as estatus
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      left join estatus_peticiones es on es.id = p.estatus_id`

    const peticiones =
      tipo === 'recorrido'
        ? await tx<PeticionDeActividad[]>`
            ${seleccion}
            join recorrido_peticiones rp on rp.peticion_id = p.id
            where rp.recorrido_id = ${id}::uuid and rp.activo
            order by p.fecha_apertura desc nulls last`
        : await tx<PeticionDeActividad[]>`
            ${seleccion}
            join evento_peticiones ep on ep.peticion_id = p.id
            where ep.evento_id = ${id}::uuid and ep.activo
            order by p.fecha_apertura desc nulls last`

    return { ...actividad, peticiones }
  })
}

/** Catálogos del formulario de alta: municipios del estado y el equipo. */
export async function catalogosDeActividad(tenantId: string, estadoId: string | null) {
  const municipios = estadoId
    ? await sinTenant<{ id: string; nombre: string }[]>`
        select id, nombre from municipios where estado_id = ${estadoId} order by nombre`
    : []

  const responsables = await conTenant(tenantId, (tx) =>
    tx<{ id: string; nombre: string }[]>`
      select id,
             coalesce(
               nullif(trim(concat_ws(' ', nombre, apellido_paterno, apellido_materno)), ''),
               correo) as nombre
      from usuarios
      where activo
      order by 2`,
  )

  return { municipios, responsables }
}

export type ActividadEditable = {
  id: string
  titulo: string | null
  descripcion: string | null
  fecha: string | null
  hora_inicia: string | null
  hora_termina: string | null
  lugar: string | null
  colonia: string | null
  municipio_id: string | null
  seccion_clave: string | null
  responsable_id: string | null
  asistentes_programados: number | null
  notas: string | null
  activo: boolean
}

/** La actividad tal como la necesita el formulario de edición. */
export async function actividadParaEditar(
  tenantId: string,
  tipo: 'evento' | 'recorrido',
  id: string,
) {
  return conTenant(tenantId, async (tx) => {
    const filas =
      tipo === 'evento'
        ? await tx<ActividadEditable[]>`
            select e.id, e.titulo, e.descripcion,
                   e.fecha_evento::text as fecha,
                   to_char(e.hora_inicia at time zone 'America/Monterrey', 'HH24:MI') as hora_inicia,
                   to_char(e.hora_termina at time zone 'America/Monterrey', 'HH24:MI') as hora_termina,
                   e.calle as lugar, e.colonia, e.municipio_id::text,
                   s.clave as seccion_clave,
                   e.usuario_responsable_id::text as responsable_id,
                   e.asistentes_programados, e.notas_adicionales as notas, e.activo
            from eventos e
            left join secciones s on s.id = e.seccion_id
            where e.id = ${id} limit 1`
        : await tx<ActividadEditable[]>`
            select r.id, r.titulo, r.descripcion,
                   r.fecha_recorrido::text as fecha,
                   to_char(r.hora_inicia at time zone 'America/Monterrey', 'HH24:MI') as hora_inicia,
                   to_char(r.hora_termina at time zone 'America/Monterrey', 'HH24:MI') as hora_termina,
                   r.punto_inicia as lugar, r.colonia, r.municipio_id::text,
                   s.clave as seccion_clave,
                   r.usuario_responsable_id::text as responsable_id,
                   r.asistentes_programados, r.notas_adicionales as notas, r.activo
            from recorridos r
            left join secciones s on s.id = r.seccion_id
            where r.id = ${id} limit 1`

    const a = filas[0]
    return a ? { ...a, tipo } : null
  })
}
