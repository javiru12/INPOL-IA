import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
for (const c of [
 'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias.listado',
 'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias.detalle',
 'panel_de_inicio.listados.peticiones_prioritarias',
]) {
  const r = await sql<{p:string}[]>`select perfil_clave p from perfil_funcionalidades where funcionalidad_clave=${c} order by 1`
  console.log(c.split('.').pop()!.padEnd(12), c.startsWith('panel')?'(panel)':'(estad)', '->', r.map(x=>x.p).join(', '))
}
await sql.end()
