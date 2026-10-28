
import { conTenant } from './db'

/**
 * Ejecuta una consulta escrita por el modelo.
 *
 * Dejar que un modelo escriba SQL suena temerario y en casi cualquier
 * sistema lo sería. Aquí se puede por una razón concreta: el
 * aislamiento no vive en el código, vive en la base. Las tablas llevan
 * Row Level Security con `force` y la aplicación conecta con el rol
 * `inpol_app`, que no es dueño ni superusuario. Una consulta que pida
 * los datos de otro cliente no devuelve filas —no porque alguien se
 * acuerde de filtrar, sino porque Postgres no se las entrega.
 *
 * Eso cubre lo que importa. Lo demás se cubre aquí:
 *
 * - Transacción de solo lectura, así que ningún `update` ni `delete`
 *   pasa aunque el modelo lo escriba o alguien se lo pida.
 * - Un tiempo máximo por consulta: una pregunta mal planteada puede
 *   producir un producto cartesiano y tirar la base para todos.
 * - Una sola sentencia, y que empiece por `select` o `with`.
 * - Columnas vetadas: el hash de la contraseña no tiene por qué salir
 *   en ninguna respuesta, y está dentro del propio cliente.
 * - Tope de filas devueltas, porque lo que vuelve se le manda al
 *   modelo y mil filas no caben ni sirven.
 */

const TIEMPO_MAXIMO_MS = 8000
const MAXIMO_FILAS = 500

/** Lo que nunca sale, aunque sea del propio cliente. */
const COLUMNAS_VETADAS = [
  'contrasena_hash',
  'codigo_hash',
  'session_secret',
  'contrasena',
]

export type Resultado =
  | { ok: true; filas: Record<string, unknown>[]; truncado: boolean }
  | { ok: false; error: string }

/**
 * Comprueba la forma de la consulta antes de mandarla.
 *
 * No pretende ser un analizador de SQL: la transacción de solo lectura
 * es lo que de verdad impide escribir. Esto corta antes los casos
 * obvios para que el modelo reciba un error claro y lo corrija, en vez
 * de un error de Postgres a media ejecución.
 */
function revisar(sql: string): string | null {
  const limpio = sql.trim().replace(/;\s*$/, '')

  if (limpio.includes(';')) {
    return 'Manda una sola sentencia, sin punto y coma intermedio.'
  }
  if (!/^(select|with)\b/i.test(limpio)) {
    return 'Solo se pueden hacer consultas: empieza con select o with.'
  }
  const prohibidas = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum)\b/i
  if (prohibidas.test(limpio)) {
    return 'Esa sentencia modifica datos y aquí solo se puede leer.'
  }
  for (const c of COLUMNAS_VETADAS) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(limpio)) {
      return `La columna ${c} no se puede consultar.`
    }
  }
  // `pg_` y `information_schema` no traen datos de nadie, pero sí la
  // forma de la base; no hacen falta para responder preguntas.
  if (/\b(pg_[a-z_]+|information_schema)\b/i.test(limpio)) {
    return 'Las tablas internas de Postgres no están disponibles.'
  }
  return null
}

export async function consultar(tenantId: string, sql: string): Promise<Resultado> {
  const problema = revisar(sql)
  if (problema) return { ok: false, error: problema }

  try {
    const filas = await conTenant(tenantId, async (tx) => {
      // El orden importa: las dos van antes de la consulta y dentro de
      // la misma transacción, que es lo que las hace valer.
      await tx.unsafe('set transaction read only')
      await tx.unsafe(`set local statement_timeout = ${TIEMPO_MAXIMO_MS}`)
      return tx.unsafe(sql.trim().replace(/;\s*$/, ''))
    })

    const todas = filas as unknown as Record<string, unknown>[]
    return {
      ok: true,
      filas: todas.slice(0, MAXIMO_FILAS),
      truncado: todas.length > MAXIMO_FILAS,
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    // El error de Postgres se le devuelve al modelo tal cual: es lo
    // que le permite corregir el nombre de una columna y reintentar
    // sin molestar a quien preguntó.
    return { ok: false, error: mensaje.slice(0, 400) }
  }
}
