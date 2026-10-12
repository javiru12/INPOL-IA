import 'server-only'
import { conTenant, sinTenant } from '@/lib/db'
import { ANIO, fuerzaSql } from '@/lib/electoral'

export { ELECCIONES, esEleccion, type Eleccion } from '@/lib/electoral'
import type { Eleccion } from '@/lib/electoral'

/**
 * El distrito como unidad de análisis.
 *
 * `/territorio` lista las 2,602 secciones y deja filtrar; eso sirve para
 * buscar una sección, no para entender un distrito. Aquí la pregunta es
 * otra: cómo se comporta cada distrito, qué le pide la gente y quién lo
 * está trabajando.
 *
 * Dos cosas que esta pantalla hace distinto al resto del sistema:
 *
 * 1. **Suma las coaliciones al partido que las encabeza.** El INE reporta
 *    una fila por emblema marcado, así que el voto de la coalición viaja
 *    en claves propias (`PRI_PVEM`). Contarlas sueltas parte el voto.
 * 2. **Los porcentajes se calculan sobre votos válidos**, no sobre el
 *    total. El total incluye los nulos —2.15% en 2015— y mete un sesgo
 *    constante en cualquier comparación entre fuerzas.
 */

export type FilaDistrito = {
  clave: string
  nombre: string
  cabecera: string | null
  municipios: number
  secciones: number
  lista_nominal: number
  votos_validos: number
  total_votos: number
  participacion: number | null
  ganador: string | null
  pct_ganador: number | null
  segundo: string | null
  pct_segundo: number | null
  margen: number | null
  // Lo del cliente se pega después: el catálogo electoral es global.
  peticiones: number
  sin_resolver: number
  ciudadanos: number
  movilizadores: number
}

export type Fuerza = {
  fuerza: string
  votos: number
  porcentaje: number | null
}

export type SeccionDelDistrito = {
  id: string
  clave: string
  municipio: string
  lista_nominal: number | null
  total_votos: number
  participacion: number | null
  ganador: string | null
  peticiones: number
  sin_resolver: number
}

/**
 * Resultados por distrito. El catálogo del INE es público y compartido, así
 * que no lleva tenant; lo que sí lo acota es el estado donde opera el
 * cliente. Sin estado asignado no se devuelve nada: más vale una pantalla
 * vacía que enseñarle a un cliente el territorio de otro.
 */
async function electoralPorDistrito(estadoId: string, eleccion: Eleccion) {
  const fuerza = fuerzaSql(sinTenant)

  return sinTenant<Omit<FilaDistrito, 'peticiones' | 'sin_resolver' | 'ciudadanos' | 'movilizadores'>[]>`
    with sec as (
      select d.clave, d.nombre, d.cabecera,
             s.id as seccion_id, s.lista_nominal, s.municipio_id
      from distritos d
      join secciones s on s.distrito_local_id = d.id
      where d.ambito = 'local' and d.estado_id = ${estadoId}),
    fuerzas as (
      select sec.clave, ${fuerza} as fuerza, sum(r.votos)::int as votos
      from sec
      join resultados_historicos r on r.seccion_id = sec.seccion_id
      where r.anio = ${ANIO} and r.eleccion = ${eleccion}
      group by 1, 2),
    lugar as (
      select clave, fuerza, votos,
             row_number() over (partition by clave order by votos desc, fuerza) as n
      from fuerzas),
    totales as (
      select sec.clave,
             min(sec.nombre) as nombre,
             min(sec.cabecera) as cabecera,
             count(distinct sec.municipio_id)::int as municipios,
             count(*)::int as secciones,
             coalesce(sum(sec.lista_nominal), 0)::int as lista_nominal,
             coalesce(sum(t.votos_validos), 0)::int as votos_validos,
             coalesce(sum(t.total_votos), 0)::int as total_votos
      from sec
      left join resultados_seccion_totales t
        on t.seccion_id = sec.seccion_id and t.anio = ${ANIO} and t.eleccion = ${eleccion}
      group by sec.clave)
    select t.clave, t.nombre, t.cabecera, t.municipios, t.secciones,
           t.lista_nominal, t.votos_validos, t.total_votos,
           round(100.0 * t.total_votos / nullif(t.lista_nominal, 0), 1)::float8 as participacion,
           g1.fuerza as ganador,
           round(100.0 * g1.votos / nullif(t.votos_validos, 0), 1)::float8 as pct_ganador,
           g2.fuerza as segundo,
           round(100.0 * g2.votos / nullif(t.votos_validos, 0), 1)::float8 as pct_segundo,
           round(100.0 * (g1.votos - coalesce(g2.votos, 0)) / nullif(t.votos_validos, 0), 1)::float8 as margen
    from totales t
    left join lugar g1 on g1.clave = t.clave and g1.n = 1
    left join lugar g2 on g2.clave = t.clave and g2.n = 2
    order by t.clave`
}

/** Lo que el cliente capturó, por distrito. Va bajo RLS. */
async function propioPorDistrito(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const [peticiones, ciudadanos, movilizadores] = await Promise.all([
      tx<{ clave: string; peticiones: number; sin_resolver: number }[]>`
        select d.clave,
               count(*)::int as peticiones,
               count(*) filter (
                 where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
               )::int as sin_resolver
        from peticiones p
        join secciones s on s.id = p.seccion_id
        join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
        left join estatus_peticiones e on e.id = p.estatus_id
        group by d.clave`,

      tx<{ clave: string; n: number }[]>`
        select d.clave, count(*)::int as n
        from ciudadanos c
        join secciones s on s.id = c.seccion_id
        join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
        group by d.clave`,

      tx<{ clave: string; n: number }[]>`
        select d.clave, count(distinct m.id)::int as n
        from movilizadores m
        join ciudadanos c on c.id = m.ciudadano_id
        join secciones s on s.id = c.seccion_id
        join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
        where m.activo
        group by d.clave`,
    ])

    return { peticiones, ciudadanos, movilizadores }
  })
}

/** La tabla comparativa de los 26 distritos locales. */
export async function listarDistritos(
  tenantId: string,
  estadoId: string | null,
  eleccion: Eleccion,
): Promise<FilaDistrito[]> {
  if (!estadoId) return []

  const [electoral, propio] = await Promise.all([
    electoralPorDistrito(estadoId, eleccion),
    propioPorDistrito(tenantId),
  ])

  const pet = new Map(propio.peticiones.map((p) => [p.clave, p]))
  const ciu = new Map(propio.ciudadanos.map((c) => [c.clave, c.n]))
  const mov = new Map(propio.movilizadores.map((m) => [m.clave, m.n]))

  return electoral.map((d) => ({
    ...d,
    peticiones: pet.get(d.clave)?.peticiones ?? 0,
    sin_resolver: pet.get(d.clave)?.sin_resolver ?? 0,
    ciudadanos: ciu.get(d.clave) ?? 0,
    movilizadores: mov.get(d.clave) ?? 0,
  }))
}

/** Todas las fuerzas de un distrito, no solo el primero y el segundo. */
export async function fuerzasDelDistrito(estadoId: string, clave: string, eleccion: Eleccion) {
  const fuerza = fuerzaSql(sinTenant)

  return sinTenant<Fuerza[]>`
    with sec as (
      select s.id as seccion_id
      from distritos d
      join secciones s on s.distrito_local_id = d.id
      where d.ambito = 'local' and d.clave = ${clave} and d.estado_id = ${estadoId}),
    validos as (
      select coalesce(sum(t.votos_validos), 0)::int as n
      from sec
      join resultados_seccion_totales t
        on t.seccion_id = sec.seccion_id and t.anio = ${ANIO} and t.eleccion = ${eleccion})
    select ${fuerza} as fuerza,
           sum(r.votos)::int as votos,
           round(100.0 * sum(r.votos) / nullif((select n from validos), 0), 1)::float8 as porcentaje
    from sec
    join resultados_historicos r on r.seccion_id = sec.seccion_id
    where r.anio = ${ANIO} and r.eleccion = ${eleccion}
    group by 1
    having sum(r.votos) > 0
    order by votos desc`
}

/** Las secciones que componen el distrito, con lo capturado encima. */
export async function seccionesDelDistrito(
  tenantId: string,
  estadoId: string,
  clave: string,
  eleccion: Eleccion,
): Promise<SeccionDelDistrito[]> {
  return conTenant(tenantId, (tx) => {
    const fuerza = fuerzaSql(tx)

    return tx<SeccionDelDistrito[]>`
      with sec as (
        select s.id, s.clave, s.lista_nominal, m.nombre as municipio
        from distritos d
        join secciones s on s.distrito_local_id = d.id
        join municipios m on m.id = s.municipio_id
        where d.ambito = 'local' and d.clave = ${clave} and d.estado_id = ${estadoId}),
      ganador as (
        select distinct on (r.seccion_id) r.seccion_id, ${fuerza} as fuerza, r.votos
        from resultados_historicos r
        join sec on sec.id = r.seccion_id
        where r.anio = ${ANIO} and r.eleccion = ${eleccion}
        order by r.seccion_id, r.votos desc, r.partido),
      pet as (
        select p.seccion_id,
               count(*)::int as n,
               count(*) filter (
                 where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
               )::int as sin_resolver
        from peticiones p
        left join estatus_peticiones e on e.id = p.estatus_id
        where p.seccion_id is not null
        group by 1)
      select sec.id, sec.clave, sec.municipio, sec.lista_nominal,
             coalesce(t.total_votos, 0)::int as total_votos,
             round(100.0 * t.total_votos / nullif(sec.lista_nominal, 0), 1)::float8 as participacion,
             g.fuerza as ganador,
             coalesce(pet.n, 0) as peticiones,
             coalesce(pet.sin_resolver, 0) as sin_resolver
      from sec
      left join resultados_seccion_totales t
        on t.seccion_id = sec.id and t.anio = ${ANIO} and t.eleccion = ${eleccion}
      left join ganador g on g.seccion_id = sec.id
      left join pet on pet.seccion_id = sec.id
      order by coalesce(pet.sin_resolver, 0) desc, sec.lista_nominal desc nulls last, sec.clave`
  })
}

/** Qué le pide la gente a este distrito. */
export async function problematicasDelDistrito(tenantId: string, estadoId: string, clave: string) {
  return conTenant(tenantId, (tx) =>
    tx<{ etiqueta: string; valor: number }[]>`
      select coalesce(pr.titulo, 'Sin clasificar') as etiqueta,
             count(*)::int as valor
      from peticiones p
      join secciones s on s.id = p.seccion_id
      join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
      left join problematicas pr on pr.id = p.problematica_id
      where d.clave = ${clave}
      group by 1
      order by valor desc
      limit 8`,
  )
}

/** Datos de cabecera del distrito, o null si la clave no existe. */
export async function distrito(estadoId: string | null, clave: string) {
  if (!estadoId) return null
  const [d] = await sinTenant<{ clave: string; nombre: string; cabecera: string | null }[]>`
    select clave, nombre, cabecera
    from distritos
    where ambito = 'local' and clave = ${clave} and estado_id = ${estadoId}
    limit 1`
  return d ?? null
}
