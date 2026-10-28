/**
 * Rangos de edad, en un solo lugar.
 *
 * Los usan la estadística, el mapa y el filtro de peticiones. Si cada
 * pantalla armara los suyos, el 18-24 de una no sería el de la otra y
 * los porcentajes dejarían de sumar entre pantallas.
 *
 * El corte de abajo es 18: por debajo no se vota, así que un «menor de
 * 18» en un sistema electoral casi siempre es un error de captura y
 * conviene que se vea aparte.
 */
export const RANGOS = [
  { clave: '18-24', etiqueta: '18 a 24', desde: 18, hasta: 24 },
  { clave: '25-34', etiqueta: '25 a 34', desde: 25, hasta: 34 },
  { clave: '35-44', etiqueta: '35 a 44', desde: 35, hasta: 44 },
  { clave: '45-54', etiqueta: '45 a 54', desde: 45, hasta: 54 },
  { clave: '55-64', etiqueta: '55 a 64', desde: 55, hasta: 64 },
  { clave: '65+', etiqueta: '65 o más', desde: 65, hasta: 120 },
] as const

export type ClaveRango = (typeof RANGOS)[number]['clave']

export function esRango(v: string | null | undefined): v is ClaveRango {
  return RANGOS.some((r) => r.clave === v)
}

export function rango(clave: string) {
  return RANGOS.find((r) => r.clave === clave) ?? null
}
