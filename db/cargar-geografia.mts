/**
 * Carga el catálogo electoral de un estado: municipios, distritos y
 * secciones.
 *
 * El archivo lo genera `herramientas/catalogo-desde-shapefile.py` a
 * partir del Marco Geográfico del INE. Aquí solo se sube.
 *
 *   npx tsx --env-file=.env.local db/cargar-geografia.mts 08 17 03
 *
 * Sin argumentos carga todos los archivos de `db/geografia/`.
 *
 * La geografía electoral es catálogo público compartido —dos campañas
 * en el mismo estado ven las mismas secciones— así que estas tablas no
 * llevan `tenant_id` y no pasan por el aislamiento. Lo que decide qué
 * ve cada cliente es `tenants.estado_id`.
 *
 * Es idempotente: se puede volver a correr cuando el INE publique la
 * distritación definitiva para 2027 sin duplicar nada.
 */
import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

type Catalogo = {
  estado: { clave: string; nombre: string }
  municipios: { clave: string; nombre: string; latitud: number | null; longitud: number | null }[]
  distritos: { ambito: string; clave: string; latitud: number | null; longitud: number | null }[]
  secciones: {
    clave: string
    municipio: string
    distrito_local: string
    distrito_federal: string
    tipo: string | null
    latitud: number | null
    longitud: number | null
  }[]
}

const CARPETA = join(import.meta.dirname, 'geografia')
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

const claves =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : readdirSync(CARPETA)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))

for (const clave of claves) {
  const c: Catalogo = JSON.parse(readFileSync(join(CARPETA, `${clave}.json`), 'utf8'))

  const [estado] = await sql<{ id: string }[]>`
    insert into estados (clave, nombre, activo)
    values (${c.estado.clave}, ${c.estado.nombre}, true)
    on conflict (clave) do update set nombre = excluded.nombre
    returning id`

  // Los municipios van primero: las secciones los referencian.
  for (const m of c.municipios) {
    await sql`
      insert into municipios (estado_id, clave, nombre, latitud, longitud, activo)
      values (${estado.id}, ${m.clave}, ${m.nombre}, ${m.latitud}, ${m.longitud}, true)
      on conflict (estado_id, clave) do update
        set nombre = excluded.nombre,
            latitud = excluded.latitud,
            longitud = excluded.longitud`
  }

  for (const d of c.distritos) {
    await sql`
      insert into distritos (estado_id, ambito, clave, nombre, latitud, longitud, activo)
      values (${estado.id}, ${d.ambito}, ${d.clave}, ${'DISTRITO ' + d.clave},
              ${d.latitud}, ${d.longitud}, true)
      on conflict (estado_id, ambito, clave) do update
        set latitud = excluded.latitud, longitud = excluded.longitud`
  }

  // Un mapa en memoria y no un subselect por renglón: son miles de
  // secciones y resolver cada clave contra la base las vuelve miles de
  // viajes de ida y vuelta.
  const mun = new Map(
    (
      await sql<{ clave: string; id: string }[]>`
        select clave, id from municipios where estado_id = ${estado.id}`
    ).map((r) => [r.clave, r.id]),
  )
  const dis = new Map(
    (
      await sql<{ ambito: string; clave: string; id: string }[]>`
        select ambito, clave, id from distritos where estado_id = ${estado.id}`
    ).map((r) => [`${r.ambito}:${r.clave}`, r.id]),
  )

  const filas = c.secciones.map((s) => ({
    estado_id: estado.id,
    clave: s.clave,
    municipio_id: mun.get(s.municipio) ?? null,
    distrito_local_id: dis.get(`local:${s.distrito_local}`) ?? null,
    distrito_federal_id: dis.get(`federal:${s.distrito_federal}`) ?? null,
    tipo: s.tipo,
    latitud: s.latitud,
    longitud: s.longitud,
    activo: true,
  }))

  // Por tandas: un insert de tres mil renglones en una sola sentencia
  // se pasa del límite de parámetros del protocolo.
  for (let i = 0; i < filas.length; i += 500) {
    await sql`
      insert into secciones ${sql(filas.slice(i, i + 500))}
      on conflict (estado_id, clave) do update
        set municipio_id = excluded.municipio_id,
            distrito_local_id = excluded.distrito_local_id,
            distrito_federal_id = excluded.distrito_federal_id,
            tipo = excluded.tipo,
            latitud = excluded.latitud,
            longitud = excluded.longitud`
  }

  const [n] = await sql<{ s: number; m: number; d: number }[]>`
    select (select count(*) from secciones where estado_id = ${estado.id})::int as s,
           (select count(*) from municipios where estado_id = ${estado.id})::int as m,
           (select count(*) from distritos where estado_id = ${estado.id})::int as d`
  console.log(
    `  ${c.estado.nombre}: ${n.m} municipios · ${n.d} distritos · ${n.s.toLocaleString('es-MX')} secciones`,
  )
}

await sql.end()
