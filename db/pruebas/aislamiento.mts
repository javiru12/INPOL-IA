/**
 * Prueba del aislamiento entre clientes.
 * Se conecta con el rol de la aplicación (no el dueño) y comprueba que
 * las políticas de RLS impiden ver o tocar datos de otro tenant.
 *   npm run db:probar
 */
import postgres from 'postgres'

const app = postgres(process.env.DATABASE_URL!, { max: 1 })      // rol inpol_app
const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

let fallos = 0
function revisar(descripcion: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${descripcion}${detalle ? `  ${detalle}` : ''}`)
  if (!ok) fallos++
}

const tenants = await admin<{ id: string; clave: string }[]>`
  select id, clave from tenants order by clave`
const chihuahua = tenants.find((t) => t.clave === 'chihuahua')!
const monterrey = tenants.find((t) => t.clave === 'monterrey')!

console.log('\n  Aislamiento entre clientes\n')

// 1 · Cada tenant ve solo lo suyo
for (const t of [monterrey, chihuahua]) {
  const filas = await app.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${t.id}, true)`
    return tx<{ correo: string }[]>`select correo from usuarios`
  })
  const ajenos = filas.filter((f) => !f.correo.includes(t.clave))
  revisar(
    `${t.clave.padEnd(10)} ve ${filas.length} usuarios, ninguno ajeno`,
    filas.length > 0 && ajenos.length === 0,
    ajenos.length ? `fuga: ${ajenos.map((a) => a.correo).join(', ')}` : '',
  )
}

// 2 · Sin tenant fijado no se ve nada (falla cerrado)
const sinContexto = await app<{ n: bigint }[]>`select count(*)::bigint as n from usuarios`
revisar('sin tenant fijado no devuelve filas', Number(sinContexto[0].n) === 0,
  `devolvió ${sinContexto[0].n}`)

// 3 · No se puede leer un registro de otro tenant ni conociendo su id
const [ajeno] = await admin<{ id: string }[]>`
  select id from usuarios where tenant_id = ${chihuahua.id} limit 1`
const fuga = await app.begin(async (tx) => {
  await tx`select set_config('app.tenant_id', ${monterrey.id}, true)`
  return tx<{ id: string }[]>`select id from usuarios where id = ${ajeno.id}`
})
revisar('no alcanza un registro ajeno aun conociendo su id', fuga.length === 0)

// 4 · No se puede escribir en otro tenant
let bloqueado = false
try {
  await app.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${monterrey.id}, true)`
    await tx`insert into campanias (tenant_id, nombre) values (${chihuahua.id}, 'intrusa')`
  })
} catch {
  bloqueado = true
}
revisar('no puede insertar marcando otro tenant', bloqueado)

// 5 · No se puede mover un registro propio al otro tenant
let bloqueadoUpdate = false
try {
  await app.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${monterrey.id}, true)`
    await tx`update campanias set tenant_id = ${chihuahua.id}`
  })
} catch {
  bloqueadoUpdate = true
}
revisar('no puede reasignar un registro a otro tenant', bloqueadoUpdate)

// 6 · El rol de la app no es superusuario ni dueño (si lo fuera, RLS no aplicaría)
const [rol] = await app<{ usuario: string; superusuario: boolean }[]>`
  select current_user as usuario, usesuper as superusuario
  from pg_user where usename = current_user`
revisar(`conecta como ${rol.usuario}, sin superusuario`,
  rol.usuario === 'inpol_app' && !rol.superusuario)

// 7 · Ninguna fila apunta a un registro de otro cliente.
// El rol dueño es superusuario y evade RLS, así que los scripts
// administrativos pueden cruzar datos sin que la base los detenga. Esta
// comprobación es la red que atrapa ese error.
const cruces = await admin<{ relacion: string; n: number }[]>`
  select 'peticion -> ciudadano' as relacion, count(*)::int as n
  from peticiones p join ciudadanos c on c.id = p.ciudadano_id
  where c.tenant_id <> p.tenant_id
  union all
  select 'peticion -> problematica', count(*)::int
  from peticiones p join problematicas pr on pr.id = p.problematica_id
  where pr.tenant_id <> p.tenant_id
  union all
  select 'peticion -> estatus', count(*)::int
  from peticiones p join estatus_peticiones e on e.id = p.estatus_id
  where e.tenant_id <> p.tenant_id
  union all
  select 'usuario -> campania', count(*)::int
  from usuario_campanias uc join campanias ca on ca.id = uc.campania_id
  where ca.tenant_id <> uc.tenant_id`

const sucias = cruces.filter((c) => c.n > 0)
revisar(
  'ninguna fila referencia datos de otro cliente',
  sucias.length === 0,
  sucias.map((c) => `${c.relacion}: ${c.n}`).join(', '),
)

console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  Todo en orden.\n')
await app.end()
await admin.end()
process.exit(fallos ? 1 : 0)
