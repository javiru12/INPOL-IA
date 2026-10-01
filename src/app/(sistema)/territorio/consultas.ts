import 'server-only'
import { conTenant, sinTenant } from '@/lib/db'

/** Elección de referencia: es la única con resultados cargados hoy. */
const ANIO = 2015
const ELECCION = 'gobernador'

export const POR_PAGINA = 30

export type Orden = 'peticiones' | 'lista' | 'participacion'

export type FiltrosTerritorio = {
  municipio?: string
  distrito?: string
  orden?: Orden
  pagina?: number
}

export type FilaSeccion = {
  id: string
  clave: string
  municipio: string
  distrito: string | null
  lista_nominal: number | null
  peticiones: number
  ciudadanos: number
  participacion: number | null
  partido: string | null
  partido_votos: number | null
}

export type Indicadores = {
  secciones: number
  con_peticiones: number
  lista_nominal: number
  peticiones: number
  maximo_peticiones: number
}

export type SeccionPrioritaria = {
  clave: string
  municipio: string
  distrito: string | null
  sin_resolver: number
  total: number
}

/**
 * Padrón de secciones cruzado con lo capturado por el cliente.
 *
 * Va dentro de `conTenant` porque toca peticiones y ciudadanos: el RLS
 * sigue aplicando a esas dos tablas aunque la consulta arranque del
 * catálogo global de secciones. Las secciones sin datos del cliente
 * salen igual, con sus cifras del INE y ceros en las columnas propias.
 */
export async function listarSecciones(tenantId: string, f: FiltrosTerritorio) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    const previas = tx`
      with pet as (
        select p.seccion_id,
               count(*)::int as n
        from peticiones p
        where p.seccion_id is not null
        group by 1),
      ciu as (
        select c.seccion_id, count(*)::int as n
        from ciudadanos c
        where c.seccion_id is not null
        group by 1),
      ganador as (
        select distinct on (seccion_id) seccion_id, partido, votos
        from resultados_historicos
        where anio = ${ANIO} and eleccion = ${ELECCION}
        order by seccion_id, votos desc, partido)`

    const desde = tx`
      from secciones s
      join municipios m on m.id = s.municipio_id
      left join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
      left join resultados_seccion_totales r
        on r.seccion_id = s.id and r.anio = ${ANIO} and r.eleccion = ${ELECCION}
      left join ganador g on g.seccion_id = s.id
      left join pet on pet.seccion_id = s.id
      left join ciu on ciu.seccion_id = s.id`

    const donde = tx`
      where (${f.municipio ?? null}::text is null or m.nombre = ${f.municipio ?? null})
        and (${f.distrito ?? null}::text is null or d.clave = ${f.distrito ?? null})`

    // La participación es votos emitidos sobre lista nominal de la misma
    // fila del INE; `secciones.lista_nominal` es copia de ese mismo dato.
    const participacion = tx`
      round(100.0 * r.total_votos / nullif(s.lista_nominal, 0), 1)::float8`

    const orden =
      f.orden === 'lista'
        ? tx`order by s.lista_nominal desc nulls last, s.clave`
        : f.orden === 'participacion'
          ? tx`order by ${participacion} desc nulls last, s.clave`
          : tx`order by coalesce(pet.n, 0) desc, s.lista_nominal desc nulls last, s.clave`

    const [filas, [indicadores]] = await Promise.all([
      tx<FilaSeccion[]>`
        ${previas}
        select s.id,
               s.clave,
               m.nombre as municipio,
               d.clave as distrito,
               s.lista_nominal,
               coalesce(pet.n, 0) as peticiones,
               coalesce(ciu.n, 0) as ciudadanos,
               ${participacion} as participacion,
               g.partido,
               g.votos as partido_votos
        ${desde} ${donde} ${orden}
        limit ${POR_PAGINA} offset ${salto}`,

      tx<Indicadores[]>`
        ${previas}
        select count(*)::int as secciones,
               count(*) filter (where coalesce(pet.n, 0) > 0)::int as con_peticiones,
               coalesce(sum(s.lista_nominal), 0)::int as lista_nominal,
               coalesce(sum(coalesce(pet.n, 0)), 0)::int as peticiones,
               coalesce(max(coalesce(pet.n, 0)), 0)::int as maximo_peticiones
        ${desde} ${donde}`,
    ])

    return { filas, pagina, indicadores }
  })
}

/**
 * Dónde hay que mandar gente: secciones con más peticiones todavía sin
 * resolver. «Sin resolver» es todo lo que no quedó completado ni
 * cancelado, incluida la petición que nadie ha interpretado.
 */
export async function seccionesPrioritarias(tenantId: string, f: FiltrosTerritorio) {
  return conTenant(tenantId, (tx) =>
    tx<SeccionPrioritaria[]>`
      select s.clave,
             m.nombre as municipio,
             d.clave as distrito,
             count(*) filter (
               where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
             )::int as sin_resolver,
             count(*)::int as total
      from peticiones p
      join secciones s on s.id = p.seccion_id
      join municipios m on m.id = s.municipio_id
      left join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
      left join estatus_peticiones e on e.id = p.estatus_id
      where (${f.municipio ?? null}::text is null or m.nombre = ${f.municipio ?? null})
        and (${f.distrito ?? null}::text is null or d.clave = ${f.distrito ?? null})
      group by 1, 2, 3
      having count(*) filter (
               where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
             ) > 0
      order by sin_resolver desc, total desc, s.clave
      limit 10`,
  )
}

/**
 * Participación histórica por distrito local. Solo catálogo global: no
 * hay nada del cliente aquí, así que va por `sinTenant`.
 */
export async function participacionPorDistrito(f: FiltrosTerritorio) {
  return sinTenant<{ etiqueta: string; valor: number }[]>`
    select 'Distrito ' || d.clave as etiqueta,
           round(100.0 * sum(r.total_votos) / nullif(sum(s.lista_nominal), 0), 1)::float8 as valor
    from distritos d
    join secciones s on s.distrito_local_id = d.id
    join municipios m on m.id = s.municipio_id
    join resultados_seccion_totales r
      on r.seccion_id = s.id and r.anio = ${ANIO} and r.eleccion = ${ELECCION}
    where d.ambito = 'local'
      and (${f.municipio ?? null}::text is null or m.nombre = ${f.municipio ?? null})
      and (${f.distrito ?? null}::text is null or d.clave = ${f.distrito ?? null})
    group by 1
    order by valor desc`
}

/** Opciones de los dos selectores. El de distritos se acota al municipio. */
export async function catalogosDeTerritorio(municipio?: string) {
  const [municipios, distritos] = await Promise.all([
    sinTenant<{ valor: string; etiqueta: string; conteo: number }[]>`
      select m.nombre as valor, m.nombre as etiqueta, count(s.id)::int as conteo
      from municipios m
      join secciones s on s.municipio_id = m.id
      group by 1, 2
      order by 1`,

    sinTenant<{ valor: string; etiqueta: string; conteo: number }[]>`
      select d.clave as valor, 'Distrito ' || d.clave as etiqueta, count(s.id)::int as conteo
      from distritos d
      join secciones s on s.distrito_local_id = d.id
      join municipios m on m.id = s.municipio_id
      where d.ambito = 'local'
        and (${municipio ?? null}::text is null or m.nombre = ${municipio ?? null})
      group by 1, 2
      order by 1`,
  ])

  return { municipios, distritos }
}
