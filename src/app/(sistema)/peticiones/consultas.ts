import 'server-only'
import { conTenant } from '@/lib/db'

export type FiltrosPeticiones = {
  q?: string
  estatus?: string
  problematica?: string
  prioridad?: string
  pagina?: number
}

export const POR_PAGINA = 25

export type FilaPeticion = {
  id: string
  ciudadano_id: string
  folio: string
  ciudadano: string | null
  colonia: string | null
  problematica: string | null
  subproblematica: string | null
  descripcion: string | null
  estatus: string | null
  prioridad: string | null
  fecha: string
}

export async function listarPeticiones(tenantId: string, f: FiltrosPeticiones) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    // Un solo predicado compartido por el conteo y la página, para que
    // el total y las filas nunca se contradigan.
    const donde = tx`
      where (${f.q ?? null}::text is null or (
              ci.nombre_completo ilike ${'%' + (f.q ?? '') + '%'}
              or ci.colonia ilike ${'%' + (f.q ?? '') + '%'}
              or p.descripcion ilike ${'%' + (f.q ?? '') + '%'}))
        and (${f.estatus ?? null}::text is null or e.descripcion = ${f.estatus ?? null})
        and (${f.problematica ?? null}::text is null or pr.titulo = ${f.problematica ?? null})
        and (${f.prioridad ?? null}::text is null or pri.descripcion = ${f.prioridad ?? null})`

    const desde = tx`
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      left join subproblematicas sp on sp.id = p.subproblematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join prioridades pri on pri.id = p.prioridad_id`

    const [filas, [{ total }], estatus, problematicas, prioridades] = await Promise.all([
      tx<FilaPeticion[]>`
        select p.id,
               p.ciudadano_id,
               upper(substr(p.id::text, 1, 6)) as folio,
               nullif(trim(coalesce(ci.nombre_completo,
                 concat_ws(' ', ci.nombre, ci.apellido_paterno))), '') as ciudadano,
               ci.colonia,
               pr.titulo as problematica,
               sp.titulo as subproblematica,
               p.descripcion,
               e.descripcion as estatus,
               pri.descripcion as prioridad,
               p.fecha_apertura::text as fecha
        ${desde} ${donde}
        order by p.fecha_apertura desc nulls last
        limit ${POR_PAGINA} offset ${salto}`,

      tx<{ total: number }[]>`select count(*)::int as total ${desde} ${donde}`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select e.descripcion as valor, e.descripcion as etiqueta, count(p.id)::int as conteo
        from estatus_peticiones e
        left join peticiones p on p.estatus_id = e.id
        group by 1, 2 order by 3 desc`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select pr.titulo as valor, pr.titulo as etiqueta, count(p.id)::int as conteo
        from problematicas pr
        left join peticiones p on p.problematica_id = pr.id
        group by 1, 2 order by 3 desc`,

      tx<{ valor: string; etiqueta: string }[]>`
        select descripcion as valor, descripcion as etiqueta from prioridades order by id`,
    ])

    return { filas, total, pagina, estatus, problematicas, prioridades }
  })
}
