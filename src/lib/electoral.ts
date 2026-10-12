import 'server-only'
import type { Sql } from './db'

/**
 * Lo común a toda consulta electoral: de qué elección hablamos y cómo se
 * agrupan las claves del INE en fuerzas políticas.
 *
 * El año y la elección estuvieron escritos a mano dentro de las consultas
 * de `/territorio` y `/mapa`, lo que dejó invisibles los 29,478 registros
 * de diputado local que llevan cargados desde el principio. Aquí son un
 * parámetro.
 */

export const ANIO = 2015

export const ELECCIONES = [
  { valor: 'gobernador', etiqueta: 'Gobernador 2015' },
  { valor: 'diputado_mr', etiqueta: 'Diputado local 2015' },
] as const

export type Eleccion = (typeof ELECCIONES)[number]['valor']

export function esEleccion(v: string | undefined): v is Eleccion {
  return !!v && ELECCIONES.some((e) => e.valor === v)
}

/**
 * El INE reporta una fila por emblema marcado, así que el voto de una
 * coalición viaja en claves propias (`PRI_PVEM`). Contarlas como fuerzas
 * sueltas parte el voto y cambia el ganador en 20 de las 2,602 secciones.
 *
 * El orden de los casos importa: `NVA_ALIANZA_` tiene que probarse antes
 * que nada, porque la clave del propio partido ya lleva guion bajo.
 *
 * Espera que la tabla de resultados esté aliasada como `r`.
 */
export const fuerzaSql = (tx: Sql) => tx`
  case
    when starts_with(r.partido, 'CAND_IND')      then 'CAND_IND'
    when starts_with(r.partido, 'NVA_ALIANZA_')  then 'NVA_ALIANZA'
    when starts_with(r.partido, 'PRI_')          then 'PRI'
    when starts_with(r.partido, 'PAN_')          then 'PAN'
    when starts_with(r.partido, 'PVEM_')         then 'PVEM'
    when starts_with(r.partido, 'PRD_')          then 'PRD'
    when starts_with(r.partido, 'MORENA_')       then 'MORENA'
    when starts_with(r.partido, 'PT_')           then 'PT'
    when starts_with(r.partido, 'MC_')           then 'MC'
    else r.partido
  end`
