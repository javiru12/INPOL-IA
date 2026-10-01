import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
console.log('seguimientos con usuario:')
console.table(await sql`select u.correo, u.perfil_clave, count(distinct s.peticion_id)::int peticiones from peticion_seguimientos s join usuarios u on u.id=s.usuario_id group by 1,2 order by 3 desc limit 30`)
console.log('peticiones con al menos un seguimiento de usuario, abiertas >30d:')
console.table(await sql`
  select u.correo, count(distinct p.id)::int n
  from peticiones p
  join peticion_seguimientos s on s.peticion_id = p.id
  join usuarios u on u.id = s.usuario_id
  join estatus_peticiones e on e.id = p.estatus_id
  where e.descripcion not in ('Completada','Cancelada') and p.fecha_apertura < now() - interval '30 days'
  group by 1 order by 2 desc limit 20`)
console.log('urgentes sin resolver por tenant:')
console.table(await sql`
  select t.clave, count(*)::int n from peticiones p join tenants t on t.id=p.tenant_id
  join prioridades pr on pr.id=p.prioridad_id join estatus_peticiones e on e.id=p.estatus_id
  where pr.descripcion='Urgente' and e.descripcion not in ('Completada','Cancelada') group by 1`)
console.log('no interpretadas por tenant:')
console.table(await sql`
  select t.clave, count(*)::int n from peticiones p join tenants t on t.id=p.tenant_id
  join estatus_peticiones e on e.id=p.estatus_id where e.descripcion='No interpretada' group by 1`)
await sql.end()
