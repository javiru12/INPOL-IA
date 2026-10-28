import 'server-only'
import type { conTenant } from './db'

type Sql = Parameters<Parameters<typeof conTenant>[1]>[0]

/**
 * La edad de un ciudadano, para agrupar y filtrar.
 *
 * Se calcula de la fecha de nacimiento cuando la hay, y solo si no la
 * hay se usa la columna `edad`: ese número se guardó el día de la
 * captura y no envejece solo, así que con los años miente. Hoy 800 de
 * 1,523 fichas traen fecha y el resto solo el número.
 *
 * Espera que la tabla `ciudadanos` venga con el alias `ci`.
 */
export const edadSql = (tx: Sql) => tx`
  coalesce(
    nullif(date_part('year', age(ci.fecha_nacimiento))::int, 0),
    ci.edad
  )`
