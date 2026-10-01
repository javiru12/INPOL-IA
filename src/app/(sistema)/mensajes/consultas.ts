import 'server-only'
import { conTenant, type Sql } from '@/lib/db'

/**
 * Consultas de la mensajería interna.
 *
 * El hilo es la unidad: una conversación entre dos personas sobre una
 * petición. La bandeja lista hilos, no mensajes sueltos, porque lo que
 * se contesta es la conversación.
 *
 * `recibidos` y `enviados` no son dos montones separados: un hilo donde
 * me escribieron y contesté aparece en los dos. Es lo que la gente
 * espera de un buzón, y evita que «enviados» se vea vacío cuando lo
 * único que hice fue responder.
 */

export const POR_PAGINA = 20

export type Bandeja = 'recibidos' | 'enviados' | 'archivados'

export const BANDEJAS: { valor: Bandeja; etiqueta: string }[] = [
  { valor: 'recibidos', etiqueta: 'Recibidos' },
  { valor: 'enviados', etiqueta: 'Enviados' },
  { valor: 'archivados', etiqueta: 'Archivados' },
]

export function esBandeja(v: string | undefined): Bandeja {
  return v === 'enviados' || v === 'archivados' ? v : 'recibidos'
}

export type FilaHilo = {
  id: string
  asunto: string
  peticion_id: string | null
  folio: string | null
  contraparte: string | null
  contraparte_perfil: string | null
  ultimo_en: string
  ultimo_cuerpo: string | null
  ultimo_mio: boolean | null
  mensajes: number
  sin_leer: number
  archivado: boolean
}

/** Predicado de la bandeja elegida. Uno solo, compartido con el conteo. */
function filtroBandeja(tx: Sql, bandeja: Bandeja, usuarioId: string) {
  if (bandeja === 'archivados') return tx`h.archivado_en is not null`
  if (bandeja === 'enviados') {
    return tx`h.archivado_en is null and exists (
      select 1 from mensajes m
      where m.hilo_id = h.id and m.autor_id = ${usuarioId} and m.activo)`
  }
  return tx`h.archivado_en is null and exists (
    select 1 from mensajes m
    where m.hilo_id = h.id and m.destinatario_id = ${usuarioId} and m.activo)`
}

export async function listarHilos(
  tenantId: string,
  usuarioId: string,
  f: { bandeja: Bandeja; soloSinLeer?: boolean; peticionId?: string; pagina?: number },
) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    const donde = tx`
      where h.activo
        and (h.iniciador_id = ${usuarioId} or h.receptor_id = ${usuarioId})
        and ${filtroBandeja(tx, f.bandeja, usuarioId)}
        and (${f.soloSinLeer ?? false} = false or exists (
              select 1 from mensajes m
              where m.hilo_id = h.id and m.destinatario_id = ${usuarioId}
                and m.leido_en is null and m.activo))
        and (${f.peticionId ?? null}::uuid is null
             or h.peticion_id = ${f.peticionId ?? null}::uuid)`

    // La contraparte es «el otro»: quien no soy yo en este hilo.
    const desde = tx`
      from mensaje_hilos h
      join usuarios o on o.id = case when h.iniciador_id = ${usuarioId}
                                     then h.receptor_id else h.iniciador_id end`

    const [filas, [{ total }], tableros] = await Promise.all([
      tx<FilaHilo[]>`
        select h.id, h.asunto, h.peticion_id,
               upper(substr(h.peticion_id::text, 1, 6)) as folio,
               nullif(btrim(concat_ws(' ', o.nombre, o.apellido_paterno)), '') as contraparte,
               o.perfil_clave as contraparte_perfil,
               h.ultimo_en::text as ultimo_en,
               h.archivado_en is not null as archivado,
               (select count(*)::int from mensajes m
                 where m.hilo_id = h.id and m.activo) as mensajes,
               (select count(*)::int from mensajes m
                 where m.hilo_id = h.id and m.activo
                   and m.destinatario_id = ${usuarioId} and m.leido_en is null) as sin_leer,
               (select m.cuerpo from mensajes m
                 where m.hilo_id = h.id and m.activo
                 order by m.creado_en desc limit 1) as ultimo_cuerpo,
               (select m.autor_id = ${usuarioId} from mensajes m
                 where m.hilo_id = h.id and m.activo
                 order by m.creado_en desc limit 1) as ultimo_mio
        ${desde} ${donde}
        order by h.ultimo_en desc
        limit ${POR_PAGINA} offset ${salto}`,

      tx<{ total: number }[]>`select count(*)::int as total ${desde} ${donde}`,

      // Cifras de las pestañas: una sola pasada sobre los hilos del usuario.
      tx<{ recibidos: number; enviados: number; archivados: number; sin_leer: number }[]>`
        select
          count(*) filter (where h.archivado_en is null and exists (
            select 1 from mensajes m where m.hilo_id = h.id
              and m.destinatario_id = ${usuarioId} and m.activo))::int as recibidos,
          count(*) filter (where h.archivado_en is null and exists (
            select 1 from mensajes m where m.hilo_id = h.id
              and m.autor_id = ${usuarioId} and m.activo))::int as enviados,
          count(*) filter (where h.archivado_en is not null)::int as archivados,
          count(*) filter (where h.archivado_en is null and exists (
            select 1 from mensajes m where m.hilo_id = h.id
              and m.destinatario_id = ${usuarioId} and m.leido_en is null
              and m.activo))::int as sin_leer
        from mensaje_hilos h
        where h.activo
          and (h.iniciador_id = ${usuarioId} or h.receptor_id = ${usuarioId})`,
    ])

    return { filas, total, pagina, tableros: tableros[0] }
  })
}

export type Mensaje = {
  id: string
  cuerpo: string
  autor_id: string
  autor: string | null
  autor_perfil: string | null
  mio: boolean
  leido_en: string | null
  creado_en: string
}

export type Hilo = {
  id: string
  asunto: string
  peticion_id: string | null
  folio: string | null
  peticion_descripcion: string | null
  peticion_estatus: string | null
  contraparte: string | null
  contraparte_perfil: string | null
  archivado: boolean
  creado_en: string
}

/**
 * Un hilo y sus mensajes. Devuelve null si el usuario no es parte de la
 * conversación: el aislamiento por cliente lo da RLS, pero dentro de un
 * mismo cliente los recados ajenos tampoco se leen.
 */
export async function leerHilo(tenantId: string, usuarioId: string, hiloId: string) {
  return conTenant(tenantId, async (tx) => {
    const [hilo] = await tx<Hilo[]>`
      select h.id, h.asunto, h.peticion_id,
             upper(substr(h.peticion_id::text, 1, 6)) as folio,
             p.descripcion as peticion_descripcion,
             e.descripcion as peticion_estatus,
             nullif(btrim(concat_ws(' ', o.nombre, o.apellido_paterno)), '') as contraparte,
             o.perfil_clave as contraparte_perfil,
             h.archivado_en is not null as archivado,
             h.creado_en::text as creado_en
      from mensaje_hilos h
      join usuarios o on o.id = case when h.iniciador_id = ${usuarioId}
                                     then h.receptor_id else h.iniciador_id end
      left join peticiones p on p.id = h.peticion_id
      left join estatus_peticiones e on e.id = p.estatus_id
      where h.id = ${hiloId} and h.activo
        and (h.iniciador_id = ${usuarioId} or h.receptor_id = ${usuarioId})`

    if (!hilo) return null

    const mensajes = await tx<Mensaje[]>`
      select m.id, m.cuerpo, m.autor_id,
             nullif(btrim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as autor,
             u.perfil_clave as autor_perfil,
             m.autor_id = ${usuarioId} as mio,
             m.leido_en::text as leido_en,
             m.creado_en::text as creado_en
      from mensajes m
      join usuarios u on u.id = m.autor_id
      where m.hilo_id = ${hiloId} and m.activo
      order by m.creado_en`

    return { hilo, mensajes }
  })
}

/**
 * Mensajes de una petición, para enseñarlos en su detalle.
 *
 * Aquí no se filtra por participante a propósito: quien abre el
 * expediente necesita saber qué se ha hablado de él. Se enseña el
 * asunto y quiénes conversan, no el cuerpo de los mensajes.
 */
export type HiloDePeticion = {
  id: string
  asunto: string
  entre: string
  mensajes: number
  ultimo_en: string
  mio: boolean
}

export async function hilosDePeticion(
  tenantId: string,
  usuarioId: string,
  peticionId: string,
) {
  return conTenant(tenantId, (tx) =>
    tx<HiloDePeticion[]>`
      select h.id, h.asunto,
             concat_ws(' · ',
               nullif(btrim(concat_ws(' ', a.nombre, a.apellido_paterno)), ''),
               nullif(btrim(concat_ws(' ', b.nombre, b.apellido_paterno)), '')) as entre,
             (select count(*)::int from mensajes m
               where m.hilo_id = h.id and m.activo) as mensajes,
             h.ultimo_en::text as ultimo_en,
             (h.iniciador_id = ${usuarioId} or h.receptor_id = ${usuarioId}) as mio
      from mensaje_hilos h
      join usuarios a on a.id = h.iniciador_id
      join usuarios b on b.id = h.receptor_id
      where h.peticion_id = ${peticionId} and h.activo and h.archivado_en is null
      order by h.ultimo_en desc
      limit 10`,
  )
}

export type Companiero = {
  id: string
  nombre: string
  perfil_clave: string
}

/** Con quién se puede hablar: el resto del equipo de este cliente. */
export async function companieros(tenantId: string, usuarioId: string) {
  return conTenant(tenantId, (tx) =>
    tx<Companiero[]>`
      select u.id,
             btrim(concat_ws(' ', u.nombre, u.apellido_paterno, u.apellido_materno)) as nombre,
             u.perfil_clave
      from usuarios u
      where u.activo and u.id <> ${usuarioId}
      order by u.nombre, u.apellido_paterno`,
  )
}

export type PeticionCorta = {
  id: string
  folio: string
  etiqueta: string
}

/**
 * Peticiones que se pueden citar al escribir.
 *
 * Son miles: se ofrecen las recientes y, si se llega desde el detalle de
 * una, esa va por delante aunque sea vieja.
 */
export async function peticionesCitables(
  tenantId: string,
  peticionId: string | undefined,
) {
  return conTenant(tenantId, (tx) =>
    tx<PeticionCorta[]>`
      select p.id,
             upper(substr(p.id::text, 1, 6)) as folio,
             btrim(concat_ws(' · ',
               nullif(btrim(coalesce(c.nombre_completo,
                 concat_ws(' ', c.nombre, c.apellido_paterno))), ''),
               pr.titulo)) as etiqueta
      from peticiones p
      left join ciudadanos c on c.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      where p.activo
      order by (p.id = ${peticionId ?? null}::uuid) desc, p.fecha_apertura desc
      limit 60`,
  )
}
