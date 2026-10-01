/**
 * Reparte los ciudadanos del cliente entre secciones electorales reales y
 * hereda esa sección a sus peticiones.
 *
 * El reparto es proporcional a la población de cada municipio, no uniforme:
 * la demanda ciudadana se concentra donde vive la gente, y un mapa con
 * todos los municipios iguales no diría nada.
 *
 *   npm run db:secciones
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

/** Peso de cada municipio del área metropolitana, por su población. */
const AREA_METROPOLITANA: [string, number][] = [
  ['MONTERREY', 1140],
  ['GUADALUPE', 680],
  ['APODACA', 660],
  ['JUAREZ', 470],
  ['GRAL. ESCOBEDO', 490],
  ['SAN NICOLAS DE LOS GARZA', 410],
  ['GARCIA', 400],
  ['SANTA CATARINA', 310],
  ['SAN PEDRO GARZA GARCIA', 130],
]

const [tenant] = await sql<{ id: string; nombre: string }[]>`
  select id, nombre from tenants where clave = 'monterrey'`

if (!tenant) {
  console.error('No existe el tenant monterrey.')
  process.exit(1)
}

// Secciones agrupadas por municipio, en orden estable.
const secciones = await sql<{ id: string; municipio: string }[]>`
  select s.id, m.nombre as municipio
  from secciones s
  join municipios m on m.id = s.municipio_id
  where m.nombre = any(${AREA_METROPOLITANA.map(([n]) => n)})
  order by m.nombre, s.clave`

if (!secciones.length) {
  console.error('No hay secciones cargadas. Corre las migraciones.')
  process.exit(1)
}

const porMunicipio = new Map<string, string[]>()
for (const s of secciones) {
  const lista = porMunicipio.get(s.municipio) ?? []
  lista.push(s.id)
  porMunicipio.set(s.municipio, lista)
}

// El rol dueño es superusuario y evade Row Level Security: todo filtro por
// tenant va explícito en el WHERE.
const ciudadanos = await sql<{ id: string }[]>`
  select id from ciudadanos where tenant_id = ${tenant.id} order by id`

const pesoTotal = AREA_METROPOLITANA.reduce((s, [, p]) => s + p, 0)
const asignaciones: { id: string; seccion: string }[] = []
let cursor = 0

for (const [municipio, peso] of AREA_METROPOLITANA) {
  const cuantos = Math.round((peso / pesoTotal) * ciudadanos.length)
  const disponibles = porMunicipio.get(municipio) ?? []
  if (!disponibles.length) continue

  for (let i = 0; i < cuantos && cursor < ciudadanos.length; i++, cursor++) {
    // Salto grande para no amontonar a todos en secciones contiguas.
    asignaciones.push({
      id: ciudadanos[cursor].id,
      seccion: disponibles[(i * 37) % disponibles.length],
    })
  }
}

// Lo que sobre por redondeo se queda en la capital.
const capital = porMunicipio.get('MONTERREY') ?? []
for (; cursor < ciudadanos.length; cursor++) {
  asignaciones.push({
    id: ciudadanos[cursor].id,
    seccion: capital[cursor % capital.length],
  })
}

await sql`
  update ciudadanos c
  set seccion_id = v.seccion::uuid
  from (values ${sql(asignaciones.map((a) => [a.id, a.seccion]))}) as v(id, seccion)
  where c.id = v.id::uuid and c.tenant_id = ${tenant.id}`

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
  order by 3 desc`

console.log(`\n  ${tenant.nombre}\n`)
for (const r of reparto) {
  console.log(`  ${r.municipio.padEnd(26)} ${String(r.ciudadanos).padStart(4)} ciudadanos  ${String(r.peticiones).padStart(5)} peticiones`)
}
console.log(`\n  ${count} peticiones vinculadas a su sección\n`)

await sql.end()
