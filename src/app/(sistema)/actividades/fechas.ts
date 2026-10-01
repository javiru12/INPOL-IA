import { mesLargo } from '@/lib/formato'

/**
 * Calendario de actividades: aritmética de días y meses sobre texto
 * 'AAAA-MM-DD' y 'AAAA-MM'. Las columnas `date` de Postgres no llevan
 * hora, así que convertirlas a Date local correría el día. El formato
 * en español lo pone `@/lib/formato`; aquí solo se arma la rejilla.
 */

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/**
 * Ancla una fecha sin hora al día local.
 *
 * `new Date('2026-09-30')` se interpreta como medianoche UTC y, en un huso
 * al oeste de Greenwich, se imprime como el 29. Con la hora explícita se
 * lee como medianoche local y el día es el que dice la base.
 */
export function delDia(iso: string | null | undefined) {
  return iso ? `${iso}T00:00:00` : null
}

function conMayuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** 'Septiembre de 2026', a partir de 'AAAA-MM'. */
export function etiquetaMes(mes: string) {
  return conMayuscula(mesLargo(delDia(`${mes}-01`)))
}

/** Mes del servidor, en hora local. */
export function mesActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/** Día del servidor, en hora local. */
export function diaActual() {
  const hoy = new Date()
  return `${mesActual()}-${String(hoy.getDate()).padStart(2, '0')}`
}

/** Acepta solo 'AAAA-MM' con mes real; cualquier otra cosa se ignora. */
export function mesValido(valor: string | undefined) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : undefined
}

export function desplazarMes(mes: string, meses: number) {
  const [anio, numero] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(anio, numero - 1 + meses, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export type Celda = { iso: string; dia: number; delMes: boolean }

/**
 * Rejilla mensual de lunes a domingo: completa la semana inicial con los
 * últimos días del mes anterior y la final con los primeros del siguiente,
 * de modo que el total siempre es múltiplo de siete.
 */
export function rejillaDelMes(mes: string): Celda[] {
  const [anio, numero] = mes.split('-').map(Number)
  const primero = new Date(Date.UTC(anio, numero - 1, 1))
  const ultimo = new Date(Date.UTC(anio, numero, 0))

  // getUTCDay() pone el domingo en 0; aquí la semana empieza en lunes.
  const antes = (primero.getUTCDay() + 6) % 7
  const despues = 6 - ((ultimo.getUTCDay() + 6) % 7)
  const total = antes + ultimo.getUTCDate() + despues

  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(anio, numero - 1, 1 - antes + i))
    const iso = d.toISOString().slice(0, 10)
    return { iso, dia: d.getUTCDate(), delMes: iso.slice(0, 7) === mes }
  })
}
