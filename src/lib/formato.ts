/**
 * Formato de fechas y cifras en español de México.
 *
 * No se usa `to_char` con TM de PostgreSQL: depende del `lc_time` del
 * servidor, que en los entornos donde corre esto viene en inglés y saca
 * "30 de September de 2026". Se formatea aquí, donde el resultado no
 * depende de cómo esté configurada la máquina.
 */

const LARGA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const CORTA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})
const CON_HORA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const MES_CORTO = new Intl.DateTimeFormat('es-MX', { month: 'short' })
const MES_LARGO = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })

type Fecha = Date | string | null | undefined

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

function aFecha(v: Fecha): Date | null {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v

  // Una columna `date` llega como '1971-12-30', que JavaScript interpreta
  // como medianoche UTC. Al formatearla en horario de México retrocedería
  // al día anterior, así que se ancla a medianoche local.
  const texto = SOLO_FECHA.test(v) ? `${v}T00:00:00` : v
  const d = new Date(texto)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fechaLarga(v: Fecha) {
  const d = aFecha(v)
  return d ? LARGA.format(d) : '—'
}

export function fechaCorta(v: Fecha) {
  const d = aFecha(v)
  return d ? CORTA.format(d) : '—'
}

export function fechaHora(v: Fecha) {
  const d = aFecha(v)
  return d ? CON_HORA.format(d) : '—'
}

/** «sep» — para los ejes de las gráficas temporales. */
export function mesCorto(v: Fecha) {
  const d = aFecha(v)
  if (!d) return '—'
  return MES_CORTO.format(d).replace('.', '')
}

/** «septiembre de 2026» */
export function mesLargo(v: Fecha) {
  const d = aFecha(v)
  return d ? MES_LARGO.format(d) : '—'
}

export function cifra(n: number | null | undefined) {
  return typeof n === 'number' ? n.toLocaleString('es-MX') : '—'
}

export function porcentaje(parte: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((parte / total) * 100)}%`
}
