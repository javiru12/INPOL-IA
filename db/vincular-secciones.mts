/**
 * Reparte los ciudadanos de un cliente entre secciones electorales
 * reales y hereda esa sección a sus peticiones.
 *
 *   npx tsx --env-file=.env.local db/vincular-secciones.mts [clave-del-cliente]
 *
 * El reparto es proporcional al tamaño de cada municipio y no uniforme:
 * la demanda ciudadana se concentra donde vive la gente, y un mapa con
 * todos los municipios iguales no diría nada. El tamaño se mide por
 * cuántas secciones tiene el municipio, que es como el INE reparte el
 * territorio: una sección por cada tanto de electores.
 *
 * ⚠️ Todo se acota al estado del cliente. Hay municipios que se llaman
 * igual en varios estados —JUAREZ, ALLENDE, GUERRERO, HIDALGO— así que
 * buscar secciones por nombre de municipio sin decir de qué estado le
 * asigna a un ciudadano de Monterrey una sección de Chihuahua. Ya pasó
 * una vez y por eso la consulta filtra por `estado_id` y no por nombre.
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const clave = process.argv[2] ?? 'monterrey'

const [tenant] = await sql<{ id: string; nombre: string; estado_id: string | null; estado: string }[]>`
  select t.id, t.nombre, t.estado_id, coalesce(e.nombre, '') as estado
  from tenants t left join estados e on e.id = t.estado_id
  where t.clave = ${clave}`

if (!tenant) {
  console.error(`No existe el cliente ${clave}.`)
  process.exit(1)
}
if (!tenant.estado_id) {
  console.error(`${tenant.nombre} no tiene estado asignado; sin eso no hay territorio que repartir.`)
  process.exit(1)
}

const secciones = await sql<{ id: string; municipio: string }[]>`
  select s.id, m.nombre as municipio
  from secciones s
  join municipios m on m.id = s.municipio_id
  where s.estado_id = ${tenant.estado_id}
  order by m.nombre, s.clave`

if (!secciones.length) {
  console.error(`No hay secciones cargadas de ${tenant.estado}. Corre db/cargar-geografia.mts.`)
  process.exit(1)
}

const porMunicipio = new Map<string, string[]>()
for (const s of secciones) {
  const lista = porMunicipio.get(s.municipio) ?? []
  lista.push(s.id)
  porMunicipio.set(s.municipio, lista)
}

// El rol dueño es superusuario y evade Row Level Security: todo filtro
// por cliente va explícito en el WHERE.
const ciudadanos = await sql<{ id: string }[]>`
  select id from ciudadanos where tenant_id = ${tenant.id} order by id`

const pesos = [...porMunicipio.entries()].map(([m, s]) => [m, s.length] as const)
const pesoTotal = pesos.reduce((s, [, p]) => s + p, 0)

const asignaciones: { id: string; seccion: string }[] = []
let cursor = 0

for (const [municipio, peso] of pesos) {
  const cuantos = Math.round((peso / pesoTotal) * ciudadanos.length)
  const disponibles = porMunicipio.get(municipio)!
  for (let i = 0; i < cuantos && cursor < ciudadanos.length; i++, cursor++) {
    // Salto grande para no amontonar a todos en secciones contiguas.
    asignaciones.push({
      id: ciudadanos[cursor].id,
      seccion: disponibles[(i * 37) % disponibles.length],
    })
  }
}

// Lo que sobre por redondeo se queda en el municipio más grande.
const mayor = pesos.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
const resto = porMunicipio.get(mayor)!
for (; cursor < ciudadanos.length; cursor++) {
  asignaciones.push({ id: ciudadanos[cursor].id, seccion: resto[cursor % resto.length] })
}

if (asignaciones.length) {
  await sql`
    update ciudadanos c
    set seccion_id = v.seccion::uuid
    from (values ${sql(asignaciones.map((a) => [a.id, a.seccion]))}) as v(id, seccion)
    where c.id = v.id::uuid and c.tenant_id = ${tenant.id}`
}

const { count } = await sql`
  update peticiones p
  set seccion_id = c.seccion_id
  from ciudadanos c
  where c.id = p.ciudadano_id
    and c.seccion_id is not null
    and p.tenant_id = ${tenant.id}
    and c.tenant_id = ${tenant.id}`

const reparto = await sql<{ municipio: string; ciudadanos: number; peticiones: number }[]>`
  select m.nombre as municipio,
         count(distinct c.id)::int as ciudadanos,
         count(distinct p.id)::int as peticiones
  from ciudadanos c
  join secciones s on s.id = c.seccion_id
  join municipios m on m.id = s.municipio_id
  left join peticiones p on p.ciudadano_id = c.id and p.tenant_id = ${tenant.id}
  where c.tenant_id = ${tenant.id}
  group by m.nombre
  order by 3 desc
  limit 10`

console.log(`\n  ${tenant.nombre} · ${tenant.estado}\n`)
for (const r of reparto) {
  console.log(
    `  ${r.municipio.padEnd(26)} ${String(r.ciudadanos).padStart(4)} ciudadanos  ${String(r.peticiones).padStart(5)} peticiones`,
  )
}
console.log(`\n  ${count} peticiones vinculadas a su sección\n`)

await sql.end()
