import 'server-only'
import { conTenant } from '@/lib/db'

/**
 * Estructura de atención: quién responde por cada pedazo del territorio.
 *
 * El modelo trae tablas para la jerarquía formal de campaña —`estructuras`,
 * `estructura_usuarios`, `movilizadores`, `activistas`— y todas están
 * vacías: nadie las captura. Esta pantalla no se construye sobre ellas.
 *
 * Se construye sobre la red que sí existe y que sí se puede auditar: las
 * personas del sistema (`usuarios` → `operadores`) y el territorio que se
 * deduce del trabajo que cada quien tiene asignado
 * (`peticiones.operador_id` → `peticiones.seccion_id` → sección → municipio).
 *
 * Para un gobierno esa es además la pregunta correcta: no «cómo se dibuja
 * el organigrama» sino «quién responde por esta colonia y cómo va».
 *
 * Dos convenciones, iguales a las del resto del sistema:
 *
 *  · ABIERTA — todo lo que no quedó Completada ni Cancelada, incluida la
 *    petición que nadie ha interpretado. Es la carga viva de la persona,
 *    la misma definición de «sin resolver» que usa Territorio.
 *  · RESUELTA — el estatus Completada, no «tiene fecha de cierre»: las
 *    canceladas también cierran y contarlas infla el cumplimiento.
 */

/** Días de antigüedad a partir de los cuales una petición abierta quema. */
export const UMBRAL_REZAGO = 30

/**
 * Debajo de este porcentaje, quien más atiende una zona no manda en ella:
 * la demanda está repartida y nadie responde por el conjunto.
 */
export const UMBRAL_DUENO = 0.4

/** Mínimo de peticiones para hablar de riesgo en una zona. Con una o dos
 *  peticiones, que las lleve una sola persona no significa nada. */
const MINIMO_PARA_RIESGO = 3

/** Zonas que caben en el panel sin convertirlo en un listado. */
const ZONAS_EN_PANTALLA = 12

export const ORDENES = [
  'nombre',
  'asignadas',
  'resueltas',
  'tasa',
  'mediana',
  'abiertas',
  'rezagadas',
  'secciones',
] as const
export type Orden = (typeof ORDENES)[number]

export function esOrden(v: string | undefined): v is Orden {
  return !!v && (ORDENES as readonly string[]).includes(v)
}

/** Qué pinta el mapa. */
export type Pinta = 'carga' | 'responsable'

export function esPinta(v: string | undefined): v is Pinta {
  return v === 'carga' || v === 'responsable'
}

export type FiltrosEstructura = {
  municipio?: string
  persona?: string
  orden: Orden
  dir: 'asc' | 'desc'
}

export type Persona = {
  id: string
  nombre: string
  perfil: string | null
  asignadas: number
  resueltas: number
  /** Fracción de 0 a 1. */
  tasa: number
  mediana: number | null
  abiertas: number
  rezagadas: number
  municipios: number
  secciones: number
  /** Días de la petición abierta más antigua que lleva. */
  masVieja: number | null
}

export type Rama = {
  perfil: string
  personas: number
  asignadas: number
  abiertas: number
  rezagadas: number
}

export type MunicipioCarga = {
  clave: string
  nombre: string
  peticiones: number
  abiertas: number
  rezagadas: number
  secciones: number
  personas: number
  principal: string | null
  principal_id: string | null
  principal_peticiones: number
  /** Porcentaje de la zona que lleva quien más atiende ahí. */
  participacion: number | null
  de_la_persona: number
  abiertas_persona: number
}

/** Por qué una zona entra al panel de lo accionable. */
export type Riesgo = 'sola' | 'dispersa' | 'rezago'

export type Zona = {
  id: string
  clave: string
  municipio: string
  peticiones: number
  abiertas: number
  rezagadas: number
  personas: number
  principal: string | null
  participacion: number | null
  riesgo: Riesgo | null
}

export type Totales = {
  peticiones: number
  abiertas: number
  rezagadas: number
  sinAsignar: number
  sinTerritorio: number
  municipios: number
  secciones: number
}

export type RiesgoDeZonas = {
  zonas: number
  sinDueno: number
  concentradas: number
  conRezago: number
}

export type Detalle = {
  municipios: { clave: string; nombre: string; peticiones: number; abiertas: number; secciones: number }[]
  secciones: { id: string; clave: string; municipio: string; peticiones: number; abiertas: number }[]
}

export type Opcion = { valor: string; etiqueta: string; conteo?: number }

export type PanelDeEstructura = {
  personas: Persona[]
  ramas: Rama[]
  municipios: MunicipioCarga[]
  zonas: Zona[]
  totales: Totales
  riesgo: RiesgoDeZonas
  detalle: Detalle | null
  /** Qué hay capturado de la jerarquía formal. Hoy: nada. */
  formal: { estructuras: number; vinculos: number }
  opciones: { municipios: Opcion[]; personas: Opcion[] }
}

function redondear(v: unknown, decimales = 1): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

function entero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Una zona puede fallar de tres maneras y se etiqueta por la más grave:
 * que dependa de una sola persona, que no tenga dueño claro, o que
 * simplemente traiga rezago aunque el reparto esté bien.
 */
function riesgoDeZona(z: {
  peticiones: number
  rezagadas: number
  personas: number
  participacion: number | null
}): Riesgo | null {
  if (z.personas === 1 && z.peticiones >= MINIMO_PARA_RIESGO) return 'sola'
  if (
    z.peticiones >= MINIMO_PARA_RIESGO &&
    z.participacion !== null &&
    z.participacion < UMBRAL_DUENO * 100
  ) {
    return 'dispersa'
  }
  if (z.rezagadas > 0) return 'rezago'
  return null
}

export async function panelDeEstructura(
  tenantId: string,
  f: FiltrosEstructura,
): Promise<PanelDeEstructura> {
  const mun = f.municipio ?? null
  const persona = f.persona ?? null

  return conTenant(tenantId, async (tx) => {
    // Los fragmentos se producen en funciones, nunca se guardan en una
    // variable: cada uso genera su propio juego de parámetros aunque el
    // mismo trozo aparezca dos veces en la misma consulta.
    const origen = () => tx`
      from peticiones p
      join operadores o on o.id = p.operador_id
      join usuarios u on u.id = o.usuario_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join secciones s on s.id = p.seccion_id
      left join municipios m on m.id = s.municipio_id`

    const comoSeLlama = () => tx`
      coalesce(
        nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno, u.apellido_materno)), ''),
        u.correo)`

    const abierta = () => tx`coalesce(e.descripcion, '') not in ('Completada', 'Cancelada')`
    const vieja = () => tx`p.fecha_apertura < now() - make_interval(days => ${UMBRAL_REZAGO}::int)`
    const dias = () => tx`extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400`
    const enMunicipio = () => tx`(${mun}::text is null or m.nombre = ${mun}::text)`

    /** Reparto de una zona entre quienes la atienden, y quién lleva más. */
    const reparto = (llave: ReturnType<typeof tx>) => tx`
      with base as (
        select ${llave} as zona,
               s.id as seccion_id,
               s.clave as seccion,
               m.clave as municipio_clave,
               m.nombre as municipio,
               o.usuario_id,
               ${comoSeLlama()} as persona,
               e.descripcion as estatus,
               p.fecha_apertura
        ${origen()}
        where p.seccion_id is not null and ${enMunicipio()}
      ),
      por_persona as (
        select zona, usuario_id, persona, count(*)::int as n
        from base group by 1, 2, 3
      ),
      lider as (
        select distinct on (zona) zona, usuario_id, persona, n
        from por_persona
        order by zona, n desc, persona
      ),
      tot as (
        select zona,
               min(municipio) as municipio,
               min(municipio_clave) as municipio_clave,
               min(seccion) as seccion,
               count(*)::int as peticiones,
               count(*) filter (
                 where coalesce(estatus, '') not in ('Completada', 'Cancelada')
               )::int as abiertas,
               count(*) filter (
                 where coalesce(estatus, '') not in ('Completada', 'Cancelada')
                   and fecha_apertura < now() - make_interval(days => ${UMBRAL_REZAGO}::int)
               )::int as rezagadas,
               count(distinct seccion_id)::int as secciones,
               count(distinct usuario_id)::int as personas,
               count(*) filter (where usuario_id = ${persona}::uuid)::int as de_la_persona,
               count(*) filter (
                 where usuario_id = ${persona}::uuid
                   and coalesce(estatus, '') not in ('Completada', 'Cancelada')
               )::int as abiertas_persona
        from base group by 1
      )`

    const [
      crudas,
      municipios,
      crudasZonas,
      riesgoCrudo,
      totalesCrudos,
      formalCrudo,
      optMunicipios,
      detalleMunicipios,
      detalleSecciones,
    ] = await Promise.all([
      // 1 · El equipo. Arranca de `usuarios`, no de `peticiones`: quien no
      // tiene nada turnado también compone el equipo, y que aparezca en
      // ceros es justamente el dato.
      tx<
        {
          id: string
          nombre: string
          perfil: string | null
          asignadas: number
          resueltas: number
          mediana: number | null
          abiertas: number
          rezagadas: number
          municipios: number
          secciones: number
          mas_vieja: number | null
        }[]
      >`
        with carga as (
          select o.usuario_id as id,
                 count(*)::int as asignadas,
                 count(*) filter (where e.descripcion = 'Completada')::int as resueltas,
                 percentile_cont(0.5) within group (
                   order by case
                     when e.descripcion = 'Completada'
                      and p.fecha_cierre is not null
                      and p.fecha_cierre >= p.fecha_apertura
                     then ${dias()} end
                 )::float8 as mediana,
                 count(*) filter (where ${abierta()})::int as abiertas,
                 count(*) filter (where ${abierta()} and ${vieja()})::int as rezagadas,
                 count(distinct s.municipio_id)::int as municipios,
                 count(distinct p.seccion_id)::int as secciones,
                 max(case when ${abierta()}
                          then extract(day from now() - p.fecha_apertura) end)::float8 as mas_vieja
          ${origen()}
          where ${enMunicipio()}
          group by 1
        )
        select u.id,
               coalesce(
                 nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno, u.apellido_materno)), ''),
                 u.correo) as nombre,
               u.perfil_clave as perfil,
               coalesce(c.asignadas, 0)::int as asignadas,
               coalesce(c.resueltas, 0)::int as resueltas,
               c.mediana,
               coalesce(c.abiertas, 0)::int as abiertas,
               coalesce(c.rezagadas, 0)::int as rezagadas,
               coalesce(c.municipios, 0)::int as municipios,
               coalesce(c.secciones, 0)::int as secciones,
               c.mas_vieja
        from usuarios u
        left join carga c on c.id = u.id
        where u.activo = true`,

      // 2 · El territorio por municipio: carga, rezago y quién lleva más.
      tx<MunicipioCarga[]>`
        ${reparto(tx`m.clave`)}
        select t.zona as clave,
               t.municipio as nombre,
               t.peticiones,
               t.abiertas,
               t.rezagadas,
               t.secciones,
               t.personas,
               l.persona as principal,
               l.usuario_id::text as principal_id,
               coalesce(l.n, 0)::int as principal_peticiones,
               round(100.0 * l.n / nullif(t.peticiones, 0))::float8 as participacion,
               t.de_la_persona,
               t.abiertas_persona
        from tot t
        left join lider l on l.zona = t.zona
        order by t.peticiones desc, t.municipio`,

      // 3 · Las zonas que piden intervención, a nivel sección: es donde el
      // reparto de verdad se ve. A nivel municipio todos atienden todo.
      tx<
        {
          id: string
          clave: string
          municipio: string
          peticiones: number
          abiertas: number
          rezagadas: number
          personas: number
          principal: string | null
          participacion: number | null
        }[]
      >`
        ${reparto(tx`s.id::text`)}
        select t.zona as id,
               t.seccion as clave,
               t.municipio,
               t.peticiones,
               t.abiertas,
               t.rezagadas,
               t.personas,
               l.persona as principal,
               round(100.0 * l.n / nullif(t.peticiones, 0))::float8 as participacion
        from tot t
        left join lider l on l.zona = t.zona
        where t.abiertas > 0
        order by t.rezagadas desc, t.abiertas desc, t.peticiones desc, t.seccion
        limit ${ZONAS_EN_PANTALLA}`,

      // 4 · El tamaño del problema, sobre todas las secciones con demanda.
      tx<{ zonas: number; sin_dueno: number; concentradas: number; con_rezago: number }[]>`
        ${reparto(tx`s.id::text`)}
        select count(*)::int as zonas,
               count(*) filter (
                 where t.peticiones >= ${MINIMO_PARA_RIESGO}::int
                   and 1.0 * l.n / nullif(t.peticiones, 0) < ${UMBRAL_DUENO}::float8
               )::int as sin_dueno,
               count(*) filter (
                 where t.personas = 1 and t.peticiones >= ${MINIMO_PARA_RIESGO}::int
               )::int as concentradas,
               count(*) filter (where t.rezagadas > 0)::int as con_rezago
        from tot t
        left join lider l on l.zona = t.zona`,

      // 5 · Totales. Sin el join a operadores, para poder contar también
      // lo que no tiene responsable asignado.
      tx<Totales[]>`
        select count(*)::int as peticiones,
               count(*) filter (where ${abierta()})::int as abiertas,
               count(*) filter (where ${abierta()} and ${vieja()})::int as rezagadas,
               count(*) filter (where p.operador_id is null)::int as "sinAsignar",
               count(*) filter (where p.seccion_id is null)::int as "sinTerritorio",
               count(distinct s.municipio_id)::int as municipios,
               count(distinct p.seccion_id)::int as secciones
        from peticiones p
        left join estatus_peticiones e on e.id = p.estatus_id
        left join secciones s on s.id = p.seccion_id
        left join municipios m on m.id = s.municipio_id
        where ${enMunicipio()}`,

      // 6 · Qué hay capturado de la jerarquía formal de campaña.
      tx<{ estructuras: number; vinculos: number }[]>`
        select (select count(*) from estructuras)::int as estructuras,
               (select count(*) from estructura_usuarios)::int as vinculos`,

      // 7 · Opciones del selector. Sin el filtro propio aplicado: si no,
      // elegir un municipio dejaría los demás fuera de la lista.
      tx<Opcion[]>`
        select m.nombre as valor, m.nombre as etiqueta, count(*)::int as conteo
        from peticiones p
        join secciones s on s.id = p.seccion_id
        join municipios m on m.id = s.municipio_id
        group by 1, 2
        order by 1`,

      // 8 y 9 · El territorio de la persona elegida.
      persona
        ? tx<Detalle['municipios']>`
            select m.clave,
                   m.nombre,
                   count(*)::int as peticiones,
                   count(*) filter (where ${abierta()})::int as abiertas,
                   count(distinct p.seccion_id)::int as secciones
            ${origen()}
            where o.usuario_id = ${persona}::uuid
              and p.seccion_id is not null
              and ${enMunicipio()}
            group by 1, 2
            order by 3 desc, 2`
        : Promise.resolve([] as Detalle['municipios']),

      persona
        ? tx<Detalle['secciones']>`
            select s.id::text as id,
                   s.clave,
                   m.nombre as municipio,
                   count(*)::int as peticiones,
                   count(*) filter (where ${abierta()})::int as abiertas
            ${origen()}
            where o.usuario_id = ${persona}::uuid
              and p.seccion_id is not null
              and ${enMunicipio()}
            group by 1, 2, 3
            order by 4 desc, 2
            limit 10`
        : Promise.resolve([] as Detalle['secciones']),
    ])

    const personas: Persona[] = crudas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      perfil: r.perfil,
      asignadas: r.asignadas,
      resueltas: r.resueltas,
      tasa: r.asignadas ? r.resueltas / r.asignadas : 0,
      mediana: redondear(r.mediana),
      abiertas: r.abiertas,
      rezagadas: r.rezagadas,
      municipios: r.municipios,
      secciones: r.secciones,
      masVieja: entero(r.mas_vieja),
    }))

    const zonas: Zona[] = crudasZonas.map((z) => ({
      ...z,
      participacion: redondear(z.participacion, 0),
      riesgo: riesgoDeZona(z),
    }))

    const r = riesgoCrudo[0] ?? { zonas: 0, sin_dueno: 0, concentradas: 0, con_rezago: 0 }

    return {
      personas: ordenar(personas, f.orden, f.dir),
      ramas: agruparPorPerfil(personas),
      municipios: municipios.map((m) => ({
        ...m,
        participacion: redondear(m.participacion, 0),
      })),
      zonas,
      totales: totalesCrudos[0] ?? {
        peticiones: 0, abiertas: 0, rezagadas: 0,
        sinAsignar: 0, sinTerritorio: 0, municipios: 0, secciones: 0,
      },
      riesgo: {
        zonas: r.zonas,
        sinDueno: r.sin_dueno,
        concentradas: r.concentradas,
        conRezago: r.con_rezago,
      },
      detalle: persona ? { municipios: detalleMunicipios, secciones: detalleSecciones } : null,
      formal: formalCrudo[0] ?? { estructuras: 0, vinculos: 0 },
      opciones: {
        municipios: optMunicipios,
        personas: personas
          .filter((p) => p.asignadas > 0)
          .map((p) => ({ valor: p.id, etiqueta: p.nombre, conteo: p.asignadas })),
      },
    }
  })
}

/** Las ramas que sí existen hoy: el área a la que pertenece cada quien. */
function agruparPorPerfil(personas: Persona[]): Rama[] {
  const por = new Map<string, Rama>()
  for (const p of personas) {
    const clave = p.perfil ?? 'sin_perfil'
    const r = por.get(clave) ?? {
      perfil: clave, personas: 0, asignadas: 0, abiertas: 0, rezagadas: 0,
    }
    r.personas += 1
    r.asignadas += p.asignadas
    r.abiertas += p.abiertas
    r.rezagadas += p.rezagadas
    por.set(clave, r)
  }
  return [...por.values()].sort((a, b) => b.asignadas - a.asignadas)
}

function ordenar(filas: Persona[], orden: Orden, dir: 'asc' | 'desc') {
  const signo = dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (orden === 'nombre') return signo * a.nombre.localeCompare(b.nombre, 'es')
    // Quien no ha cerrado nada no tiene mediana. Ese hueco va siempre al
    // final: no es «el mejor tiempo».
    if (orden === 'mediana') {
      if (a.mediana === null && b.mediana === null) return 0
      if (a.mediana === null) return 1
      if (b.mediana === null) return -1
      return signo * (a.mediana - b.mediana)
    }
    return signo * (a[orden] - b[orden])
  })
}
