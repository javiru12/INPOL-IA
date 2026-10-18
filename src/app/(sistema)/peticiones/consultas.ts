import 'server-only'
import { conTenant } from '@/lib/db'

export type FiltrosPeticiones = {
  q?: string
  estatus?: string
  problematica?: string
  prioridad?: string
  /** Solo lo que sigue abierto: ni completadas ni canceladas. */
  pendientes?: boolean
  /** Mes de alta, como 'AAAA-MM'. Lo manda la gráfica del panel. */
  mes?: string
  /** Nombre del municipio. Lo manda el mapa del panel. */
  municipio?: string
  pagina?: number
}

/** Los estatus que cuentan como «ya no hay nada que hacer aquí». */
export const ESTATUS_TERMINALES = ['Completada', 'Cancelada'] as const

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
    // Cada condición por separado, para poder armar tanto el predicado
    // completo como los de los conteos de cada selector.
    //
    // La búsqueda ignora acentos y mayúsculas: quien teclea «peña» tiene
    // que encontrar a «PEÑA» y a «Pena», porque nadie escribe los acentos
    // al buscar y el padrón viene con ellos puestos a medias.
    const porTexto = () =>
      f.q
        ? tx`and (
              unaccent(lower(coalesce(ci.nombre_completo, ''))) like unaccent(lower(${'%' + f.q + '%'}))
              or unaccent(lower(coalesce(ci.colonia, ''))) like unaccent(lower(${'%' + f.q + '%'}))
              or unaccent(lower(coalesce(p.descripcion, ''))) like unaccent(lower(${'%' + f.q + '%'}))
              or upper(substr(p.id::text, 1, 6)) = upper(${f.q}))`
        : tx``

    const porEstatus = () =>
      f.estatus ? tx`and e.descripcion = ${f.estatus}` : tx``
    const porProblematica = () =>
      f.problematica ? tx`and pr.titulo = ${f.problematica}` : tx``
    const porPrioridad = () =>
      f.prioridad ? tx`and pri.descripcion = ${f.prioridad}` : tx``
    const porPendientes = () =>
      f.pendientes
        ? tx`and coalesce(e.descripcion, '') not in ${tx(ESTATUS_TERMINALES)}`
        : tx``
    const porMes = () =>
      f.mes ? tx`and to_char(p.fecha_apertura, 'YYYY-MM') = ${f.mes}` : tx``
    const porMunicipio = () =>
      f.municipio ? tx`and mu.nombre = ${f.municipio}` : tx``

    // Un solo predicado compartido por el conteo y la página, para que
    // el total y las filas nunca se contradigan.
    const donde = tx`
      where true
        ${porTexto()} ${porEstatus()} ${porProblematica()}
        ${porPrioridad()} ${porPendientes()} ${porMes()} ${porMunicipio()}`

    const desde = tx`
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      left join subproblematicas sp on sp.id = p.subproblematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join prioridades pri on pri.id = p.prioridad_id
      left join secciones se on se.id = p.seccion_id
      left join municipios mu on mu.id = se.municipio_id`

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

      // Los conteos de cada selector aplican los OTROS filtros activos,
      // nunca el propio. Antes se contaba sobre todo el padrón: con un
      // filtro de prioridad puesto, el selector de estatus seguía
      // ofreciendo «Completadas (1,096)» cuando urgentes completadas eran
      // 119, y al elegir una problemática de 45 el grid salía vacío
      // porque con la prioridad puesta solo quedaban 2.
      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select e.descripcion as valor, e.descripcion as etiqueta, count(p.id)::int as conteo
        from estatus_peticiones e
        left join peticiones p on p.estatus_id = e.id
        left join ciudadanos ci on ci.id = p.ciudadano_id
        left join problematicas pr on pr.id = p.problematica_id
        left join prioridades pri on pri.id = p.prioridad_id
        left join secciones se on se.id = p.seccion_id
        left join municipios mu on mu.id = se.municipio_id
        where true ${porTexto()} ${porProblematica()} ${porPrioridad()} ${porPendientes()}
              ${porMes()} ${porMunicipio()}
        group by 1, 2 order by 3 desc`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select pr.titulo as valor, pr.titulo as etiqueta, count(p.id)::int as conteo
        from problematicas pr
        left join peticiones p on p.problematica_id = pr.id
        left join ciudadanos ci on ci.id = p.ciudadano_id
        left join estatus_peticiones e on e.id = p.estatus_id
        left join prioridades pri on pri.id = p.prioridad_id
        left join secciones se on se.id = p.seccion_id
        left join municipios mu on mu.id = se.municipio_id
        where true ${porTexto()} ${porEstatus()} ${porPrioridad()} ${porPendientes()}
              ${porMes()} ${porMunicipio()}
        group by 1, 2 order by 3 desc`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select pri.descripcion as valor, pri.descripcion as etiqueta, count(p.id)::int as conteo
        from prioridades pri
        left join peticiones p on p.prioridad_id = pri.id
        left join ciudadanos ci on ci.id = p.ciudadano_id
        left join estatus_peticiones e on e.id = p.estatus_id
        left join problematicas pr on pr.id = p.problematica_id
        left join secciones se on se.id = p.seccion_id
        left join municipios mu on mu.id = se.municipio_id
        where true ${porTexto()} ${porEstatus()} ${porProblematica()} ${porPendientes()}
              ${porMes()} ${porMunicipio()}
        group by pri.id, pri.descripcion
        order by pri.id`,
    ])

    const estatusConId = await tx<{ id: string; descripcion: string }[]>`
      select id, descripcion from estatus_peticiones order by descripcion`

    return { filas, total, pagina, estatus, problematicas, prioridades, estatusConId }
  })
}
