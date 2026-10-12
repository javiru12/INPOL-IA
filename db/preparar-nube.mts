/**
 * Deja lista una base de datos en la nube para recibir el sistema.
 *
 * En local, `00-base.sql` crea el rol `inpol_app` con una contraseña fija
 * (`inpol_local`) que está bien para una base que solo escucha en
 * localhost. En internet no: hay que darle una propia **antes** de migrar,
 * porque la migración solo lo crea si no existe.
 *
 * Recuerda por qué existen dos roles: la aplicación NO debe conectar con
 * el dueño de las tablas. PostgreSQL exime al dueño de sus propias
 * políticas de Row Level Security, así que conectar con él anularía el
 * aislamiento entre clientes sin que nada falle a la vista.
 *
 *   DATABASE_URL_ADMIN='postgres://...' CLAVE_APP='...' npx tsx db/preparar-nube.mts
 *
 * Después, con las mismas variables:
 *   npm run db:migrate && npm run db:seed && npm run db:demo
 *   npm run db:secciones && npm run db:movilizacion && npm run db:diad
 */
import postgres from 'postgres'

const url = process.env.DATABASE_URL_ADMIN
const clave = process.env.CLAVE_APP

if (!url) {
  console.error('\n  Falta DATABASE_URL_ADMIN: la cadena de conexión del dueño de la base.\n')
  process.exit(1)
}
if (!clave || clave.length < 16) {
  console.error('\n  Falta CLAVE_APP, o es muy corta (mínimo 16 caracteres).')
  console.error('  Es la contraseña del rol con el que la aplicación se conecta.\n')
  process.exit(1)
}

const sql = postgres(url, { max: 1, ssl: 'require' })

const [{ version }] = await sql<{ version: string }[]>`select version()`
console.log(`\n  Conectado a: ${version.split(',')[0]}`)

const [{ existe }] = await sql<{ existe: boolean }[]>`
  select exists (select 1 from pg_roles where rolname = 'inpol_app') as existe`

if (existe) {
  await sql.unsafe(`alter role inpol_app login password '${clave.replace(/'/g, "''")}'`)
  console.log('  Rol inpol_app: ya existía, se le cambió la contraseña.')
} else {
  await sql.unsafe(`create role inpol_app login password '${clave.replace(/'/g, "''")}'`)
  console.log('  Rol inpol_app: creado.')
}

await sql`grant usage on schema public to inpol_app`
await sql`alter default privileges in schema public
  grant select, insert, update, delete on tables to inpol_app`
await sql`alter default privileges in schema public
  grant usage, select on sequences to inpol_app`

// Si la base ya traía tablas de una corrida previa, los permisos por
// omisión no las alcanzan: hay que otorgarlos sobre lo que ya existe.
await sql`grant select, insert, update, delete on all tables in schema public to inpol_app`
await sql`grant usage, select on all sequences in schema public to inpol_app`

const [{ dueno }] = await sql<{ dueno: string }[]>`select current_user as dueno`
const [{ superusuario }] = await sql<{ superusuario: boolean }[]>`
  select coalesce(rolsuper, false) as superusuario from pg_roles where rolname = 'inpol_app'`

console.log(`\n  Dueño de las tablas: ${dueno}`)
console.log(`  ¿inpol_app es superusuario?: ${superusuario ? 'SÍ — el aislamiento NO aplicaría' : 'no (correcto)'}`)

if (superusuario) {
  console.error('\n  DETENTE: con inpol_app como superusuario, Row Level Security no se')
  console.error('  le aplica y un cliente vería los datos de otro.\n')
  process.exit(1)
}

const base = new URL(url)
const appUrl = `postgres://inpol_app:${encodeURIComponent(clave)}@${base.host}${base.pathname}${base.search}`

console.log('\n  Listo. Las dos variables para el despliegue:\n')
console.log(`  DATABASE_URL=${appUrl}`)
console.log(`  DATABASE_URL_ADMIN=${url}\n`)
console.log('  Ahora corre, con esas mismas variables en el entorno:')
console.log('    npm run db:migrate && npm run db:seed && npm run db:demo')
console.log('    npm run db:secciones && npm run db:movilizacion && npm run db:diad\n')

await sql.end()
