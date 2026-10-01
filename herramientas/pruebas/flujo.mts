/**
 * Prueba de humo del flujo operativo, sobre un navegador real:
 * entrar → capturar una petición → darle seguimiento → cerrarla.
 * Y, al final, que un cliente no alcanza la petición del otro.
 *   npx tsx --env-file=.env.local herramientas/pruebas/flujo.mts
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

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
})
const p = await navegador.newPage()
await p.setViewport({ width: 1440, height: 900 })

async function entrar(plaza: string, correo: string) {
  // Partir de cero: si queda la sesión anterior, /entrar redirige al panel.
  const cdp = await p.createCDPSession()
  await cdp.send('Network.clearBrowserCookies')
  await cdp.detach()

  await p.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
  await p.evaluate((nombre) => {
    const botones = Array.from(document.querySelectorAll('button'))
    botones.find((b) => b.textContent?.toLowerCase().includes(nombre))?.click()
  }, plaza)
  await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
  if (!p.url().includes('/entrar')) await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' })
  await p.type('#correo', correo)
  await p.type('#contrasena', 'inpol2026')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/entrar'), { timeout: 15000 })
    .catch(async () => {
      const aviso = await p.$eval('[role=alert]', (e) => e.textContent).catch(() => null)
      console.log(`      login falló: ${aviso?.trim() ?? 'sin aviso'}`)
    })
}

/** Envía el formulario que contiene el elemento indicado. */
async function enviarFormularioCon(selector: string) {
  await p.evaluate((sel) => {
    const campo = document.querySelector(sel)
    const forma = campo?.closest('form')
    ;(forma?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
  }, selector)
}

console.log('\n  Flujo operativo\n')

// --- Entrar -----------------------------------------------------------
await entrar('monterrey', 'gerardo@monterrey.inpol.mx')
revisar('entra al sistema', !p.url().includes('/entrar'))

// --- Capturar una petición -------------------------------------------
await p.goto(`${BASE}/peticiones/nueva`, { waitUntil: 'networkidle0' })
await p.type('form input[type=search]', 'Lourdes')
await p.waitForFunction(
  () => document.querySelectorAll('ul li button').length > 0,
  { timeout: 10000 },
).catch(() => {})
const hayResultados = await p.$$eval('main ul li button', (b) => b.length)
revisar('el buscador encuentra ciudadanos', hayResultados > 0, `${hayResultados} resultados`)
// Dentro de <main>: la barra lateral también tiene listas, pero con enlaces.
await p.evaluate(() => {
  ;(document.querySelector('main ul li button') as HTMLButtonElement)?.click()
})
await p.waitForFunction(
  () => !!document.querySelector('input[name=ciudadanoId]'),
  { timeout: 5000 },
).catch(() => {})

const marca = `Prueba automática ${Date.now()}`
await p.select('select[name=problematicaId]', await p.$eval(
  'select[name=problematicaId] option:nth-child(2)', (o) => (o as HTMLOptionElement).value))
await p.select('select[name=prioridadId]', await p.$eval(
  'select[name=prioridadId] option:nth-child(2)', (o) => (o as HTMLOptionElement).value))
await p.type('textarea[name=descripcion]', `${marca}: solicita apoyo para verificar el flujo de captura.`)
await enviarFormularioCon('textarea[name=descripcion]')
await p.waitForFunction(
  () => /\/peticiones\/[0-9a-f-]{36}/.test(location.pathname),
  { timeout: 15000 },
).catch(() => {})

const urlDetalle = p.url()
const guardo = /\/peticiones\/[0-9a-f-]{36}/.test(urlDetalle)
if (!guardo) {
  const aviso = await p.$eval('[role=alert]', (e) => e.textContent).catch(() => null)
  console.log(`      url: ${urlDetalle}`)
  console.log(`      aviso en pantalla: ${aviso?.trim() ?? 'ninguno'}`)
  const valores = await p.evaluate(() => {
    const f = document.querySelector('form') as HTMLFormElement
    return Object.fromEntries(new FormData(f).entries()) as Record<string, string>
  })
  console.log('      campos enviados:', JSON.stringify(valores))
  await navegador.close()
  process.exit(1)
}
revisar('guarda y lleva al detalle', guardo)

const cuerpo = await p.$eval('body', (b) => b.innerText)
revisar('el detalle muestra la petición capturada', cuerpo.includes(marca))
revisar('entra con estatus Abierta', cuerpo.includes('Abierta'))

// --- Seguimiento ------------------------------------------------------
await p.type('textarea[name=detalle]', 'Se llamó al ciudadano para confirmar el domicilio.')
await enviarFormularioCon('textarea[name=detalle]')
await p.waitForFunction(
  () => document.body.innerText.includes('Se llamó al ciudadano'),
  { timeout: 15000 },
).catch(() => {})
revisar(
  'el seguimiento queda en el historial',
  (await p.$eval('body', (b) => b.innerText)).includes('Se llamó al ciudadano'),
)

// --- Cambio de estatus ------------------------------------------------
const completada = await p.$$eval('select[name=estatusId] option', (os) =>
  (os as HTMLOptionElement[]).find((o) => o.textContent?.trim() === 'Completada')?.value ?? '')
await p.select('select[name=estatusId]', completada)
await enviarFormularioCon('select[name=estatusId]')
await p.waitForFunction(
  () => document.body.innerText.includes('Cambió el estatus'),
  { timeout: 15000 },
).catch(() => {})
revisar(
  'el cambio de estatus se registra',
  (await p.$eval('body', (b) => b.innerText)).includes('Cambió el estatus'),
)

// --- El otro cliente no la alcanza ------------------------------------
const idPeticion = urlDetalle.split('/').pop()!
await entrar('chihuahua', 'gerardo@chihuahua.inpol.mx')
await p.goto(`${BASE}/peticiones/${idPeticion}`, { waitUntil: 'networkidle0' })
const textoAjeno = await p.$eval('body', (b) => b.innerText)
revisar(
  'Chihuahua no alcanza una petición de Monterrey',
  !textoAjeno.includes(marca),
  textoAjeno.includes(marca) ? 'FUGA ENTRE CLIENTES' : '',
)

// --- Limpieza ---------------------------------------------------------
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
await sql`delete from peticiones where descripcion like ${'Prueba automática%'}`
await sql.end()

await navegador.close()
console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  Flujo completo en orden.\n')
process.exit(fallos ? 1 : 0)
