/**
 * Paleta de gráficas.
 *
 * El orden es fijo y no se cicla: cada categoría conserva su color aunque
 * cambien los filtros. Validada para daltonismo contra superficie clara
 * (banda de luminosidad, piso de croma, separación deuteranopía/tritanopía
 * y contraste). El par oliva↔rosa queda en la banda 6–8 de separación, por
 * lo que las series siempre llevan etiqueta directa además del color.
 */
export const CATEGORICA = [
  '#714a85', // morado INPOL
  '#c2410c', // naranja quemado
  '#0891b2', // cian
  '#be185d', // rosa oscuro
  '#4d7c0f', // oliva
  '#1d4ed8', // azul
  '#b45309', // ámbar
  '#047857', // verde azulado
] as const

/** A partir de la novena categoría todo se agrupa en «Otras». */
export const MAXIMO_CATEGORIAS = 7
export const COLOR_OTRAS = '#9b96a3'

export function colorDeIndice(i: number) {
  return i < CATEGORICA.length ? CATEGORICA[i] : COLOR_OTRAS
}

/** Colores de estado. Nunca van solos: siempre acompañados de su etiqueta. */
export const ESTADO = {
  exito: '#2f7a52',
  aviso: '#a8700f',
  alerta: '#b33c30',
  dato: '#2a6690',
  neutro: '#857f90',
} as const

/** Agrupa la cola de una distribución para no pasar de 8 colores. */
export function agruparCola<T extends { etiqueta: string; valor: number }>(
  datos: T[],
  maximo = MAXIMO_CATEGORIAS,
): { etiqueta: string; valor: number; color: string }[] {
  const ordenados = [...datos].sort((a, b) => b.valor - a.valor)
  const cabeza: { etiqueta: string; valor: number; color: string }[] =
    ordenados.slice(0, maximo).map((d, i) => ({
      etiqueta: d.etiqueta,
      valor: d.valor,
      color: CATEGORICA[i],
    }))
  const cola = ordenados.slice(maximo)
  if (cola.length) {
    cabeza.push({
      etiqueta: `Otras (${cola.length})`,
      valor: cola.reduce((s, d) => s + d.valor, 0),
      color: COLOR_OTRAS,
    })
  }
  return cabeza
}
