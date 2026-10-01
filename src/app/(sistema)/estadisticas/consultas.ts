import 'server-only'
import { conTenant } from '@/lib/db'

/**
 * Analítica de la gestión social.
 *
 * Dos universos, y cada bloque dice en pantalla cuál usa:
 *
 *  · COHORTE — peticiones *capturadas* dentro del periodo. Es el universo
 *    de la demanda: cuántas llegaron, de dónde, a quién se turnaron, qué
 *    pasó con ellas. Todos los repartos y el embudo salen de aquí, así que
 *    cuadran siempre contra el mismo total.
 *
 *  · CERRADAS — peticiones *resueltas* dentro del periodo. Es el universo
 *    del tiempo de respuesta. No se mide sobre el cohorte a propósito: un
 *    caso abierto en agosto que va a tardar 200 días todavía no cierra, y
 *    dejarlo fuera del cálculo haría ver a Obra Pública más rápida de lo
 *    que es.
 *
 * «Resuelta» es el estatus Completada, no «tiene fecha de cierre»: las
 * canceladas también cierran, y contarlas como resueltas infla el
 * cumplimiento y ensucia la mediana.
 */

export const RANGOS = {
  '3m': { etiqueta: 'Últimos 3 meses', meses: 3 },
  '6m': { etiqueta: 'Últimos 6 meses', meses: 6 },
  '12m': { etiqueta: 'Últimos 12 meses', meses: 12 },
  todo: { etiqueta: 'Todo el histórico', meses: null },
} as const

export type Rango = keyof typeof RANGOS
export const RANGO_POR_DEFECTO: Rango = '12m'

export function esRango(v: string | undefined): v is Rango {
  return !!v && v in RANGOS
}

/** Días de antigüedad a partir de los cuales una petición viva «quema». */
export const UMBRAL_ATORADAS = 30

/** Mínimo de casos cerrados para publicar una mediana por problemática. */
const MINIMO_PARA_MEDIANA = 3

export const ORDENES = ['nombre', 'asignadas', 'resueltas', 'tasa', 'mediana'] as const
export type Orden = (typeof ORDENES)[number]

export function esOrden(v: string | undefined): v is Orden {
  return !!v && (ORDENES as readonly string[]).includes(v)
}

export type FiltrosEstadisticas = {
  rango: Rango
  problematica?: string
  dependencia?: string
  orden: Orden
  dir: 'asc' | 'desc'
}

export type Opcion = { valor: string; etiqueta: string; conteo?: number }

export type MesSerie = {
  mes: string
  recibidas: number
  resueltas: number
  mediana: number | null
}

export type TiempoProblematica = {
  etiqueta: string
  cerradas: number
  mediana: number
  p90: number
}

export type Atorada = { etiqueta: string; valor: number; masVieja: number }

export type Responsable = {
  id: string
  nombre: string
  perfil: string | null
  asignadas: number
  resueltas: number
  tasa: number
  mediana: number | null
}

export type Estadisticas = {
  hayDatos: boolean
  periodo: { desde: string; hasta: string; mesEnCurso: boolean }
  totales: {
    capturadas: number
    resueltas: number
    vivas: number
    atoradas: number
    atoradas60: number
    atoradas120: number
    canceladas: number
    sinInterpretar: number
    sinArrancar: number
    trabajadas: number
  }
  tiempos: { mediana: number | null; p90: number | null; cerradas: number }
  evolucion: MesSerie[]
  porProblematica: TiempoProblematica[]
  atoradas: Atorada[]
  responsables: Responsable[]
  porFuente: { etiqueta: string; valor: number }[]
  porDependencia: { etiqueta: string; valor: number }[]
  opciones: { problematicas: Opcion[]; dependencias: Opcion[] }
}

const SIN_DATOS: Estadisticas = {
  hayDatos: false,
  periodo: { desde: '', hasta: '', mesEnCurso: false },
  totales: {
    capturadas: 0, resueltas: 0, vivas: 0,
    atoradas: 0, atoradas60: 0, atoradas120: 0,
    canceladas: 0, sinInterpretar: 0, sinArrancar: 0, trabajadas: 0,
  },
  tiempos: { mediana: null, p90: null, cerradas: 0 },
  evolucion: [],
  porProblematica: [],
  atoradas: [],
  responsables: [],
  porFuente: [],
  porDependencia: [],
  opciones: { problematicas: [], dependencias: [] },
}

function redondear(v: unknown, decimales = 1): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

export async function estadisticasDeGestion(
  tenantId: string,
  f: FiltrosEstadisticas,
): Promise<Estadisticas> {
  const meses = RANGOS[f.rango].meses
  const prob = f.problematica ?? null
  const dep = f.dependencia ?? null
  const umbral = UMBRAL_ATORADAS

  return conTenant(tenantId, async (tx) => {
    // Los fragmentos se producen en funciones y no se guardan en una
    // variable: cada uso genera su propio juego de parámetros, aunque el
    // mismo trozo aparezca dos veces en la misma consulta.
    const catalogos = () => tx`
      left join problematicas pr on pr.id = p.problematica_id
      left join dependencias d on d.id = p.dependencia_id
      left join estatus_peticiones e on e.id = p.estatus_id`

    const cond = () => tx`
          (${prob}::text is null or pr.titulo = ${prob}::text)
      and (${dep}::text is null or d.descripcion = ${dep}::text)`

    // ---- Ventana del periodo ----------------------------------------
    // El periodo cierra en el último mes completo: un mes en curso sale
    // como desplome en la gráfica y no se puede comparar con los demás.
    // La excepción es un cliente que arrancó este mismo mes; ahí no hay
    // mes completo todavía y vale más enseñar lo que lleva.
    //
    // Con «todo el histórico» arranca en el primer mes que tenga datos ya
    // filtrados, para que la serie no abra con meses vacíos ajenos.
    const [v] = await tx<{ desde: string | null; hasta: string; en_curso: boolean }[]>`
      select
        h.hasta::date::text as hasta,
        (h.hasta > date_trunc('month', now())) as en_curso,
        (case when ${meses}::int is null
              then (select date_trunc('month', min(p.fecha_apertura))
                    from peticiones p ${catalogos()}
                    where ${cond()})
              else h.hasta - make_interval(months => ${meses}::int)
         end)::date::text as desde
      from (
        select case
                 when exists (select 1
                              from peticiones p ${catalogos()}
                              where p.fecha_apertura < date_trunc('month', now())
                                and ${cond()})
                 then date_trunc('month', now())
                 else date_trunc('month', now()) + interval '1 month'
               end as hasta
      ) h`

    if (!v?.desde) return SIN_DATOS
    const desde = v.desde
    const hasta = v.hasta

    // Los límites van como `::date`, nunca como `::timestamptz`. El driver
    // manda un parámetro de texto destinado a timestamptz con semántica
    // UTC, así que '2025-11-01' acabaría siendo el 31 de octubre a las
    // 18:00 hora de México y los meses saldrían corridos. Convertido a
    // `date` primero, Postgres lo ancla a medianoche local.
    const enCohorte = () => tx`
          p.fecha_apertura >= ${desde}::date
      and p.fecha_apertura <  ${hasta}::date`

    const enCerradas = () => tx`
          e.descripcion = 'Completada'
      and p.fecha_cierre is not null
      and p.fecha_cierre >= ${desde}::date
      and p.fecha_cierre <  ${hasta}::date
      and p.fecha_cierre >= p.fecha_apertura`

    const dias = () => tx`extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400`

    const [
      totales, tiempos, evolucion, porProblematica, atoradas,
      responsables, porFuente, porDependencia, optProblematicas, optDependencias,
    ] = await Promise.all([
      // 1 · Totales del cohorte.
      tx<{
        capturadas: number; resueltas: number; vivas: number
        atoradas: number; atoradas_60: number; atoradas_120: number
        canceladas: number; sin_interpretar: number; sin_arrancar: number
      }[]>`
        select
          count(*)::int as capturadas,
          count(*) filter (where e.descripcion = 'Completada')::int as resueltas,
          count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión'))::int as vivas,
          count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión')
                             and p.fecha_apertura < now() - make_interval(days => ${umbral}::int))::int as atoradas,
          count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión')
                             and p.fecha_apertura < now() - interval '60 days')::int as atoradas_60,
          count(*) filter (where e.descripcion in ('Abierta','En proceso','En gestión')
                             and p.fecha_apertura < now() - interval '120 days')::int as atoradas_120,
          count(*) filter (where e.descripcion = 'Cancelada')::int as canceladas,
          count(*) filter (where e.descripcion = 'No interpretada')::int as sin_interpretar,
          count(*) filter (where e.descripcion = 'Abierta')::int as sin_arrancar
        from peticiones p ${catalogos()}
        where ${enCohorte()} and ${cond()}`,

      // 2 · Mediana y percentil 90 sobre lo cerrado en el periodo.
      tx<{ mediana: number | null; p90: number | null; cerradas: number }[]>`
        select
          count(*)::int as cerradas,
          percentile_cont(0.5) within group (order by ${dias()})::float8 as mediana,
          percentile_cont(0.9) within group (order by ${dias()})::float8 as p90
        from peticiones p ${catalogos()}
        where ${enCerradas()} and ${cond()}`,

      // 3 · Mes a mes: entradas por fecha de captura, salidas por fecha de
      // cierre. La mediana del mes es la de lo que cerró ese mes.
      tx<{ mes: string; recibidas: number; resueltas: number; mediana: number | null }[]>`
        select m::date::text as mes,
               coalesce(r.n, 0)::int as recibidas,
               coalesce(c.n, 0)::int as resueltas,
               c.mediana::float8 as mediana
        from generate_series(
               ${desde}::date::timestamptz,
               ${hasta}::date::timestamptz - interval '1 month',
               interval '1 month') as m
        left join (
          select date_trunc('month', p.fecha_apertura) as mm, count(*) as n
          from peticiones p ${catalogos()}
          where ${enCohorte()} and ${cond()}
          group by 1
        ) r on r.mm = m
        left join (
          select date_trunc('month', p.fecha_cierre) as mm,
                 count(*) as n,
                 percentile_cont(0.5) within group (order by ${dias()}) as mediana
          from peticiones p ${catalogos()}
          where ${enCerradas()} and ${cond()}
          group by 1
        ) c on c.mm = m
        order by m`,

      // 4 · Dónde se tarda: mediana y percentil 90 por problemática.
      tx<{ etiqueta: string; cerradas: number; mediana: number; p90: number }[]>`
        select coalesce(pr.titulo, 'Sin clasificar') as etiqueta,
               count(*)::int as cerradas,
               percentile_cont(0.5) within group (order by ${dias()})::float8 as mediana,
               percentile_cont(0.9) within group (order by ${dias()})::float8 as p90
        from peticiones p ${catalogos()}
        where ${enCerradas()} and ${cond()}
        group by 1
        having count(*) >= ${MINIMO_PARA_MEDIANA}::int
        order by 3 desc nulls last`,

      // 5 · Lo que quema: vivas del cohorte por encima del umbral.
      tx<{ etiqueta: string; valor: number; mas_vieja: number }[]>`
        select coalesce(pr.titulo, 'Sin clasificar') as etiqueta,
               count(*)::int as valor,
               max(extract(day from (now() - p.fecha_apertura)))::int as mas_vieja
        from peticiones p ${catalogos()}
        where ${enCohorte()} and ${cond()}
          and e.descripcion in ('Abierta','En proceso','En gestión')
          and p.fecha_apertura < now() - make_interval(days => ${umbral}::int)
        group by 1
        order by 2 desc`,

      // 6 · Cada responsable sobre lo que se le asignó en el periodo.
      tx<{
        id: string; nombre: string; perfil: string | null
        asignadas: number; resueltas: number; mediana: number | null
      }[]>`
        select o.id,
               coalesce(
                 nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno, u.apellido_materno)), ''),
                 u.correo) as nombre,
               u.perfil_clave as perfil,
               count(*)::int as asignadas,
               count(*) filter (where e.descripcion = 'Completada')::int as resueltas,
               percentile_cont(0.5) within group (
                 order by case
                   when e.descripcion = 'Completada'
                    and p.fecha_cierre is not null
                    and p.fecha_cierre >= p.fecha_apertura
                   then ${dias()} end
               )::float8 as mediana
        from peticiones p
        join operadores o on o.id = p.operador_id
        join usuarios u on u.id = o.usuario_id
        ${catalogos()}
        where ${enCohorte()} and ${cond()}
        group by o.id, 2, 3`,

      // 7 · Por dónde entra la demanda.
      tx<{ etiqueta: string; valor: number }[]>`
        select coalesce(fu.descripcion, 'Sin registrar') as etiqueta, count(*)::int as valor
        from peticiones p
        left join fuentes fu on fu.id = p.fuente_id
        ${catalogos()}
        where ${enCohorte()} and ${cond()}
        group by 1 order by 2 desc`,

      // 8 · A quién se le turna.
      tx<{ etiqueta: string; valor: number }[]>`
        select coalesce(d.descripcion, 'Sin turnar') as etiqueta, count(*)::int as valor
        from peticiones p ${catalogos()}
        where ${enCohorte()} and ${cond()}
        group by 1 order by 2 desc`,

      // 9 y 10 · Opciones de los selectores. Cada lista lleva el conteo del
      // periodo con el *otro* filtro aplicado, nunca con el propio: si se
      // aplicara el propio, elegir una opción dejaría las demás en cero y
      // no habría forma de cambiar de parecer.
      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select pr.titulo as valor, pr.titulo as etiqueta, count(*)::int as conteo
        from peticiones p ${catalogos()}
        where ${enCohorte()}
          and (${dep}::text is null or d.descripcion = ${dep}::text)
          and pr.titulo is not null
        group by 1, 2 order by 3 desc`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select d.descripcion as valor, d.descripcion as etiqueta, count(*)::int as conteo
        from peticiones p ${catalogos()}
        where ${enCohorte()}
          and (${prob}::text is null or pr.titulo = ${prob}::text)
          and d.descripcion is not null
        group by 1, 2 order by 3 desc`,
    ])

    const t = totales[0] ?? {
      capturadas: 0, resueltas: 0, vivas: 0,
      atoradas: 0, atoradas_60: 0, atoradas_120: 0,
      canceladas: 0, sin_interpretar: 0, sin_arrancar: 0,
    }

    // El embudo se deriva del estatus actual. «Trabajadas» es todo lo que
    // ya salió de la bandeja de entrada: incluye las canceladas, que
    // también se trabajaron antes de darlas de baja.
    const trabajadas = t.capturadas - t.sin_arrancar - t.sin_interpretar

    const filas: Responsable[] = responsables.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      perfil: r.perfil,
      asignadas: r.asignadas,
      resueltas: r.resueltas,
      tasa: r.asignadas ? r.resueltas / r.asignadas : 0,
      mediana: redondear(r.mediana),
    }))

    return {
      hayDatos: t.capturadas > 0,
      periodo: { desde, hasta, mesEnCurso: v.en_curso },
      totales: {
        capturadas: t.capturadas,
        resueltas: t.resueltas,
        vivas: t.vivas,
        atoradas: t.atoradas,
        atoradas60: t.atoradas_60,
        atoradas120: t.atoradas_120,
        canceladas: t.canceladas,
        sinInterpretar: t.sin_interpretar,
        sinArrancar: t.sin_arrancar,
        trabajadas,
      },
      tiempos: {
        cerradas: tiempos[0]?.cerradas ?? 0,
        mediana: redondear(tiempos[0]?.mediana),
        p90: redondear(tiempos[0]?.p90),
      },
      evolucion: evolucion.map((m) => ({
        mes: m.mes,
        recibidas: m.recibidas,
        resueltas: m.resueltas,
        mediana: redondear(m.mediana),
      })),
      porProblematica: porProblematica.map((p) => ({
        etiqueta: p.etiqueta,
        cerradas: p.cerradas,
        mediana: redondear(p.mediana) ?? 0,
        p90: redondear(p.p90) ?? 0,
      })),
      atoradas: atoradas.map((a) => ({
        etiqueta: a.etiqueta,
        valor: a.valor,
        masVieja: a.mas_vieja,
      })),
      responsables: ordenar(filas, f.orden, f.dir),
      porFuente,
      porDependencia,
      opciones: { problematicas: optProblematicas, dependencias: optDependencias },
    }
  })
}

function ordenar(filas: Responsable[], orden: Orden, dir: 'asc' | 'desc') {
  const signo = dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (orden === 'nombre') return signo * a.nombre.localeCompare(b.nombre, 'es')
    // Quien todavía no resuelve nada no tiene mediana. Ese hueco va
    // siempre al final: no es «el mejor tiempo».
    if (orden === 'mediana') {
      if (a.mediana === null && b.mediana === null) return 0
      if (a.mediana === null) return 1
      if (b.mediana === null) return -1
      return signo * (a.mediana - b.mediana)
    }
    return signo * (a[orden] - b[orden])
  })
}
