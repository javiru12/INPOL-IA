import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const filas = await sql<{p:string;f:string}[]>`select perfil_clave p, funcionalidad_clave f from perfil_funcionalidades`
const porPerfil = new Map<string,string[]>()
for (const r of filas) { const a = porPerfil.get(r.p) ?? []; a.push(r.f); porPerfil.set(r.p, a) }
const alcanza = (perms:string[], pref:string[]) => pref.some(p => perms.some(c => c===p || c.startsWith(p+'.')))
const rutas: [string,string[]][] = [
  ['/peticiones', ['creacion_de_peticion','estadisticas.peticiones','interpretacion']],
  ['/mensajes', ['mensajes']],
  ['/marketing', ['marketing']],
  ['/estadisticas', ['estadisticas']],
]
for (const [ruta, pref] of rutas) {
  const ps = [...porPerfil.entries()].filter(([,perms])=>alcanza(perms,pref)).map(([p])=>p).sort()
  console.log(ruta.padEnd(16), '->', ps.join(', '))
}
console.log('\nclaves de estadisticas.peticiones por perfil (muestra):')
for (const [p, perms] of [...porPerfil.entries()].sort()) {
  const n = perms.filter(c=>c.startsWith('estadisticas.peticiones')).length
  const panel = perms.filter(c=>c.startsWith('panel_de_inicio')).length
  console.log('  ', p.padEnd(22), 'estadisticas.peticiones:', String(n).padStart(3), ' panel_de_inicio:', panel)
}
console.log('\nclaves exactas de estadisticas.peticiones.estadisticas_generales* de super_admin:')
console.log(porPerfil.get('super_admin')!.filter(c=>c.startsWith('estadisticas.peticiones')).slice(0,12))
console.log('admin:')
console.log(porPerfil.get('admin')!.filter(c=>c.startsWith('estadisticas.peticiones')).slice(0,12))
console.log('gestor_social prioritarias:')
console.log(porPerfil.get('gestor_social')!.filter(c=>c.includes('prioritaria')))
console.log('operador_gestion prioritarias:')
console.log(porPerfil.get('operador_gestion')!.filter(c=>c.includes('prioritaria')))
await sql.end()
