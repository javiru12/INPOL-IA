/**
 * Escalas de color para mapas.
 *
 * Secuencial: un solo tono, de claro a oscuro, con luminosidad estrictamente
 * decreciente (verificado). Nunca un arcoíris: en un mapa de intensidad el
 * ojo tiene que poder ordenar los colores sin consultar la leyenda.
 */
export const RAMPA_SECUENCIAL = [
  '#f6f1f8',
  '#e3d6ea',
  '#c7add6',
  '#a681bd',
  '#8459a0',
  '#633e7c',
  '#442955',
] as const

/** Territorio sin dato capturado. Distinto de un cero, que sí es un dato. */
export const SIN_DATO = '#eceaef'

/**
 * Colores institucionales de los partidos. Siempre acompañados del nombre
 * en texto: el color solo no identifica a nadie para quien no los conoce.
 */
export const PARTIDOS: Record<string, string> = {
  PAN: '#0a4fa0',
  PRI: '#0c7c3e',
  PRD: '#e6b800',
  PT: '#c8102e',
  PVEM: '#4faa46',
  MC: '#f07f13',
  MORENA: '#8d2434',
  NVA_ALIANZA: '#00a7b5',
  PES: '#6a2c8f',
  ES: '#6a2c8f',
  PH: '#b4651f',
  PD: '#8a6d3b',
  CC: '#6b7280',
}

export const COLOR_INDEPENDIENTE = '#55505f'
export const COLOR_OTRO_PARTIDO = '#9b96a3'

export function colorDePartido(clave: string | null | undefined) {
  if (!clave) return SIN_DATO
  const normalizada = clave.toUpperCase().trim()
  if (normalizada.startsWith('CAND_IND') || normalizada === 'INDEPENDIENTE') {
    return COLOR_INDEPENDIENTE
  }
  return PARTIDOS[normalizada] ?? COLOR_OTRO_PARTIDO
}

/** Nombre legible de la columna cruda del INE. */
export function nombreDePartido(clave: string) {
  const normalizada = clave.toUpperCase().trim()
  if (normalizada.startsWith('CAND_IND')) return 'Independiente'
  if (normalizada === 'NVA_ALIANZA') return 'Nueva Alianza'
  if (normalizada.includes('_')) return normalizada.split('_').join(' + ')
  return normalizada
}

/**
 * Reparte los valores en los pasos de la rampa por cuantiles, no en tramos
 * iguales. La demanda ciudadana se concentra en pocas zonas: con tramos
 * iguales el mapa saldría casi todo del color más claro y una sola colonia
 * del más oscuro, que no dice nada.
 */
export function escalaPorCuantiles(valores: (number | string | null | undefined)[]) {
  const positivos = valores
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
  const pasos = RAMPA_SECUENCIAL.length

  if (positivos.length === 0) {
    return { cortes: [] as number[], color: () => SIN_DATO, maximo: 0 }
  }

  const cortes: number[] = []
  for (let i = 1; i < pasos; i++) {
    const posicion = Math.floor((i / pasos) * positivos.length)
    cortes.push(positivos[Math.min(posicion, positivos.length - 1)])
  }

  return {
    cortes,
    maximo: positivos[positivos.length - 1],
    color(bruto: number | string | null | undefined) {
      if (bruto === null || bruto === undefined || bruto === '') return SIN_DATO
      const valor = Number(bruto)
      if (Number.isNaN(valor)) return SIN_DATO
      if (valor <= 0) return RAMPA_SECUENCIAL[0]
      let i = 0
      while (i < cortes.length && valor > cortes[i]) i++
      return RAMPA_SECUENCIAL[Math.min(i, RAMPA_SECUENCIAL.length - 1)]
    },
  }
}
