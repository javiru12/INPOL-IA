import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const claves = [
  'encabezado.alertas.peticiones_prioritarias',
  'panel_de_inicio.listados.peticiones_prioritarias',
  'panel_de_inicio.listados.peticiones_en_proceso',
  'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias',
  'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.no_interpretadas',
  'interpretacion.listado_de_entrevistas',
  'marketing.campanas',
  'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.completadas.detalle_de_peticion.envio_de_mensajes',
  'mensajes.ver_mensajes',
]
for (const c of claves) {
  const r = await sql<{p:string}[]>`select perfil_clave as p from perfil_funcionalidades where funcionalidad_clave = ${c} order by 1`
  console.log(c.padEnd(100), '->', r.map(x=>x.p).join(',') || '(no existe o nadie)')
}
await sql.end()
