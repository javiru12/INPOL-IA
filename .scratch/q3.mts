import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
console.table(await sql`select t.clave, count(*)::int n, count(p.creado_por)::int con_creador from peticiones p join tenants t on t.id=p.tenant_id group by 1`)
console.table(await sql`select u.correo, count(*)::int n from peticiones p join usuarios u on u.id=p.creado_por group by 1 order by 2 desc limit 12`)
console.table(await sql`select e.descripcion, count(*)::int n from peticiones p join estatus_peticiones e on e.id=p.estatus_id group by 1 order by 2 desc`)
console.table(await sql`select pr.descripcion, count(*)::int n from peticiones p join prioridades pr on pr.id=p.prioridad_id group by 1 order by 2 desc`)
console.table(await sql`select tipo, count(*)::int n from peticion_seguimientos group by 1`)
console.table(await sql`select count(*)::int total, count(*) filter (where fecha_apertura < now() - interval '30 days')::int viejas from peticiones`)
await sql.end()
