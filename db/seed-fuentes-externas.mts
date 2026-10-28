/**
 * Datos sintéticos para las fuentes externas cruzadas por CURP.
 *
 *   npx tsx --env-file=.env.local db/seed-fuentes-externas.mts [cliente]
 *
 * Son inventados a propósito. Los archivos que llegaron con estos
 * padrones traen personas reales —el de «placas y licencias» resultó
 * ser el padrón del IMSS, con 4.6 millones de nombres, CURP, número de
 * seguridad social y salario— y cargarlos para perfilar electores no
 * tiene base legal: el historial crediticio exige autorización expresa
 * de cada quien (LRSIC art. 28) y los padrones de programas sociales
 * tienen prohibido el uso electoral.
 *
 * Esto demuestra lo mismo sin eso: el esquema es el definitivo y el
 * cruce opera igual, así que el día que exista el convenio se cambia la
 * fuente y no se toca una línea de pantalla.
 *
 * Las CURP se derivan del nombre de cada ficha con las reglas de RENAPO,
 * no son cadenas al azar: si fueran ruido, el cruce «funcionaría» sin
 * demostrar nada.
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const clave = process.argv[2] ?? 'monterrey'

const VOCALES = 'AEIOU'
const ESTADOS_CURP = ['NL', 'VZ', 'SP', 'TS', 'DF', 'CH', 'MS', 'BS', 'GT', 'CL']
const INCONVENIENTES = new Set(['BACA', 'LOCO', 'MAME', 'MEAS', 'PENE', 'RATA'])

const limpiar = (s: string) =>
  (s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-ZÑ ]/g, '')
    .trim()

/** Primera consonante interna; la Ñ cuenta como X, como manda RENAPO. */
function consonante(palabra: string) {
  for (const c of palabra.slice(1)) {
    if (!VOCALES.includes(c) && c !== ' ') return c === 'Ñ' ? 'X' : c
  }
  return 'X'
}

function curpDe(
  nombre: string,
  paterno: string,
  materno: string,
  nacimiento: Date,
  sexo: string,
  entidad: string,
) {
  const n = limpiar(nombre).split(' ')[0] || 'X'
  const p = limpiar(paterno) || 'X'
  const m = limpiar(materno) || 'X'

  let raiz = (p[0] ?? 'X') + (p.slice(1).split('').find((c) => VOCALES.includes(c)) ?? 'X') +
             (m[0] ?? 'X') + (n[0] ?? 'X')
  // RENAPO sustituye la segunda letra cuando la raíz forma una palabra
  // altisonante. Sin esto saldrían CURP que el registro nunca emitiría.
  if (INCONVENIENTES.has(raiz)) raiz = raiz[0] + 'X' + raiz.slice(2)

  const aa = String(nacimiento.getFullYear()).slice(2)
  const mm = String(nacimiento.getMonth() + 1).padStart(2, '0')
  const dd = String(nacimiento.getDate()).padStart(2, '0')
  const s = sexo?.toUpperCase().startsWith('M') ? 'M' : 'H'
  const cons = consonante(p) + consonante(m) + consonante(n)
  const homo = nacimiento.getFullYear() < 2000 ? '0' : 'A'

  const base = `${raiz}${aa}${mm}${dd}${s}${entidad}${cons}${homo}`

  // Dígito verificador: posición por el alfabeto oficial, ponderada.
  const ALFABETO = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
  let suma = 0
  for (let i = 0; i < 17; i++) suma += ALFABETO.indexOf(base[i]) * (18 - i)
  const dv = (10 - (suma % 10)) % 10
  return base + dv
}

const [tenant] = await sql<{ id: string; nombre: string; estado_id: string }[]>`
  select id, nombre, estado_id from tenants where clave = ${clave}`
if (!tenant) {
  console.error(`No existe el cliente ${clave}.`)
  process.exit(1)
}

const gente = await sql<
  { id: string; nombre: string; paterno: string; materno: string; nacimiento: Date | null; sexo: string; edad: number; municipio_id: string | null }[]
>`
  select c.id, coalesce(c.nombre, '') as nombre,
         coalesce(c.apellido_paterno, '') as paterno,
         coalesce(c.apellido_materno, '') as materno,
         c.fecha_nacimiento as nacimiento,
         coalesce(c.sexo, 'H') as sexo,
         coalesce(c.edad, 40) as edad,
         s.municipio_id
  from ciudadanos c
  left join secciones s on s.id = c.seccion_id
  where c.tenant_id = ${tenant.id}
  order by c.id`

// Una semilla fija: dos corridas dan el mismo resultado y las cifras de
// una demostración no cambian entre una junta y la siguiente.
let semilla = 20262027
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const unoDe = <T,>(xs: readonly T[]) => xs[Math.floor(azar() * xs.length)]

const conCurp: { id: string; curp: string }[] = []
for (const p of gente) {
  const nacimiento =
    p.nacimiento ?? new Date(new Date().getFullYear() - (p.edad || 40), entre(0, 11), entre(1, 28))
  conCurp.push({
    id: p.id,
    curp: curpDe(p.nombre, p.paterno, p.materno, nacimiento, p.sexo, unoDe(ESTADOS_CURP)),
  })
}

await sql`
  update ciudadanos c set curp = v.curp
  from (values ${sql(conCurp.map((c) => [c.id, c.curp]))}) as v(id, curp)
  where c.id = v.id::uuid and c.tenant_id = ${tenant.id}`

const municipios = await sql<{ id: string }[]>`
  select id from municipios where estado_id = ${tenant.estado_id} order by clave`

// Ninguna fuente externa cubre al padrón entero, y fingir el 100% haría
// que la pantalla de cobertura no sirviera para nada.
type Fila = (string | number)[]
const telefonos: Fila[] = []
const vehiculos: Fila[] = []
const buro: Fila[] = []
const zonas: Fila[] = []

const porMunicipio = new Map(gente.map((g) => [g.id, g.municipio_id]))

for (const { id, curp } of conCurp) {
  if (azar() < 0.72) {
    telefonos.push([tenant.id, curp, `81${entre(10000000, 99999999)}`, unoDe(['movil', 'fijo']), 'sintético'])
  }
  if (azar() < 0.41) {
    vehiculos.push([
      tenant.id, curp,
      `${unoDe('ABCDEFGHJKLMNPRSTUVWXYZ'.split(''))}${entre(100, 999)}${unoDe('ABCDEFGHJKLMNPRSTUVWXYZ'.split(''))}${unoDe('ABCDEFGHJKLMNPRSTUVWXYZ'.split(''))}`,
      `L${entre(1000000, 9999999)}`,
      unoDe(['automóvil', 'camioneta', 'motocicleta']),
      entre(2004, 2026),
      'sintético',
    ])
  }
  if (azar() < 0.55) {
    const score = entre(380, 820)
    buro.push([tenant.id, curp, score < 560 ? 'bajo' : score < 680 ? 'medio' : 'alto', score, 'sintético'])
  }
  if (azar() < 0.64) {
    // En una de cada doce la zona del padrón NO coincide con la sección
    // de la ficha: es el caso que Gerardo quiere ver marcado.
    const propio = porMunicipio.get(id) ?? null
    const discrepa = azar() < 1 / 12
    const mun = discrepa ? unoDe(municipios).id : propio
    if (mun) zonas.push([tenant.id, curp, tenant.estado_id, mun, 'sintético'])
  }
}

const porTandas = async (filas: Fila[], meter: (t: Fila[]) => Promise<unknown>) => {
  for (let i = 0; i < filas.length; i += 400) await meter(filas.slice(i, i + 400))
}

await sql`delete from ext_telefonos where tenant_id = ${tenant.id}`
await sql`delete from ext_vehiculos where tenant_id = ${tenant.id}`
await sql`delete from ext_buro_credito where tenant_id = ${tenant.id}`
await sql`delete from ext_curp_zona where tenant_id = ${tenant.id}`
await sql`delete from ext_salario_region where tenant_id = ${tenant.id}`

await porTandas(telefonos, (t) => sql`
  insert into ext_telefonos (tenant_id, curp, telefono, tipo, fuente)
  values ${sql(t)} on conflict do nothing`)
await porTandas(vehiculos, (t) => sql`
  insert into ext_vehiculos (tenant_id, curp, placa, licencia, tipo_vehiculo, modelo, fuente)
  values ${sql(t)} on conflict do nothing`)
await porTandas(buro, (t) => sql`
  insert into ext_buro_credito (tenant_id, curp, nivel, score, fuente)
  values ${sql(t)} on conflict do nothing`)
await porTandas(zonas, (t) => sql`
  insert into ext_curp_zona (tenant_id, curp, estado_id, municipio_id, fuente)
  values ${sql(t)} on conflict do nothing`)

// El salario va agregado por distrito local: un promedio no identifica
// a nadie, que es justo lo que lo hace utilizable.
const distritos = await sql<{ id: string }[]>`
  select id from distritos where estado_id = ${tenant.estado_id} and ambito = 'local'`
if (distritos.length) {
  await sql`
    insert into ext_salario_region (tenant_id, estado_id, distrito_id, salario_promedio, trabajadores, fuente)
    values ${sql(
      distritos.map((d) => [
        tenant.id, tenant.estado_id, d.id,
        (entre(28000, 71000) / 100).toFixed(2),
        entre(4200, 38000),
        'sintético',
      ]),
    )}`
}

// La marca de revisión: la credencial dice una zona y la ficha otra.
const { count: marcadas } = await sql`
  update ciudadanos c
  set zona_discrepante = (z.municipio_id is distinct from s.municipio_id)
  from ext_curp_zona z
  left join secciones s on s.id = (select seccion_id from ciudadanos x where x.curp = z.curp and x.tenant_id = ${tenant.id} limit 1)
  where c.curp = z.curp and c.tenant_id = ${tenant.id} and z.tenant_id = ${tenant.id}`

// Discapacidad y adulto mayor: el segundo no se inventa, se deduce.
await sql`
  update ciudadanos set adulto_mayor = true
  where tenant_id = ${tenant.id}
    and coalesce(nullif(date_part('year', age(fecha_nacimiento))::int, 0), edad) >= 65`

const conDiscapacidad = conCurp.filter(() => azar() < 0.06).map((c) => c.curp)
if (conDiscapacidad.length) {
  await sql`
    update ciudadanos set discapacidad = true,
      tipo_discapacidad = (array['motriz','visual','auditiva','intelectual'])[1 + floor(random()*4)]
    where tenant_id = ${tenant.id} and curp = any(${conDiscapacidad})`
}

const [r] = await sql<{ [k: string]: number }[]>`
  select (select count(*) from ciudadanos where tenant_id = ${tenant.id} and curp is not null)::int as con_curp,
         (select count(*) from ext_telefonos where tenant_id = ${tenant.id})::int as telefonos,
         (select count(*) from ext_vehiculos where tenant_id = ${tenant.id})::int as vehiculos,
         (select count(*) from ext_buro_credito where tenant_id = ${tenant.id})::int as buro,
         (select count(*) from ext_curp_zona where tenant_id = ${tenant.id})::int as zonas,
         (select count(*) from ext_salario_region where tenant_id = ${tenant.id})::int as regiones,
         (select count(*) from ciudadanos where tenant_id = ${tenant.id} and zona_discrepante)::int as discrepantes,
         (select count(*) from ciudadanos where tenant_id = ${tenant.id} and adulto_mayor)::int as mayores,
         (select count(*) from ciudadanos where tenant_id = ${tenant.id} and discapacidad)::int as discapacidad`

console.log(`\n  ${tenant.nombre} · datos SINTÉTICOS\n`)
console.log(`  ciudadanos con CURP        ${r.con_curp}`)
console.log(`  teléfonos                  ${r.telefonos}`)
console.log(`  vehículos y licencias      ${r.vehiculos}`)
console.log(`  historial crediticio       ${r.buro}`)
console.log(`  zona electoral por CURP    ${r.zonas}  (${r.discrepantes} no cuadran con su ficha)`)
console.log(`  salario por región         ${r.regiones} distritos`)
console.log(`  adultos mayores            ${r.mayores}`)
console.log(`  con discapacidad           ${r.discapacidad}\n`)

await sql.end()
