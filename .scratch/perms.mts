import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const r = await sql`
  select f.clave, string_agg(pf.perfil_clave, ', ' order by p.orden) as perfiles
  from funcionalidades f
  left join perfil_funcionalidades pf on pf.funcionalidad_clave = f.clave
  left join perfiles p on p.clave = pf.perfil_clave
  where f.clave like 'configuracion%'
  group by f.clave order by f.clave`
for (const x of r) console.log(x.clave.padEnd(62), x.perfiles)
await sql.end()
