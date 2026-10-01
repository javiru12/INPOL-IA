import 'server-only'
import { conTenant } from '@/lib/db'

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

export async function resumenDelPanel(tenantId: string): Promise<ResumenPanel> {
  return conTenant(tenantId, async (tx) => {
    const [porEstatus, porMes, porProblematica, porColonia, recientes, totales, porMunicipio] =
      await Promise.all([
        tx<{ etiqueta: string; valor: number }[]>`
          select coalesce(e.descripcion, 'Sin estatus') as etiqueta, count(*)::int as valor
          from peticiones p
          left join estatus_peticiones e on e.id = p.estatus_id
          group by 1 order by 2 desc`,

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
