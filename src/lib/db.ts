import 'server-only'
import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined
}

const URL_BASE = process.env.DATABASE_URL!

/**
 * En local la base vive en la misma máquina; en la nube, detrás de un
 * agrupador de conexiones. Las dos situaciones piden ajustes distintos:
 *
 * - **TLS** es obligatorio contra cualquier base remota, y estorba contra
 *   el PostgreSQL embebido, que solo escucha en localhost.
 * - **El agrupador en modo transacción** (puerto 6543 en Supabase) reparte
 *   una misma conexión entre peticiones, así que las sentencias preparadas
 *   se pierden de una a otra y fallan. Hay que apagarlas.
 * - **Pocas conexiones por instancia**: en serverless cada petición puede
 *   levantar su propia copia del proceso, y diez conexiones cada una agotan
 *   el cupo de la base en cuanto entran varias personas a la vez.
 */
const esLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(URL_BASE)
const porAgrupador = /:6543\//.test(URL_BASE)

/**
 * Conexión de la aplicación. Usa el rol `inpol_app`, que NO es dueño
 * de las tablas: así las políticas de Row Level Security se le aplican
 * siempre. Nunca conectar la app con el rol dueño.
 */
export const sql =
  global.__sql ??
  postgres(URL_BASE, {
    max: esLocal ? 10 : 3,
    idle_timeout: 20,
    transform: { undefined: null },
    ...(esLocal ? {} : { ssl: 'require' as const }),
    ...(porAgrupador ? { prepare: false } : {}),
  })

if (process.env.NODE_ENV !== 'production') global.__sql = sql

export type Sql = typeof sql

/**
 * Ejecuta un bloque dentro del contexto de un tenant.
 *
 * Fija `app.tenant_id` como variable LOCAL a la transacción; las políticas
 * de RLS la leen y filtran cada consulta. Si se olvida un WHERE en el
 * código, la base igual no deja salir datos de otro cliente.
 *
 * Toda lectura o escritura de datos de cliente pasa por aquí. Sin excepción.
 */
export async function conTenant<T>(
  tenantId: string,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as Sql)
  }) as Promise<T>
}

/**
 * Para catálogos globales (geografía electoral, perfiles) y para la
 * consola de plataforma. No fija tenant: úsese solo cuando la consulta
 * de verdad no toca datos de un cliente.
 */
export const sinTenant = sql
