import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const migs = await sql`select nombre from migraciones order by nombre`
console.log('migraciones:', migs.map(m => m.nombre).join(', '))
const t = await sql`select id, clave, nombre, nombre_corto, color_acento, licencia_inicia::text, licencia_vence::text from tenants order by clave`
console.log(t)
const p = await sql`select clave, nombre, orden from perfiles order by orden`
console.log(p)
const mty = t.find((x:any)=>x.clave==='monterrey')!
await sql`select set_config('app.tenant_id', ${mty.id}, false)`
for (const tabla of ['problematicas','subproblematicas','dependencias','fuentes','estatus_peticiones','prioridades','tipos_campania','sectores','origenes','campanias','candidatos','usuarios']) {
  const [{ n }] = await sql.unsafe(`select count(*)::int as n from ${tabla}`)
  console.log(tabla.padEnd(24), n)
}
console.log(await sql`select descripcion from estatus_peticiones order by descripcion`)
console.log(await sql`select descripcion from prioridades order by descripcion`)
await sql.end()
