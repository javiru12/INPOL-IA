/**
 * Recados entre el equipo sobre una petición, y lo que no debe cruzarse.
 *
 * El módulo estaba construido y sin una sola prueba: sus tablas vienen
 * vacías en los datos de demostración, así que nadie lo había ejercitado
 * nunca. Esta suite lo cubre de punta a punta.
 *
 *   npm run probar:mensajes
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
await p.setViewport({ width: 1400, height: 950 })

async function entrar(plaza: string, correo: string) {
  // Sin limpiar cookies, /plaza ya trae sesión y no enseña el formulario.
  const cdp = await p.createCDPSession()
  await cdp.send('Network.clearBrowserCookies')
  await cdp.detach()

  await p.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
  await p.evaluate((n) => {
    const b = Array.from(document.querySelectorAll('button'))
    b.find((x) => x.textContent?.toLowerCase().includes(n))?.click()
  }, plaza)
  await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
  await p.type('#correo', correo)
  await p.type('#contrasena', 'inpol2026')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/entrar'), { timeout: 15000 })
}

console.log('\n  Mensajes del equipo\n')

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const marca = `Prueba de mensajes ${Date.now()}`

// El Gestor Social sí tiene el módulo; el Súper Administrador no, según la
// matriz de autorización del cliente.
await entrar('monterrey', 'luis@monterrey.inpol.mx')
await p.goto(`${BASE}/mensajes`, { waitUntil: 'networkidle0' })
revisar('el Gestor Social entra a su bandeja', p.url().includes('/mensajes'))

await p.select('select[name=destinatarioId]', await p.$eval(
  'select[name=destinatarioId] option:nth-child(2)', (o) => (o as HTMLOptionElement).value))
await p.type('input[name=asunto]', marca)
await p.type('textarea[name=cuerpo]', `${marca}: ¿cómo va la petición de la colonia Cumbres?`)
await p.evaluate(() => {
  const f = document.querySelector('textarea[name=cuerpo]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await p.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 15000 }, marca)
  .catch(() => {})

const [hilo] = await sql<{ id: string; tenant_id: string }[]>`
  select id, tenant_id from mensaje_hilos where asunto = ${marca} limit 1`
revisar('el mensaje se guarda', Boolean(hilo))

const texto = await p.$eval('body', (b) => b.innerText)
revisar('aparece en la bandeja de quien lo mandó', texto.includes(marca))

// --- Lo que NO debe poder hacerse ---------------------------------------
if (hilo) {
  await entrar('chihuahua', 'luis@chihuahua.inpol.mx')
  await p.goto(`${BASE}/mensajes/${hilo.id}`, { waitUntil: 'networkidle0' })
  const cruzada = await p.$eval('body', (b) => b.innerText)
  revisar(
    'Chihuahua no alcanza un hilo de Monterrey',
    !cruzada.includes(marca),
    cruzada.includes(marca) ? 'FUGA ENTRE CLIENTES' : '',
  )
}

// El Súper Administrador no tiene el módulo en la matriz del cliente: la
// pantalla tiene que rebotarlo aunque escriba la dirección.
await entrar('monterrey', 'gerardo@monterrey.inpol.mx')
await p.goto(`${BASE}/mensajes`, { waitUntil: 'networkidle0' })
revisar('un perfil sin el módulo no entra por URL', p.url().includes('/sin-acceso'))

// --- Limpieza ------------------------------------------------------------
await sql`delete from mensajes where cuerpo like ${'%' + marca + '%'}`
await sql`delete from mensaje_hilos where asunto = ${marca}`
await sql.end()

await nav.close()
console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  Los mensajes funcionan y no se filtran.\n')
process.exit(fallos ? 1 : 0)
