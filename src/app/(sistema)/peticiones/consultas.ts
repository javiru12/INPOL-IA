import 'server-only'
import { conTenant } from '@/lib/db'
import { zonaDeEstado } from '@/lib/zona'
import { edadSql } from '@/lib/edades-sql'
import { rango } from '@/lib/edades'

export type FiltrosPeticiones = {
  q?: string
  estatus?: string
  problematica?: string
  prioridad?: string
  /** Solo lo que sigue abierto: ni completadas ni canceladas. */
  pendientes?: boolean
  /** Mes de alta. Llega como 'AAAA-MM' o como 'AAAA-MM-01'. */
  mes?: string
  /** Nombre del municipio. Lo manda el mapa del panel. */
  municipio?: string
  /** Rango de edad del ciudadano. Lo manda la estadística. */
  edad?: string
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

type Sql = Parameters<Parameters<typeof conTenant>[1]>[0]

/**
 * Cada condición por separado, para poder armar tanto el predicado
 * completo como los conteos de cada selector —que aplican todos los
 * filtros menos el propio— y el de la exportación.
 */
function condiciones(tx: Sql, f: FiltrosPeticiones, zona: string) {
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

  const porEstatus = () => (f.estatus ? tx`and e.descripcion = ${f.estatus}` : tx``)
  const porProblematica = () => (f.problematica ? tx`and pr.titulo = ${f.problematica}` : tx``)
  const porPrioridad = () => (f.prioridad ? tx`and pri.descripcion = ${f.prioridad}` : tx``)
  const porPendientes = () =>
    f.pendientes
      ? tx`and coalesce(e.descripcion, '') not in ${tx(ESTATUS_TERMINALES)}`
      : tx``

  // La gráfica del panel manda el primer día del mes ('2026-10-01') y
  // el selector manda 'AAAA-MM'. Comparar uno contra otro no empata
  // nunca, así que los dos se recortan a la misma forma: sin esto, al
  // dar doble clic en una barra la lista salía vacía.
  const porMes = () =>
    f.mes
      ? tx`and to_char(p.fecha_apertura at time zone ${zona}, 'YYYY-MM') = ${f.mes.slice(0, 7)}`
      : tx``

  const porMunicipio = () => (f.municipio ? tx`and mu.nombre = ${f.municipio}` : tx``)

  // El rango llega como '35-44'; se traduce a sus dos extremos aquí y no
  // se confía en lo que venga en la dirección.
  const porEdad = () => {
    const r = f.edad ? rango(f.edad) : null
    return r
      ? tx`and ${edadSql(tx)} between ${r.desde} and ${r.hasta}`
      : tx``
  }

  return {
    porTexto,
    porEstatus,
    porProblematica,
    porPrioridad,
    porPendientes,
    porMes,
    porMunicipio,
    porEdad,
    // Un solo predicado compartido por el conteo, la página y la
    // exportación, para que no puedan contradecirse.
    donde: tx`
      where true
        ${porTexto()} ${porEstatus()} ${porProblematica()}
        ${porPrioridad()} ${porPendientes()} ${porMes()} ${porMunicipio()} ${porEdad()}`,
  }
}

export async function listarPeticiones(
  tenantId: string,
  f: FiltrosPeticiones,
  estadoClave?: string | null,
) {
  const zona = zonaDeEstado(estadoClave)
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA

  return conTenant(tenantId, async (tx) => {
    const { porTexto, porEstatus, porProblematica, porPrioridad,
            porPendientes, porMes, porMunicipio, porEdad, donde } = condiciones(tx, f, zona)

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
              ${porMes()} ${porMunicipio()} ${porEdad()}
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
              ${porMes()} ${porMunicipio()} ${porEdad()}
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
              ${porMes()} ${porMunicipio()} ${porEdad()}
        group by pri.id, pri.descripcion
        order by pri.id`,
    ])

    const estatusConId = await tx<{ id: string; descripcion: string }[]>`
      select id, descripcion from estatus_peticiones order by descripcion`

    return { filas, total, pagina, estatus, problematicas, prioridades, estatusConId }
  })
}

/**
 * Las mismas filas que enseña la pantalla, sin paginar, para exportar.
 *
 * Comparte el predicado con `listarPeticiones` a propósito: si la
 * exportación armara el suyo, el archivo traería un recorte distinto al
 * que se ve en pantalla y nadie sabría cuál de los dos creer. Ya pasaba:
 * la pantalla filtraba por mes y por municipio y el archivo no.
 */
export async function filasParaExportar(
  tenantId: string,
  f: FiltrosPeticiones,
  estadoClave?: string | null,
) {
  const zona = zonaDeEstado(estadoClave)

  return conTenant(tenantId, async (tx) => {
    const w = condiciones(tx, f, zona)
    return tx<Record<string, unknown>[]>`
      select upper(substr(p.id::text, 1, 6)) as folio,
             p.fecha_apertura at time zone ${zona} as fecha,
             p.fecha_cierre at time zone ${zona} as cierre,
             nullif(trim(coalesce(ci.nombre_completo,
               concat_ws(' ', ci.nombre, ci.apellido_paterno))), '') as ciudadano,
             ci.telefono_movil as telefono,
             ci.colonia,
             mu.nombre as municipio,
             se.clave as seccion,
             pr.titulo as problematica,
             sp.titulo as subproblematica,
             pri.descripcion as prioridad,
             e.descripcion as estatus,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
             p.descripcion
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      left join subproblematicas sp on sp.id = p.subproblematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join prioridades pri on pri.id = p.prioridad_id
      left join secciones se on se.id = p.seccion_id
      left join municipios mu on mu.id = se.municipio_id
      left join operadores o on o.id = p.operador_id
      left join usuarios u on u.id = o.usuario_id
      ${w.donde}
      order by p.fecha_apertura desc nulls last`
  })
}
