/**
 * Capturas de pantalla del sistema para revisión visual.
 *   npx tsx --env-file=.env.local herramientas/capturas.mts [ruta...]
 * Entra con un usuario de demostración y guarda PNG en herramientas/capturas/.
 */
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3200'
const SALIDA = 'herramientas/capturas'

const rutas = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/plaza', '/entrar', '/']

await mkdir(SALIDA, { recursive: true })

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--window-size=1600,1000'],
})
const pagina = await navegador.newPage()
await pagina.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })

// Elegir plaza y entrar una sola vez
await pagina.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
await pagina.evaluate(() => {
  const botones = Array.from(document.querySelectorAll('button'))
  botones.find((b) => b.textContent?.includes('Monterrey'))?.click()
})
await pagina.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})

const capturasPublicas = rutas.filter((r) => r === '/entrar' || r === '/plaza')
const capturasPrivadas = rutas.filter((r) => r !== '/entrar' && r !== '/plaza')

async function capturar(ruta: string) {
  await pagina.goto(BASE + ruta, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 450))
  const nombre = ruta === '/' ? 'panel' : ruta.replace(/^\//, '').replace(/\//g, '-')
  const archivo = `${SALIDA}/${nombre}.png`
  await pagina.screenshot({ path: archivo as `${string}.png`, fullPage: true })
  console.log(`  ${archivo}`)
}

for (const ruta of capturasPublicas) await capturar(ruta)

if (capturasPrivadas.length) {
  await pagina.goto(`${BASE}/entrar`, { waitUntil: 'networkidle0' })
  await pagina.type('#correo', 'gerardo@monterrey.inpol.mx')
  await pagina.type('#contrasena', 'inpol2026')
  await pagina.click('button[type=submit]')

  // El redirect de una Server Action no dispara waitForNavigation:
  // la navegación la resuelve el router en el cliente.
  await pagina
    .waitForFunction(() => !location.pathname.startsWith('/entrar'), { timeout: 15000 })
    .catch(async () => {
      const error = await pagina.$eval('[role=alert]', (e) => e.textContent).catch(() => null)
      console.error(`  No se pudo entrar${error ? `: ${error.trim()}` : ' (sin mensaje de error)'}`)
    })
  await new Promise((r) => setTimeout(r, 600))
  for (const ruta of capturasPrivadas) await capturar(ruta)
}

await navegador.close()
