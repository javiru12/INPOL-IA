import 'server-only'
import { conTenant } from '@/lib/db'

/**
 * Movilización: la pirámide que lleva gente a votar.
 *
 * Un movilizador se compromete a llevar a N personas. Cada persona que
 * registra es un promovido, y ese promovido recorre un embudo:
 * prospecto → contactado → comprometido → confirmado.
 *
 * La pantalla contesta una sola pregunta, que es la que se hace la
 * campaña todos los días: cuánto le falta a cada quien para su meta, y
 * dónde está ese faltante.
 *
 * Dos convenciones que valen para todo el módulo:
 *
 *  · AVANCE — promovidos registrados entre meta comprometida. No se
 *    cuenta sobre confirmados: confirmar es el final del embudo y
 *    medirlo así castigaría al que apenas arrancó la captura.
 *  · ZONA — la del movilizador, deducida de la sección electoral de su
 *    ficha ciudadana. Es la misma cadena que usa el resto del sistema
 *    (ciudadano → sección → municipio) y no una captura aparte.
 */

/** Debajo de esta fracción de su meta, el movilizador está en rezago. */
export const UMBRAL_REZAGO = 0.5

/** A partir de aquí la meta se da por cumplida. */
export const UMBRAL_CUMPLIDA = 1

export const ESTADOS = ['prospecto', 'contactado', 'comprometido', 'confirmado'] as const
export type EstadoProspeccion = (typeof ESTADOS)[number]

export function esEstado(v: string | undefined): v is EstadoProspeccion {
  return !!v && (ESTADOS as readonly string[]).includes(v)
}

export const ETIQUETA_ESTADO: Record<EstadoProspeccion, string> = {
  prospecto: 'Prospecto',
  contactado: 'Contactado',
  comprometido: 'Comprometido',
  confirmado: 'Confirmado',
}

export const ETIQUETA_PROSPECTO: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  rechazado: 'Rechazado',
  convertido: 'Convertido',
}

export const ORDENES = [
  'nombre',
  'zona',
  'meta',
  'promovidos',
  'avance',
  'confirmados',
] as const
export type Orden = (typeof ORDENES)[number]

export function esOrden(v: string | undefined): v is Orden {
  return !!v && (ORDENES as readonly string[]).includes(v)
}

/** Qué pinta el mapa. */
export type Pinta = 'promovidos' | 'avance'

export function esPinta(v: string | undefined): v is Pinta {
  return v === 'promovidos' || v === 'avance'
}

/** Cómo va el movilizador contra su meta. */
export type Marcha = 'rezago' | 'camino' | 'cumplida'

export function esMarcha(v: string | undefined): v is Marcha {
  return v === 'rezago' || v === 'camino' || v === 'cumplida'
}

export function marchaDe(avance: number): Marcha {
  if (avance >= UMBRAL_CUMPLIDA) return 'cumplida'
  if (avance < UMBRAL_REZAGO) return 'rezago'
  return 'camino'
}

export type FiltrosMovilizacion = {
  municipio?: string
  marcha?: Marcha
  responsable?: string
  orden: Orden
  dir: 'asc' | 'desc'
}

export type Movilizador = {
  id: string
  nombre: string
  tipo: string | null
  municipio: string | null
  seccion: string | null
  colonia: string | null
  responsable: string | null
  meta: number
  promovidos: number
  confirmados: number
  comprometidos: number
  simpatizantes: number
  /** Fracción de 0 a lo que dé: 1.2 significa que rebasó su meta 20%. */
  avance: number
  marcha: Marcha
  /** Días desde el último registro suyo. Null si nunca ha registrado. */
  diasSinRegistrar: number | null
}

export type MunicipioMovilizacion = {
  clave: string
  nombre: string
  movilizadores: number
  meta: number
  promovidos: number
  confirmados: number
  avance: number | null
}

export type Totales = {
  movilizadores: number
  meta: number
  promovidos: number
  confirmados: number
  comprometidos: number
  simpatizantes: number
  sinRegistrar: number
}

export type TramoEmbudo = { estado: EstadoProspeccion; promovidos: number }

export type Prospecto = {
  id: string
  nombre: string
  colonia: string | null
  telefono: string | null
  estado: string
  meta_propuesta: number | null
  responsable: string | null
  proximo_contacto: string | null
  llamadas: number
  ultimo: string | null
}

export type Opcion = { valor: string; etiqueta: string; conteo?: number }

export type PanelDeMovilizacion = {
  movilizadores: Movilizador[]
  municipios: MunicipioMovilizacion[]
  embudo: TramoEmbudo[]
  totales: Totales
  prospectos: Prospecto[]
  tipos: { id: string; descripcion: string }[]
  opciones: { municipios: Opcion[]; responsables: Opcion[] }
}

/** Postgres devuelve `numeric` como texto: todo cociente llega ya en
 *  float8 desde la consulta, y aun así se normaliza aquí. */
function aNumero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function panelDeMovilizacion(
  tenantId: string,
  f: FiltrosMovilizacion,
): Promise<PanelDeMovilizacion> {
  const mun = f.municipio ?? null
  const resp = f.responsable ?? null

  return conTenant(tenantId, async (tx) => {
    // Los fragmentos se producen en funciones y nunca se guardan en una
    // variable: cada uso genera su propio juego de parámetros aunque el
    // mismo trozo aparezca dos veces en la misma consulta.
    const origen = () => tx`
      from movilizadores m
      join ciudadanos c on c.id = m.ciudadano_id
      left join secciones s on s.id = c.seccion_id
      left join municipios mu on mu.id = s.municipio_id
      left join tipos_movilizador tm on tm.id = m.tipo_movilizador_id
      left join usuarios u on u.id = m.responsable_id`

    // `nombre_completo` llega nulo en parte del padrón importado: se arma
    // con las partes cuando falta, igual que en el listado de ciudadanos.
    const comoSeLlama = () => tx`
      coalesce(
        nullif(trim(c.nombre_completo), ''),
        nullif(trim(concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)), ''),
        'Sin nombre')`

    const conteo = () => tx`
      left join lateral (
        select count(*)::int as promovidos,
               count(*) filter (where p.estado = 'confirmado')::int as confirmados,
               count(*) filter (where p.estado in ('comprometido','confirmado'))::int as comprometidos,
               count(*) filter (where p.simpatizante)::int as simpatizantes,
               max(p.creado_en) as ultimo
        from promovidos p
        where p.movilizador_id = m.id
      ) pr on true`

    const filtros = () => tx`
      where m.activo = true
        and m.ciudadano_id is not null
        and (${mun}::text is null or mu.nombre = ${mun}::text)
        and (${resp}::uuid is null or m.responsable_id = ${resp}::uuid)`

    const [
      crudos,
      municipios,
      embudo,
      totalesCrudos,
      prospectos,
      optMunicipios,
      optResponsables,
      tipos,
    ] = await Promise.all([
        // 1 · Los movilizadores, con su avance contra la meta.
        tx<
          {
            id: string
            nombre: string
            tipo: string | null
            municipio: string | null
            seccion: string | null
            colonia: string | null
            responsable: string | null
            meta: number
            promovidos: number
            confirmados: number
            comprometidos: number
            simpatizantes: number
            avance: number
            dias_sin_registrar: number | null
          }[]
        >`
          select m.id,
                 ${comoSeLlama()} as nombre,
                 tm.descripcion as tipo,
                 mu.nombre as municipio,
                 s.clave as seccion,
                 c.colonia,
                 nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
                 m.meta,
                 coalesce(pr.promovidos, 0) as promovidos,
                 coalesce(pr.confirmados, 0) as confirmados,
                 coalesce(pr.comprometidos, 0) as comprometidos,
                 coalesce(pr.simpatizantes, 0) as simpatizantes,
                 -- Sin el cast, el cociente sale numeric y viaja como
                 -- texto: las comparaciones y la escala de color fallan
                 -- sin avisar.
                 (coalesce(pr.promovidos, 0)::float8
                   / nullif(m.meta, 0)::float8) as avance,
                 extract(day from now() - pr.ultimo)::float8 as dias_sin_registrar
          ${origen()}
          ${conteo()}
          ${filtros()}`,

        // 2 · El territorio. La zona es la del movilizador, así la meta y
        // los promovidos se suman sobre la misma base.
        tx<MunicipioMovilizacion[]>`
          select mu.clave,
                 mu.nombre,
                 count(*)::int as movilizadores,
                 coalesce(sum(m.meta), 0)::int as meta,
                 coalesce(sum(pr.promovidos), 0)::int as promovidos,
                 coalesce(sum(pr.confirmados), 0)::int as confirmados,
                 (coalesce(sum(pr.promovidos), 0)::float8
                   / nullif(sum(m.meta), 0)::float8) as avance
          ${origen()}
          ${conteo()}
          ${filtros()}
            and mu.clave is not null
          group by mu.clave, mu.nombre
          order by 5 desc, 2`,

        // 3 · El embudo de prospección, sobre los mismos movilizadores
        // que está mirando el usuario.
        tx<TramoEmbudo[]>`
          select p.estado, count(*)::int as promovidos
          from promovidos p
          join movilizadores m on m.id = p.movilizador_id
          join ciudadanos c on c.id = m.ciudadano_id
          left join secciones s on s.id = c.seccion_id
          left join municipios mu on mu.id = s.municipio_id
          ${filtros()}
          group by 1`,

        // 4 · Totales de la cabecera.
        tx<Totales[]>`
          select count(*)::int as movilizadores,
                 coalesce(sum(m.meta), 0)::int as meta,
                 coalesce(sum(pr.promovidos), 0)::int as promovidos,
                 coalesce(sum(pr.confirmados), 0)::int as confirmados,
                 coalesce(sum(pr.comprometidos), 0)::int as comprometidos,
                 coalesce(sum(pr.simpatizantes), 0)::int as simpatizantes,
                 count(*) filter (where coalesce(pr.promovidos, 0) = 0)::int as "sinRegistrar"
          ${origen()}
          ${conteo()}
          ${filtros()}`,

        // 5 · A quién se está invitando a sumarse a la red.
        tx<Prospecto[]>`
          select pm.id,
                 ${comoSeLlama()} as nombre,
                 c.colonia,
                 c.telefono_movil as telefono,
                 pm.estado,
                 pm.meta_propuesta,
                 nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
                 pm.proximo_contacto::text as proximo_contacto,
                 coalesce(sg.llamadas, 0) as llamadas,
                 sg.ultimo::text as ultimo
          from prospectos_movilizador pm
          join ciudadanos c on c.id = pm.ciudadano_id
          left join usuarios u on u.id = pm.responsable_id
          left join lateral (
            select count(*) filter (where s.tipo = 'llamada')::int as llamadas,
                   max(s.creado_en) as ultimo
            from prospecto_seguimientos s
            where s.prospecto_id = pm.id
          ) sg on true
          where pm.activo = true
            and (${resp}::uuid is null or pm.responsable_id = ${resp}::uuid)
          order by case pm.estado
                     when 'interesado' then 0 when 'contactado' then 1
                     when 'nuevo' then 2 when 'convertido' then 3 else 4 end,
                   pm.proximo_contacto nulls last,
                   nombre`,

        // 6 y 7 · Opciones de los selectores, sin su propio filtro
        // aplicado: elegir un municipio no debe borrar los demás.
        tx<Opcion[]>`
          select mu.nombre as valor, mu.nombre as etiqueta, count(*)::int as conteo
          from movilizadores m
          join ciudadanos c on c.id = m.ciudadano_id
          join secciones s on s.id = c.seccion_id
          join municipios mu on mu.id = s.municipio_id
          where m.activo = true
          group by 1, 2
          order by 1`,

        tx<Opcion[]>`
          select u.id::text as valor,
                 coalesce(nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), ''), u.correo)
                   as etiqueta,
                 count(*)::int as conteo
          from movilizadores m
          join usuarios u on u.id = m.responsable_id
          where m.activo = true
          group by 1, 2
          order by 2`,

        // 8 · Catálogo propio del cliente, para el alta.
        tx<{ id: string; descripcion: string }[]>`
          select id, descripcion from tipos_movilizador
          where activo = true order by descripcion`,
      ])

    const movilizadores: Movilizador[] = crudos.map((r) => {
      const avance = aNumero(r.avance)
      return {
        id: r.id,
        nombre: r.nombre,
        tipo: r.tipo,
        municipio: r.municipio,
        seccion: r.seccion,
        colonia: r.colonia,
        responsable: r.responsable,
        meta: r.meta,
        promovidos: r.promovidos,
        confirmados: r.confirmados,
        comprometidos: r.comprometidos,
        simpatizantes: r.simpatizantes,
        avance,
        marcha: marchaDe(avance),
        diasSinRegistrar:
          r.dias_sin_registrar === null ? null : Math.round(aNumero(r.dias_sin_registrar)),
      }
    })

    const filtrados = f.marcha
      ? movilizadores.filter((m) => m.marcha === f.marcha)
      : movilizadores

    return {
      movilizadores: ordenar(filtrados, f.orden, f.dir),
      municipios: municipios.map((m) => ({ ...m, avance: m.avance === null ? null : aNumero(m.avance) })),
      embudo: ESTADOS.map((estado) => ({
        estado,
        promovidos: embudo.find((e) => e.estado === estado)?.promovidos ?? 0,
      })),
      totales: totalesCrudos[0] ?? {
        movilizadores: 0, meta: 0, promovidos: 0, confirmados: 0,
        comprometidos: 0, simpatizantes: 0, sinRegistrar: 0,
      },
      prospectos,
      tipos,
      opciones: { municipios: optMunicipios, responsables: optResponsables },
    }
  })
}

function ordenar(filas: Movilizador[], orden: Orden, dir: 'asc' | 'desc') {
  const signo = dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (orden === 'nombre') return signo * a.nombre.localeCompare(b.nombre, 'es')
    if (orden === 'zona') {
      const za = [a.municipio ?? '', a.seccion ?? ''].join(' ')
      const zb = [b.municipio ?? '', b.seccion ?? ''].join(' ')
      return signo * za.localeCompare(zb, 'es')
    }
    const d = signo * (a[orden] - b[orden])
    // Empate frecuente en metas y confirmados: el nombre desempata para
    // que el orden sea estable entre recargas.
    return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es')
  })
}

// ------------------------------------------------------------------
// Ficha de un movilizador
// ------------------------------------------------------------------

export type FichaMovilizador = {
  id: string
  ciudadanoId: string
  nombre: string
  tipo: string | null
  municipio: string | null
  seccion: string | null
  colonia: string | null
  telefono: string | null
  correo: string | null
  responsable: string | null
  responsableId: string | null
  meta: number
  alta: string
  notas: string | null
}

export type PromovidoDeLaFicha = {
  id: string
  ciudadanoId: string
  nombre: string
  edad: number | null
  colonia: string | null
  seccion: string | null
  telefono: string | null
  estado: EstadoProspeccion
  simpatizante: boolean
  afinidad: string | null
  fecha_compromiso: string | null
  fecha_confirmacion: string | null
  notas: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Devuelve null si el id no existe o si pertenece a otro cliente: el RLS
 * filtra la fila y aquí no se distingue un caso del otro, que es justo
 * lo que se quiere.
 */
export async function obtenerMovilizador(tenantId: string, id: string) {
  if (!UUID.test(id)) return null

  return conTenant(tenantId, async (tx) => {
    const [movilizador] = await tx<FichaMovilizador[]>`
      select m.id,
             m.ciudadano_id as "ciudadanoId",
             coalesce(
               nullif(trim(c.nombre_completo), ''),
               nullif(trim(concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)), ''),
               'Sin nombre') as nombre,
             tm.descripcion as tipo,
             mu.nombre as municipio,
             s.clave as seccion,
             c.colonia,
             c.telefono_movil as telefono,
             c.correo,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
             m.responsable_id::text as "responsableId",
             m.meta,
             m.creado_en::text as alta,
             m.notas
      from movilizadores m
      join ciudadanos c on c.id = m.ciudadano_id
      left join secciones s on s.id = c.seccion_id
      left join municipios mu on mu.id = s.municipio_id
      left join tipos_movilizador tm on tm.id = m.tipo_movilizador_id
      left join usuarios u on u.id = m.responsable_id
      where m.id = ${id} and m.activo = true`

    if (!movilizador) return null

    const promovidos = await tx<PromovidoDeLaFicha[]>`
      select p.id,
             p.ciudadano_id as "ciudadanoId",
             coalesce(
               nullif(trim(c.nombre_completo), ''),
               nullif(trim(concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)), ''),
               'Sin nombre') as nombre,
             coalesce(c.edad, extract(year from age(c.fecha_nacimiento))::int) as edad,
             c.colonia,
             s.clave as seccion,
             c.telefono_movil as telefono,
             p.estado,
             p.simpatizante,
             p.afinidad,
             -- Una columna date enviada como 2026-03-04 se parsea en UTC y al
             -- formatearlo en hora de México retrocede un día. Los
             -- helpers de lib/formato lo anclan a medianoche local.
             p.fecha_compromiso::text,
             p.fecha_confirmacion::text,
             p.notas
      from promovidos p
      join ciudadanos c on c.id = p.ciudadano_id
      left join secciones s on s.id = c.seccion_id
      where p.movilizador_id = ${id} and p.activo = true
      order by case p.estado
                 when 'confirmado' then 0 when 'comprometido' then 1
                 when 'contactado' then 2 else 3 end,
               nombre`

    const [resumen] = await tx<
      {
        promovidos: number
        confirmados: number
        comprometidos: number
        simpatizantes: number
        secciones: number
      }[]
    >`
      select count(*)::int as promovidos,
             count(*) filter (where p.estado = 'confirmado')::int as confirmados,
             count(*) filter (where p.estado in ('comprometido','confirmado'))::int as comprometidos,
             count(*) filter (where p.simpatizante)::int as simpatizantes,
             count(distinct c.seccion_id)::int as secciones
      from promovidos p
      join ciudadanos c on c.id = p.ciudadano_id
      where p.movilizador_id = ${id} and p.activo = true`

    return {
      movilizador,
      promovidos,
      resumen: resumen ?? {
        promovidos: 0, confirmados: 0, comprometidos: 0, simpatizantes: 0, secciones: 0,
      },
    }
  })
}
