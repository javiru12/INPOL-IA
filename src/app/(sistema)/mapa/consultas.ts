import 'server-only'
import { edadSql } from '@/lib/edades-sql'
import { RANGOS } from '@/lib/edades'
import { conTenant, sinTenant } from '@/lib/db'

export type Metrica =
  | 'peticiones'
  | 'ganador'
  | 'margen'
  | 'participacion'
  | 'lista_nominal'

export const METRICAS: { valor: Metrica; etiqueta: string; unidad: string; ayuda: string }[] = [
  { valor: 'peticiones', etiqueta: 'Peticiones capturadas', unidad: 'peticiones', ayuda: 'Demanda ciudadana levantada por la estructura' },
  { valor: 'ganador', etiqueta: 'Fuerza más votada 2015', unidad: 'votos', ayuda: 'Quién ganó la elección de gobernador en cada zona' },
  { valor: 'margen', etiqueta: 'Competitividad 2015', unidad: 'puntos de margen', ayuda: 'Distancia entre el primero y el segundo lugar' },
  { valor: 'participacion', etiqueta: 'Participación 2015', unidad: '% de participación', ayuda: 'Votos emitidos sobre lista nominal' },
  { valor: 'lista_nominal', etiqueta: 'Lista nominal 2015', unidad: 'electores', ayuda: 'Corte del INE de esa elección, no el padrón de hoy' },
]

export type Ambito = 'municipio' | 'distrito'

export type FilaRegion = {
  clave: string
  nombre: string
  peticiones: number
  ciudadanos: number
  /** Ciudadanos con teléfono móvil capturado: con quién se puede hablar. */
  con_telefono: number
  /** Cuántos ciudadanos caen en cada rango de edad. */
  edades: Record<string, number>
  secciones: number
  lista_nominal: number
  votos_totales: number
  participacion: number | null
  ganador: string | null
  votos_ganador: number
  segundo: string | null
  votos_segundo: number
  margen: number | null
}

/**
 * Agrega por municipio o por distrito local, cruzando lo que captura el
 * cliente con el histórico electoral del INE.
 *
 * Las peticiones y los ciudadanos van dentro de `conTenant` porque están
 * bajo Row Level Security; la geografía y los resultados son catálogo
 * global y los mismos para todos.
 */
export async function regionesConDatos(
  tenantId: string,
  estadoId: string | null,
  ambito: Ambito,
): Promise<FilaRegion[]> {
  // La cartografía es pública, pero cada cliente solo ve la de su estado.
  if (!estadoId) return []

  const electoral = await sinTenant<
    Omit<FilaRegion, 'peticiones' | 'ciudadanos'>[]
  >`
    with base as (
      select s.id as seccion_id,
             ${ambito === 'municipio' ? sinTenant`m.clave` : sinTenant`d.clave`} as clave,
             ${ambito === 'municipio' ? sinTenant`m.nombre` : sinTenant`d.nombre`} as nombre,
             s.lista_nominal
      from secciones s
      ${ambito === 'municipio'
        ? sinTenant`join municipios m on m.id = s.municipio_id`
        : sinTenant`join distritos d on d.id = s.distrito_local_id`}
      where s.estado_id = ${estadoId}
    ),
    votos as (
      select b.clave, r.partido, sum(r.votos)::int as votos
      from base b
      join resultados_historicos r on r.seccion_id = b.seccion_id
      where r.anio = 2015 and r.eleccion = 'gobernador'
      group by 1, 2
    ),
    ordenados as (
      select clave, partido, votos,
             row_number() over (partition by clave order by votos desc) as lugar
      from votos
    ),
    totales as (
      select b.clave,
             min(b.nombre) as nombre,
             count(*)::int as secciones,
             sum(b.lista_nominal)::int as lista_nominal,
             coalesce(sum(t.total_votos), 0)::int as votos_totales
      from base b
      left join resultados_seccion_totales t
        on t.seccion_id = b.seccion_id and t.anio = 2015 and t.eleccion = 'gobernador'
      group by b.clave
    )
    select t.clave,
           t.nombre,
           t.secciones,
           t.lista_nominal,
           t.votos_totales,
           case when t.lista_nominal > 0
                then round((t.votos_totales::numeric / t.lista_nominal) * 100, 1)::float8
                else null end as participacion,
           p1.partido as ganador,
           coalesce(p1.votos, 0)::int as votos_ganador,
           p2.partido as segundo,
           coalesce(p2.votos, 0)::int as votos_segundo,
           case when t.votos_totales > 0 and p1.votos is not null
                then round(((p1.votos - coalesce(p2.votos, 0))::numeric / t.votos_totales) * 100, 1)::float8
                else null end as margen
    from totales t
    left join ordenados p1 on p1.clave = t.clave and p1.lugar = 1
    left join ordenados p2 on p2.clave = t.clave and p2.lugar = 2
    order by t.nombre`

  const propios = await conTenant(tenantId, (tx) =>
    tx<{ clave: string; peticiones: number; ciudadanos: number; con_telefono: number }[]>`
      select ${ambito === 'municipio' ? tx`m.clave` : tx`d.clave`} as clave,
             count(distinct p.id)::int as peticiones,
             count(distinct ci.id)::int as ciudadanos,
             count(distinct ci.id) filter (
               where nullif(trim(ci.telefono_movil), '') is not null
             )::int as con_telefono
      from secciones s
      ${ambito === 'municipio'
        ? tx`join municipios m on m.id = s.municipio_id`
        : tx`join distritos d on d.id = s.distrito_local_id`}
      left join ciudadanos ci on ci.seccion_id = s.id
      left join peticiones p on p.seccion_id = s.id
      where s.estado_id = ${estadoId}
      group by 1`,
  )

  // Los segmentos de edad salen aparte y se arman en JavaScript. Meterlos
  // en la consulta de arriba como un objeto JSON obligaba a interpolar un
  // fragmento por rango, y el driver no los separa con comas: la consulta
  // salía con un paréntesis mal puesto y la pantalla entera daba 500.
  const porEdad = await conTenant(tenantId, (tx) =>
    tx<{ clave: string; rango: string; n: number }[]>`
      select ${ambito === 'municipio' ? tx`m.clave` : tx`d.clave`} as clave,
             case
               ${RANGOS.map(
                 (r) => tx`when ${edadSql(tx)} between ${r.desde} and ${r.hasta} then ${r.clave}`,
               )}
             end as rango,
             count(distinct ci.id)::int as n
      from secciones s
      ${ambito === 'municipio'
        ? tx`join municipios m on m.id = s.municipio_id`
        : tx`join distritos d on d.id = s.distrito_local_id`}
      join ciudadanos ci on ci.seccion_id = s.id
      where s.estado_id = ${estadoId}
      group by 1, 2`,
  )

  const edadesPorClave = new Map<string, Record<string, number>>()
  for (const f of porEdad) {
    if (!f.rango) continue
    const actual = edadesPorClave.get(f.clave) ?? {}
    actual[f.rango] = f.n
    edadesPorClave.set(f.clave, actual)
  }

  const porClave = new Map(propios.map((p) => [p.clave, p]))

  return electoral.map((e) => ({
    ...e,
    peticiones: porClave.get(e.clave)?.peticiones ?? 0,
    ciudadanos: porClave.get(e.clave)?.ciudadanos ?? 0,
    con_telefono: porClave.get(e.clave)?.con_telefono ?? 0,
    edades: edadesPorClave.get(e.clave) ?? {},
  }))
}

/** Cobertura nacional: en qué estados hay operación cargada. */
export async function coberturaNacional() {
  return sinTenant<{ clave: string; nombre: string; secciones: number }[]>`
    select e.clave, e.nombre, count(s.id)::int as secciones
    from estados e
    left join secciones s on s.estado_id = e.id
    group by e.clave, e.nombre
    order by e.nombre`
}
