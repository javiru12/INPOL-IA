import postgres from 'postgres'
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
console.log(await admin`select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('inpol','inpol_app')`)
console.log(await admin`select tablename, policyname, cmd, qual, with_check from pg_policies where tablename in ('tenants','usuarios','problematicas','fuentes')`)
for (const t of ['problematicas','subproblematicas','dependencias','fuentes','estatus_peticiones','prioridades']) {
  const r = await admin.unsafe(`select tenant_id, ${t==='problematicas'||t==='subproblematicas'?'titulo':'descripcion'} as d, count(*)::int as n from ${t} group by 1,2 having count(*)>1`)
  if (r.length) console.log('DUPES en', t, r.length)
}
console.log(await admin`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('tenants','usuarios','problematicas')`)
await admin.end()
