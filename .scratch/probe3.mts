import postgres from 'postgres'
const app = postgres(process.env.DATABASE_URL!, { max: 1 })
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [{ id: mty }] = await admin`select id from tenants where clave='monterrey'`
const [{ id: chi }] = await admin`select id from tenants where clave='chihuahua'`
console.log('lectura sin tenant:', (await app`select clave from tenants order by clave`).map(r=>r.clave))
// update propio
try { await app.begin(async (tx:any) => {
  await tx`select set_config('app.tenant_id', ${mty}, true)`
  const r = await tx`update tenants set nombre_corto = 'X' where id = ${mty} returning clave`
  console.log('update propio:', r.length ? 'OK' : 'CERO FILAS')
  const a = await tx`update tenants set nombre_corto = 'X' where id = ${chi} returning clave`
  console.log('update ajeno:', a.length ? '!!! PASÓ' : 'bloqueado (cero filas)')
  throw new Error('rollback')
}) } catch (e:any) { console.log(' ', e.message.slice(0,80)) }
await app.end(); await admin.end()
