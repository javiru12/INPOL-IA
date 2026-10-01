/**
 * Flujo del ciudadano: levantar un reporte, recibir folio y consultarlo.
 * Incluye lo que NO debe poder hacerse.
 *   npm run probar:portal
 */
import puppeteer from 'puppeteer-core'
import postgres from 'postgres'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3200'

let fallos = 0
function revisar(que: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${que}${detalle ? `  ${detalle}` : ''}`)
  if (!ok) fallos++
}

const nav = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const p = await nav.newPage()
await p.setViewport({ width: 1100, height: 950 })

console.log('\n  Portal ciudadano\n')

// Elegir plaza (en producción esto lo da el subdominio).
await p.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
await p.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button'))
  b.find((x) => x.textContent?.toLowerCase().includes('monterrey'))?.click()
})
await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})

// --- Entra sin sesión -------------------------------------------------
await p.goto(`${BASE}/reportar`, { waitUntil: 'networkidle0' })
revisar('se entra al portal sin iniciar sesión', p.url().includes('/reportar'))

// --- Levantar un reporte ----------------------------------------------
const telefono = '81' + String(Math.floor(10000000 + Math.random() * 89999999))
const marca = `Prueba de portal ${Date.now()}`

await p.select('select[name=problematicaId]', await p.$eval(
  'select[name=problematicaId] option:nth-child(2)', (o) => (o as HTMLOptionElement).value))
await p.type('textarea[name=descripcion]', `${marca}: hay una fuga de agua en el cruce de Hidalgo y Morelos desde hace cuatro días.`)
await p.type('input[name=colonia]', 'Cumbres')
await p.type('input[name=calle]', 'Entre Hidalgo y Morelos')
await p.type('input[name=nombre]', 'María Fernanda Treviño')
await p.type('input[name=telefono]', telefono)
await p.click('input[name=aviso]')
await p.evaluate(() => {
  const f = document.querySelector('textarea[name=descripcion]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await p.waitForFunction(() => document.body.innerText.includes('Recibimos tu reporte'), { timeout: 15000 })
  .catch(() => {})

const texto = await p.$eval('body', (b) => b.innerText)
revisar('el reporte se recibe', texto.includes('Recibimos tu reporte'))

const folio = texto.match(/MON-[A-Z0-9]{6}/)?.[0] ?? ''
revisar('devuelve un folio con formato', /^MON-[A-Z0-9]{6}$/.test(folio), folio)

// --- Consultar con folio + teléfono correctos --------------------------
await p.goto(`${BASE}/seguimiento`, { waitUntil: 'networkidle0' })
await p.type('input[name=folio]', folio)
await p.type('input[name=ultimos]', telefono.slice(-4))
await p.evaluate(() => {
  const f = document.querySelector('input[name=folio]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await p.waitForFunction(() => document.body.innerText.includes('Qué reportaste') ||
  document.body.innerText.includes('No encontramos'), { timeout: 15000 }).catch(() => {})
const consulta = await p.$eval('body', (b) => b.innerText)
revisar('consulta su reporte con folio y teléfono', consulta.includes(marca))
revisar('muestra el estatus en palabras', consulta.includes('Abierta'))

// --- Lo que NO debe poder hacerse --------------------------------------
await p.goto(`${BASE}/seguimiento`, { waitUntil: 'networkidle0' })
await p.type('input[name=folio]', folio)
await p.type('input[name=ultimos]', '0000')
await p.evaluate(() => {
  const f = document.querySelector('input[name=folio]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await p.waitForFunction(() => document.body.innerText.includes('No encontramos'), { timeout: 15000 })
  .catch(() => {})
const malTelefono = await p.$eval('body', (b) => b.innerText)
revisar('con el folio pero mal teléfono NO enseña nada',
  !malTelefono.includes(marca) && malTelefono.includes('No encontramos'))

// Un folio de otro cliente tampoco debe alcanzarse desde aquí.
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [ajena] = await sql<{ folio: string; ultimos: string }[]>`
  select p.folio, right(regexp_replace(c.telefono_movil, '\\D', '', 'g'), 4) as ultimos
  from peticiones p
  join ciudadanos c on c.id = p.ciudadano_id
  join tenants t on t.id = p.tenant_id
  where t.clave = 'chihuahua' and c.telefono_movil is not null
  limit 1`

await p.goto(`${BASE}/seguimiento`, { waitUntil: 'networkidle0' })
await p.type('input[name=folio]', ajena.folio)
await p.type('input[name=ultimos]', ajena.ultimos)
await p.evaluate(() => {
  const f = document.querySelector('input[name=folio]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await new Promise((r) => setTimeout(r, 2500))
const cruzada = await p.$eval('body', (b) => b.innerText)
revisar('un folio de otro cliente no se alcanza desde este portal',
  cruzada.includes('No encontramos'), cruzada.includes('Qué reportaste') ? 'FUGA ENTRE CLIENTES' : '')

// --- El reporte llegó al sistema interno -------------------------------
const [t] = await sql`select id from tenants where clave='monterrey'`
const [dentro] = await sql<{ n: number; fuente: string | null; portal: boolean }[]>`
  select count(*)::int as n,
         max(f.descripcion) as fuente,
         bool_or(p.origen_portal) as portal
  from peticiones p
  left join fuentes f on f.id = p.fuente_id
  where p.tenant_id = ${t.id} and p.folio = ${folio}`
revisar('la petición existe en el sistema interno', dentro.n === 1)
revisar('queda marcada como venida del portal', dentro.portal === true, `fuente: ${dentro.fuente}`)

const [consent] = await sql<{ n: number }[]>`
  select count(*)::int as n from ciudadanos
  where tenant_id = ${t.id} and telefono_movil = ${telefono}
    and acepto_aviso_en is not null and origen = 'portal'`
revisar('se guardó cuándo aceptó el aviso de privacidad', consent.n === 1)

// --- Limpieza ----------------------------------------------------------
await sql`delete from peticiones where folio = ${folio}`
await sql`delete from ciudadanos where telefono_movil = ${telefono}`
await sql`delete from intentos_publicos where creado_en > now() - interval '10 minutes'`
await sql.end()

await nav.close()
console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  El portal ciudadano funciona y no filtra nada.\n')
process.exit(fallos ? 1 : 0)
