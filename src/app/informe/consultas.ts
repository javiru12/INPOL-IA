import 'server-only'
import { conTenant } from '@/lib/db'

export type Informe = {
  periodo: { desde: string; hasta: string }
  totales: {
    capturadas: number
    resueltas: number
    vivas: number
    atoradas: number
    ciudadanos: number
    actividades: number
  }
  mediana: number | null
  medianaPrevia: number | null
  porMes: { etiqueta: string; recibidas: number; resueltas: number }[]
  porProblematica: { etiqueta: string; valor: number; mediana: number | null }[]
  porColonia: { etiqueta: string; valor: number }[]
  porDependencia: { etiqueta: string; valor: number; resueltas: number }[]
  responsables: { nombre: string; asignadas: number; resueltas: number; mediana: number | null }[]
}

/**
 * Datos del informe de gestión.
 *
 * El periodo cierra en el último mes completo: incluir el mes en curso
 * haría parecer que la demanda se desplomó el día que se imprime.
 */
export async function datosDelInforme(tenantId: string, meses = 12): Promise<Informe> {
  return conTenant(tenantId, async (tx) => {
    const [[periodo], [totales], [tiempos], porMes, porProblematica, porColonia, porDependencia, responsables] =
      await Promise.all([
        tx<{ desde: string; hasta: string }[]>`
          select (date_trunc('month', current_date) - make_interval(months => ${meses}))::date::text as desde,
                 (date_trunc('month', current_date) - interval '1 day')::date::text as hasta`,

        tx<Informe['totales'][]>`
          with ventana as (
            select p.*, e.descripcion as estatus, pri.descripcion as prioridad
            from peticiones p
            left join estatus_peticiones e on e.id = p.estatus_id
            left join prioridades pri on pri.id = p.prioridad_id
            where p.fecha_apertura >= date_trunc('month', current_date) - make_interval(months => ${meses})
              and p.fecha_apertura <  date_trunc('month', current_date)
          )
          select count(*)::int as capturadas,
                 count(*) filter (where estatus = 'Completada')::int as resueltas,
                 count(*) filter (where estatus in ('Abierta','En proceso','En gestión'))::int as vivas,
                 count(*) filter (where estatus in ('Abierta','En proceso','En gestión')
                                    and fecha_apertura < current_date - interval '30 days')::int as atoradas,
                 (select count(*)::int from ciudadanos) as ciudadanos,
                 ((select count(*) from recorridos where activo) +
                  (select count(*) from eventos where activo))::int as actividades
          from ventana`,

        tx<{ mediana: number | null; previa: number | null }[]>`
          select
            percentile_cont(0.5) within group (
              order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
            ) filter (where p.fecha_cierre >= date_trunc('month', current_date) - make_interval(months => ${meses}))::float8 as mediana,
            percentile_cont(0.5) within group (
              order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
            ) filter (where p.fecha_cierre <  date_trunc('month', current_date) - make_interval(months => ${meses}))::float8 as previa
          from peticiones p
          join estatus_peticiones e on e.id = p.estatus_id
          where e.descripcion = 'Completada' and p.fecha_cierre >= p.fecha_apertura`,

        tx<Informe['porMes']>`
          select to_char(mes, 'YYYY-MM-01') as etiqueta,
                 coalesce(r.n, 0)::int as recibidas,
                 coalesce(c.n, 0)::int as resueltas
          from generate_series(
                 date_trunc('month', current_date) - make_interval(months => ${meses}),
                 date_trunc('month', current_date) - interval '1 month',
                 interval '1 month') as mes
          left join (select date_trunc('month', fecha_apertura) as m, count(*) as n
                     from peticiones group by 1) r on r.m = mes
          left join (select date_trunc('month', p.fecha_cierre) as m, count(*) as n
                     from peticiones p join estatus_peticiones e on e.id = p.estatus_id
                     where e.descripcion = 'Completada' group by 1) c on c.m = mes
          order by mes`,

        tx<Informe['porProblematica']>`
          select pr.titulo as etiqueta,
                 count(*)::int as valor,
                 percentile_cont(0.5) within group (
                   order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
                 ) filter (where e.descripcion = 'Completada' and p.fecha_cierre is not null)::float8 as mediana
          from peticiones p
          join problematicas pr on pr.id = p.problematica_id
          left join estatus_peticiones e on e.id = p.estatus_id
          where p.fecha_apertura >= date_trunc('month', current_date) - make_interval(months => ${meses})
          group by 1 order by 2 desc`,

        tx<Informe['porColonia']>`
          select ci.colonia as etiqueta, count(*)::int as valor
          from peticiones p join ciudadanos ci on ci.id = p.ciudadano_id
          where ci.colonia is not null
            and p.fecha_apertura >= date_trunc('month', current_date) - make_interval(months => ${meses})
          group by 1 order by 2 desc limit 10`,

        tx<Informe['porDependencia']>`
          select d.descripcion as etiqueta,
                 count(*)::int as valor,
                 count(*) filter (where e.descripcion = 'Completada')::int as resueltas
          from peticiones p
          join dependencias d on d.id = p.dependencia_id
          left join estatus_peticiones e on e.id = p.estatus_id
          where p.fecha_apertura >= date_trunc('month', current_date) - make_interval(months => ${meses})
          group by 1 order by 2 desc`,

        tx<Informe['responsables']>`
          select nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as nombre,
                 count(*)::int as asignadas,
                 count(*) filter (where e.descripcion = 'Completada')::int as resueltas,
                 percentile_cont(0.5) within group (
                   order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
                 ) filter (where e.descripcion = 'Completada' and p.fecha_cierre is not null)::float8 as mediana
          from peticiones p
          join operadores o on o.id = p.operador_id
          join usuarios u on u.id = o.usuario_id
          left join estatus_peticiones e on e.id = p.estatus_id
          where p.fecha_apertura >= date_trunc('month', current_date) - make_interval(months => ${meses})
          group by 1 order by 2 desc`,
      ])

    return {
      periodo,
      totales,
      mediana: tiempos?.mediana ?? null,
      medianaPrevia: tiempos?.previa ?? null,
      porMes,
      porProblematica,
      porColonia,
      porDependencia,
      responsables,
    }
  })
}
