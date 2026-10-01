import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const filas = await sql<{p:string;f:string}[]>`select perfil_clave p, funcionalidad_clave f from perfil_funcionalidades`
const porPerfil = new Map<string,string[]>()
for (const r of filas) { const a = porPerfil.get(r.p) ?? []; a.push(r.f); porPerfil.set(r.p, a) }
const alcanza = (perms:string[], pref:string[]) => pref.some(p => perms.some(c => c===p || c.startsWith(p+'.')))
const prueba = (nombre:string, pref:string[]) => {
  const ps = [...porPerfil.entries()].filter(([,perms])=>alcanza(perms,pref)).map(([p])=>p).sort()
  console.log(nombre.padEnd(28), '->', ps.join(', '))
}
prueba('urgentes(prioritarias pref)', ['estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias'])
prueba('urgentes(+encabezado)', ['estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias','encabezado.alertas.peticiones_prioritarias','panel_de_inicio.listados.peticiones_prioritarias'])
prueba('mias30(panel en_proceso)', ['panel_de_inicio.listados.peticiones_en_proceso'])
prueba('sin_interpretar(interpretacion)', ['interpretacion'])
prueba('avisos(marketing)', ['marketing'])
prueba('mensajes', ['mensajes'])
await sql.end()
