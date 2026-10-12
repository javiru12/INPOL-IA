import { PARTIDOS as COLORES, COLOR_INDEPENDIENTE, COLOR_OTRO_PARTIDO } from './escalas'

/**
 * Cómo se leen las fuerzas políticas en los resultados del INE.
 *
 * El INE no reporta una fila por partido: reporta una por **emblema
 * marcado**. Cuando el elector cruza varios emblemas de una misma
 * coalición, ese voto viaja en su propia clave (`PRI_PVEM`,
 * `PRI_PVEM_NVA_ALIANZA_PD`). Contarlas como fuerzas distintas parte el
 * voto de la coalición y puede dar un ganador equivocado: en gobernador
 * 2015 pasa en 20 de las 2,602 secciones.
 *
 * Aquí la coalición se suma al partido que la encabeza, que es la
 * convención con la que se leen los resultados en México.
 */

/** Claves que son un partido, no una coalición. Lo demás se agrupa. */
const SIMPLES = [
  'PAN', 'PRI', 'PRD', 'PT', 'PVEM', 'MC', 'MORENA',
  'NVA_ALIANZA', 'PH', 'ES', 'PES', 'PD', 'CC', 'CAN_NREG',
] as const

const NOMBRES: Record<string, string> = {
  PAN: 'PAN',
  PRI: 'PRI',
  PRD: 'PRD',
  PT: 'PT',
  PVEM: 'PVEM',
  MC: 'Movimiento Ciudadano',
  MORENA: 'Morena',
  NVA_ALIANZA: 'Nueva Alianza',
  PH: 'Humanista',
  ES: 'Encuentro Social',
  PES: 'Encuentro Social',
  PD: 'Demócrata',
  CC: 'Cruzada Ciudadana',
  CAN_NREG: 'No registrados',
  CAND_IND: 'Independiente',
}

/**
 * Prefijos que encabezan coalición, del más largo al más corto: hay que
 * probar `NVA_ALIANZA` antes que cualquier otro, porque su propia clave
 * lleva guion bajo y partirla por el separador daría «NVA».
 */
const CABEZAS = ['NVA_ALIANZA', 'MORENA', 'PVEM', 'PRI', 'PRD', 'PAN', 'PT', 'MC', 'PH', 'ES', 'PD', 'CC']

/** La fuerza a la que pertenece una clave del INE. */
export function fuerzaDe(clave: string): string {
  if (clave.startsWith('CAND_IND')) return 'CAND_IND'
  if ((SIMPLES as readonly string[]).includes(clave)) return clave
  return CABEZAS.find((c) => clave.startsWith(c + '_')) ?? clave
}

export function nombreDeFuerza(clave: string | null): string {
  if (!clave) return 'Sin resultados'
  return NOMBRES[clave] ?? clave.split('_').join('-')
}

export function colorDeFuerza(clave: string | null): string {
  if (!clave) return COLOR_OTRO_PARTIDO
  if (clave === 'CAND_IND') return COLOR_INDEPENDIENTE
  return COLORES[clave] ?? COLOR_OTRO_PARTIDO
}
