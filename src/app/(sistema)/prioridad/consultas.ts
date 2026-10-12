import 'server-only'
import { conTenant, sinTenant } from '@/lib/db'
import { ANIO, fuerzaSql, type Eleccion } from '@/lib/electoral'
import { calcularPrioridad, type SeccionCruda, type SeccionPriorizada } from './indice'

export { ELECCIONES, esEleccion, type Eleccion } from '@/lib/electoral'

export type DistritoPriorizado = {
  clave: string
  cabecera: string | null
  secciones: number
  indice: number
  lista_nominal: number
  sin_resolver: number
  sin_estructura: number
  margen: number | null
}

/**
 * El lado electoral, sección por sección. Catálogo global: sin tenant.
 *
 * El margen sale sobre votos válidos y con las coaliciones ya sumadas al
 * partido que las encabeza; de otro modo una sección donde el PRI y su
 * coalición van separados parece más competida de lo que fue.
 */
async function electoralPorSeccion(estadoId: string, eleccion: Eleccion) {
  const fuerza = fuerzaSql(sinTenant)

  return sinTenant<
    Omit<SeccionCruda, 'peticiones' | 'sin_resolver' | 'movilizadores'>[]
  >`
    with sec as (
      select s.id, s.clave, s.lista_nominal,
             m.nombre as municipio,
             d.clave as distrito, d.cabecera
      from secciones s
      join municipios m on m.id = s.municipio_id
      left join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
      where s.estado_id = ${estadoId}),
    fuerzas as (
      select r.seccion_id, ${fuerza} as fuerza, sum(r.votos)::int as votos
      from resultados_historicos r
      where r.anio = ${ANIO} and r.eleccion = ${eleccion}
      group by 1, 2),
    lugar as (
      select seccion_id, fuerza, votos,
             row_number() over (partition by seccion_id order by votos desc, fuerza) as n
      from fuerzas)
    select sec.id, sec.clave, sec.municipio, sec.distrito, sec.cabecera, sec.lista_nominal,
           round(100.0 * t.total_votos / nullif(sec.lista_nominal, 0), 1)::float8 as participacion,
           round(100.0 * (g1.votos - coalesce(g2.votos, 0)) / nullif(t.votos_validos, 0), 1)::float8 as margen
    from sec
    left join resultados_seccion_totales t
      on t.seccion_id = sec.id and t.anio = ${ANIO} and t.eleccion = ${eleccion}
    left join lugar g1 on g1.seccion_id = sec.id and g1.n = 1
    left join lugar g2 on g2.seccion_id = sec.id and g2.n = 2`
}

/** Lo capturado por el cliente, sección por sección. Bajo RLS. */
async function propioPorSeccion(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const [peticiones, movilizadores] = await Promise.all([
      tx<{ seccion_id: string; peticiones: number; sin_resolver: number }[]>`
        select p.seccion_id,
               count(*)::int as peticiones,
               count(*) filter (
                 where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
               )::int as sin_resolver
        from peticiones p
        left join estatus_peticiones e on e.id = p.estatus_id
        where p.seccion_id is not null
        group by p.seccion_id`,

      tx<{ seccion_id: string; n: number }[]>`
        select c.seccion_id, count(distinct m.id)::int as n
        from movilizadores m
        join ciudadanos c on c.id = m.ciudadano_id
        where c.seccion_id is not null and m.activo
        group by c.seccion_id`,
    ])

    return { peticiones, movilizadores }
  })
}

/** Las 2,602 secciones con su índice. El cálculo vive en `indice.ts`. */
export async function seccionesPriorizadas(
  tenantId: string,
  estadoId: string | null,
  eleccion: Eleccion,
): Promise<SeccionPriorizada[]> {
  if (!estadoId) return []

  const [electoral, propio] = await Promise.all([
    electoralPorSeccion(estadoId, eleccion),
    propioPorSeccion(tenantId),
  ])

  const pet = new Map(propio.peticiones.map((p) => [p.seccion_id, p]))
  const mov = new Map(propio.movilizadores.map((m) => [m.seccion_id, m.n]))

  return calcularPrioridad(
    electoral.map((s) => ({
      ...s,
      peticiones: pet.get(s.id)?.peticiones ?? 0,
      sin_resolver: pet.get(s.id)?.sin_resolver ?? 0,
      movilizadores: mov.get(s.id) ?? 0,
    })),
  )
}

/**
 * El índice del distrito es el de sus secciones ponderado por padrón: una
 * sección de 3,000 electores pesa más que una de 300. El promedio simple
 * dejaría que un puñado de secciones diminutas arrastrara al distrito.
 */
export function agruparPorDistrito(secciones: SeccionPriorizada[]): DistritoPriorizado[] {
  const grupos = new Map<string, SeccionPriorizada[]>()
  for (const s of secciones) {
    if (!s.distrito) continue
    const g = grupos.get(s.distrito)
    if (g) g.push(s)
    else grupos.set(s.distrito, [s])
  }

  return [...grupos.entries()]
    .map(([clave, filas]) => {
      const padron = filas.reduce((a, s) => a + (s.lista_nominal ?? 0), 0)
      const indice = padron
        ? filas.reduce((a, s) => a + s.indice * (s.lista_nominal ?? 0), 0) / padron
        : filas.reduce((a, s) => a + s.indice, 0) / filas.length

      const conMargen = filas.filter((s) => s.margen !== null)

      return {
        clave,
        cabecera: filas[0].cabecera,
        secciones: filas.length,
        indice: Math.round(indice * 10) / 10,
        lista_nominal: padron,
        sin_resolver: filas.reduce((a, s) => a + s.sin_resolver, 0),
        sin_estructura: filas.filter((s) => s.movilizadores === 0).length,
        margen: conMargen.length
          ? Math.round((conMargen.reduce((a, s) => a + (s.margen ?? 0), 0) / conMargen.length) * 10) / 10
          : null,
      }
    })
    .sort((a, b) => b.indice - a.indice)
}
