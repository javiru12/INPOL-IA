import 'server-only'
import { conTenant } from '@/lib/db'
import { zonaDeEstado } from '@/lib/zona'
import { ANIO, fuerzaSql } from '@/lib/electoral'

export type ResumenPanel = {
  porMunicipio: { clave: string; nombre: string; peticiones: number }[]
  porEstatus: { etiqueta: string; valor: number }[]
  porMes: { etiqueta: string; valor: number }[]
  porProblematica: { etiqueta: string; valor: number }[]
  porColonia: { etiqueta: string; valor: number }[]
  recientes: {
    id: string
    ciudadano: string | null
    problematica: string | null
    colonia: string | null
    estatus: string | null
    prioridad: string | null
    fecha: string
  }[]
  totales: { total: number; abiertas: number; completadas: number; urgentes: number }
}

export async function resumenDelPanel(
  tenantId: string,
  estadoClave?: string | null,
): Promise<ResumenPanel> {
  const zona = zonaDeEstado(estadoClave)
  return conTenant(tenantId, async (tx) => {
    const [porEstatus, porMes, porProblematica, porColonia, recientes, totales, porMunicipio] =
      await Promise.all([
        tx<{ etiqueta: string; valor: number }[]>`
          select coalesce(e.descripcion, 'Sin estatus') as etiqueta, count(*)::int as valor
          from peticiones p
          left join estatus_peticiones e on e.id = p.estatus_id
          group by 1 order by 2 desc`,

        // El mes se agrupa en la hora del estado del cliente, igual que
        // lo filtra la lista: en UTC, una petición de las 9 de la noche
        // del último día del mes cuenta en el mes siguiente y la barra
        // deja de cuadrar con la lista que abre al darle doble clic.
        tx<{ etiqueta: string; valor: number }[]>`
          select mes::date::text as etiqueta, coalesce(c.n, 0)::int as valor
          from generate_series(
                 date_trunc('month', now() at time zone ${zona}) - interval '11 months',
                 date_trunc('month', now() at time zone ${zona}),
                 interval '1 month') as mes
          left join (
            select date_trunc('month', fecha_apertura at time zone ${zona}) as m,
                   count(*) as n
            from peticiones group by 1
          ) c on c.m = mes
          order by mes`,

        tx<{ etiqueta: string; valor: number }[]>`
          select pr.titulo as etiqueta, count(*)::int as valor
          from peticiones p
          join problematicas pr on pr.id = p.problematica_id
          group by 1 order by 2 desc`,

        tx<{ etiqueta: string; valor: number }[]>`
          select ci.colonia as etiqueta, count(*)::int as valor
          from peticiones p
          join ciudadanos ci on ci.id = p.ciudadano_id
          where ci.colonia is not null
          group by 1 order by 2 desc limit 8`,

        tx<ResumenPanel['recientes']>`
          select p.id,
                 nullif(trim(concat_ws(' ', ci.nombre, ci.apellido_paterno)), '') as ciudadano,
                 pr.titulo as problematica,
                 ci.colonia,
                 e.descripcion as estatus,
                 pri.descripcion as prioridad,
                 p.fecha_apertura::text as fecha
          from peticiones p
          left join ciudadanos ci on ci.id = p.ciudadano_id
          left join problematicas pr on pr.id = p.problematica_id
          left join estatus_peticiones e on e.id = p.estatus_id
          left join prioridades pri on pri.id = p.prioridad_id
          order by p.fecha_apertura desc nulls last
          limit 8`,

        tx<ResumenPanel['totales'][]>`
          select count(*)::int as total,
                 count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión'))::int as abiertas,
                 count(*) filter (where e.descripcion = 'Completada')::int as completadas,
                 count(*) filter (where pri.descripcion = 'Urgente'
                                    and e.descripcion <> 'Completada')::int as urgentes
          from peticiones p
          left join estatus_peticiones e on e.id = p.estatus_id
          left join prioridades pri on pri.id = p.prioridad_id`,
        tx<ResumenPanel['porMunicipio']>`
          select m.clave, m.nombre, count(p.id)::int as peticiones
          from peticiones p
          join secciones s on s.id = p.seccion_id
          join municipios m on m.id = s.municipio_id
          group by m.clave, m.nombre
          order by 3 desc`,
      ])

    return {
      porMunicipio,
      porEstatus,
      porMes,
      porProblematica,
      porColonia,
      recientes,
      totales: totales[0] ?? { total: 0, abiertas: 0, completadas: 0, urgentes: 0 },
    }
  })
}

export type FocoElectoral = {
  sin_resolver_disputado: number
  sin_resolver_total: number
  secciones_disputadas: number
  distritos: { clave: string; cabecera: string | null; sin_resolver: number; margen: number }[]
}

/**
 * Lo que conecta la gestión social con el mapa electoral: cuánta deuda
 * pendiente está parada justo en el territorio que se decide por nada.
 *
 * No afirma que resolver peticiones mueva el voto —las peticiones de hoy son
 * posteriores a la elección de 2015, así que ese efecto no se puede medir con
 * estos datos—. Responde algo más modesto y verificable: si el esfuerzo está
 * cayendo donde la elección estuvo cerrada o donde ya estaba decidida.
 */
const MARGEN_DISPUTADO = 10

export async function focoElectoral(
  tenantId: string,
  estadoId: string | null,
): Promise<FocoElectoral | null> {
  if (!estadoId) return null

  return conTenant(tenantId, async (tx) => {
    const fuerza = fuerzaSql(tx)

    const margen = tx`
      with fuerzas as (
        select r.seccion_id, ${fuerza} as fza, sum(r.votos)::int as votos
        from resultados_historicos r
        join secciones s on s.id = r.seccion_id and s.estado_id = ${estadoId}
        where r.anio = ${ANIO} and r.eleccion = 'gobernador'
        group by 1, 2),
      lugar as (
        select seccion_id, votos,
               row_number() over (partition by seccion_id order by votos desc, fza) as n
        from fuerzas),
      margen as (
        select g1.seccion_id,
               (100.0 * (g1.votos - coalesce(g2.votos, 0)) / nullif(t.votos_validos, 0))::float8 as pts
        from lugar g1
        left join lugar g2 on g2.seccion_id = g1.seccion_id and g2.n = 2
        join resultados_seccion_totales t
          on t.seccion_id = g1.seccion_id and t.anio = ${ANIO} and t.eleccion = 'gobernador'
        where g1.n = 1)`

    const [[totales], distritos] = await Promise.all([
      tx<{ disputado: number; total: number; secciones: number }[]>`
        ${margen}
        select count(*) filter (
                 where m.pts < ${MARGEN_DISPUTADO}
                   and coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
               )::int as disputado,
               count(*) filter (
                 where coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
               )::int as total,
               count(distinct m.seccion_id) filter (where m.pts < ${MARGEN_DISPUTADO})::int as secciones
        from peticiones p
        join secciones s on s.id = p.seccion_id
        left join margen m on m.seccion_id = s.id
        left join estatus_peticiones e on e.id = p.estatus_id`,

      tx<{ clave: string; cabecera: string | null; sin_resolver: number; margen: number }[]>`
        ${margen}
        select d.clave, d.cabecera,
               count(*)::int as sin_resolver,
               round(avg(m.pts)::numeric, 1)::float8 as margen
        from peticiones p
        join secciones s on s.id = p.seccion_id
        join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
        join margen m on m.seccion_id = s.id
        left join estatus_peticiones e on e.id = p.estatus_id
        where m.pts < ${MARGEN_DISPUTADO}
          and coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')
        group by d.clave, d.cabecera
        order by sin_resolver desc
        limit 4`,
    ])

    return {
      sin_resolver_disputado: totales?.disputado ?? 0,
      sin_resolver_total: totales?.total ?? 0,
      secciones_disputadas: totales?.secciones ?? 0,
      distritos,
    }
  })
}
