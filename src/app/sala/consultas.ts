import 'server-only'
import { conTenant } from '@/lib/db'

export type Pulso = {
  totales: {
    total: number
    abiertas: number
    completadas: number
    urgentes: number
    hoy: number
    semana: number
  }
  diasResolucion: { mediana: number | null; previa: number | null }
  porMes: { etiqueta: string; valor: number }[]
  porProblematica: { etiqueta: string; valor: number }[]
  porColonia: { etiqueta: string; valor: number }[]
  urgentes: {
    id: string
    folio: string
    ciudadano: string | null
    colonia: string | null
    problematica: string | null
    dias: number
  }[]
}

export async function pulsoDeLaOperacion(tenantId: string): Promise<Pulso> {
  return conTenant(tenantId, async (tx) => {
    const [totales, resolucion, porMes, porProblematica, porColonia, urgentes] =
      await Promise.all([
        tx<Pulso['totales'][]>`
          select count(*)::int as total,
                 count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión'))::int as abiertas,
                 count(*) filter (where e.descripcion = 'Completada')::int as completadas,
                 count(*) filter (where pri.descripcion = 'Urgente' and e.descripcion <> 'Completada')::int as urgentes,
                 count(*) filter (where p.fecha_apertura >= current_date)::int as hoy,
                 count(*) filter (where p.fecha_apertura >= current_date - interval '7 days')::int as semana
          from peticiones p
          left join estatus_peticiones e on e.id = p.estatus_id
          left join prioridades pri on pri.id = p.prioridad_id`,

        // Mediana de días para resolver, trimestre en curso contra el anterior.
        //
        // Solo cuentan las Completadas: una petición cancelada también
        // lleva fecha de cierre, y suele cancelarse rápido, así que
        // incluirlas hacía parecer al equipo más veloz de lo que es.
        tx<{ mediana: number | null; previa: number | null }[]>`
          select
            percentile_cont(0.5) within group (
              order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
            ) filter (where p.fecha_cierre >= current_date - interval '3 months')::float8 as mediana,
            percentile_cont(0.5) within group (
              order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
            ) filter (where p.fecha_cierre >= current_date - interval '6 months'
                        and p.fecha_cierre <  current_date - interval '3 months')::float8 as previa
          from peticiones p
          join estatus_peticiones e on e.id = p.estatus_id
          where e.descripcion = 'Completada'
            and p.fecha_cierre is not null
            and p.fecha_cierre >= p.fecha_apertura`,

        tx<{ etiqueta: string; valor: number }[]>`
          select mes::date::text as etiqueta, coalesce(c.n, 0)::int as valor
          from generate_series(
                 date_trunc('month', now()) - interval '11 months',
                 date_trunc('month', now()),
                 interval '1 month') as mes
          left join (
            select date_trunc('month', fecha_apertura) as m, count(*) as n
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
          group by 1 order by 2 desc limit 7`,

        tx<Pulso['urgentes']>`
          select p.id,
                 upper(substr(p.id::text, 1, 6)) as folio,
                 nullif(trim(coalesce(ci.nombre_completo,
                   concat_ws(' ', ci.nombre, ci.apellido_paterno))), '') as ciudadano,
                 ci.colonia,
                 pr.titulo as problematica,
                 greatest(0, extract(day from (now() - p.fecha_apertura))::int) as dias
          from peticiones p
          left join ciudadanos ci on ci.id = p.ciudadano_id
          left join problematicas pr on pr.id = p.problematica_id
          left join estatus_peticiones e on e.id = p.estatus_id
          left join prioridades pri on pri.id = p.prioridad_id
          where pri.descripcion = 'Urgente' and e.descripcion <> 'Completada'
          order by p.fecha_apertura
          limit 7`,
      ])

    return {
      totales: totales[0] ?? { total: 0, abiertas: 0, completadas: 0, urgentes: 0, hoy: 0, semana: 0 },
      diasResolucion: {
        mediana: resolucion[0]?.mediana !== null && resolucion[0]?.mediana !== undefined
          ? Math.round(Number(resolucion[0].mediana) * 10) / 10 : null,
        previa: resolucion[0]?.previa !== null && resolucion[0]?.previa !== undefined
          ? Math.round(Number(resolucion[0].previa) * 10) / 10 : null,
      },
      porMes,
      porProblematica,
      porColonia,
      urgentes,
    }
  })
}
