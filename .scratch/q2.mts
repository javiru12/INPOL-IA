import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const todas = await sql<{clave:string; ps:string[]}[]>`
  select funcionalidad_clave as clave, array_agg(perfil_clave order by perfil_clave) as ps
  from perfil_funcionalidades group by 1 order by 1`
const igual = (a:string[], b:string[]) => a.length===b.length && a.every((x,i)=>x===b[i])
const buscar = (perfiles: string[]) => {
  const o = perfiles.slice().sort()
  console.log('\n=== exactamente', o.join(','), '===')
  for (const f of todas) if (igual(f.ps, o)) console.log('  ', f.clave)
}
buscar(['super_admin','admin','gestor_social','operador_gestion'])
buscar(['gestor_social','operador_gestion'])
buscar(['asignador'])
buscar(['marketing','gestor_social'])
console.log('\n=== claves que empiezan con marketing / interpretacion / peticiones ===')
for (const f of todas) if (/^(marketing|interpretacion|peticion)/.test(f.clave)) console.log('  ', f.clave, '->', f.ps.join(','))
await sql.end()
