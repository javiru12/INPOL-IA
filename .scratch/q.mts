import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const r = await sql`select perfil_clave, count(*)::int as n from perfil_funcionalidades where funcionalidad_clave = 'mensajes' or funcionalidad_clave like 'mensajes.%' group by 1 order by 1`
console.log('perfiles con mensajes:', r)
const t = await sql`select id, clave, nombre from tenants order by clave`
console.log(t)
const u = await sql`select t.clave, u.perfil_clave, u.correo, u.nombre, u.apellido_paterno from usuarios u join tenants t on t.id=u.tenant_id order by t.clave, u.perfil_clave`
console.table(u)
await sql.end()
