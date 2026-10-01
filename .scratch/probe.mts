import postgres from 'postgres'
const app = postgres(process.env.DATABASE_URL!, { max: 1 })
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [{ id: mty }] = await admin`select id from tenants where clave='monterrey'`
const [{ id: chi }] = await admin`select id from tenants where clave='chihuahua'`

async function conTenant(t: string, fn: (tx: any) => Promise<any>) {
  return app.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${t}, true)`
    return fn(tx)
  })
}

// 1. insert catalogo con tenant propio
try {
  await conTenant(mty, async (tx) => {
    const [r] = await tx`insert into fuentes (tenant_id, descripcion) values (${mty}, 'PRUEBA_RLS') returning id`
    console.log('insert propio OK', r.id)
    throw new Error('rollback')
  })
} catch (e: any) { console.log('  (rollback)', e.message) }

// 2. insert con tenant ajeno → debe fallar
try {
  await conTenant(mty, async (tx) => {
    await tx`insert into fuentes (tenant_id, descripcion) values (${chi}, 'PRUEBA_FUGA') returning id`
    console.log('!!! insert ajeno PASÓ (mal)')
    throw new Error('rollback')
  })
} catch (e: any) { console.log('insert ajeno:', e.message.slice(0,90)) }

// 3. update tenants con rol app
try {
  await app.begin(async (tx) => {
    const r = await tx`update tenants set nombre_corto = nombre_corto where id = ${mty} returning clave`
    console.log('update tenants por app:', r.length ? 'OK' : 'cero filas')
    throw new Error('rollback')
  })
} catch (e: any) { console.log('  tenants:', e.message.slice(0,90)) }

// 4. ¿numeric como texto?
const [n] = await app`select count(*) as c, 1.5::numeric as x`
console.log('tipos:', typeof n.c, typeof n.x)

await app.end(); await admin.end()
