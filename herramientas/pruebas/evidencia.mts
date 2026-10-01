/**
 * Adjuntar evidencia a una petición, y que no se filtre a otro cliente.
 *   npm run probar:evidencia
 */
import puppeteer from 'puppeteer-core'
import postgres from 'postgres'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3200'
const FOTO = process.env.FOTO_PRUEBA!

let fallos = 0
function revisar(que: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${que}${detalle ? `  ${detalle}` : ''}`)
  if (!ok) fallos++
}

const nav = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const p = await nav.newPage()
await p.setViewport({ width: 1500, height: 1000 })

async function entrar(plaza: string, correo: string) {
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

console.log('\n  Evidencia adjunta\n')

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [t] = await sql`select id from tenants where clave='monterrey'`
const [peticion] = await sql<{ id: string }[]>`
  select id from peticiones where tenant_id = ${t.id} order by fecha_apertura desc limit 1`

await entrar('monterrey', 'gerardo@monterrey.inpol.mx')
await p.goto(`${BASE}/peticiones/${peticion.id}`, { waitUntil: 'networkidle0' })

revisar('la sección de evidencia aparece en el expediente',
  (await p.$eval('body', (b) => b.innerText)).includes('Evidencia'))

// Subir la foto
const campo = await p.$('input[type=file]')
await campo!.uploadFile(FOTO)
await p.select('select[name=momento]', 'reporte')
await new Promise((r) => setTimeout(r, 400))
await p.type('input[name=descripcion]', 'Bache en el cruce reportado')
await p.evaluate(() => {
  const f = document.querySelector('input[type=file]')?.closest('form')
  ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
})
await p.waitForFunction(() => document.querySelectorAll('main img').length > 0, { timeout: 20000 })
  .catch(() => {})

const imagenes = await p.$$eval('main img', (i) => i.length)
revisar('la foto queda visible en el expediente', imagenes > 0, `${imagenes} imagen(es)`)

const [fila] = await sql<{ id: string; clase: string; momento: string; bytes: string }[]>`
  select id, clase, momento, bytes::text from adjuntos
  where tenant_id = ${t.id} and peticion_id = ${peticion.id} and activo`
revisar('se registró en la base', Boolean(fila), fila ? `${fila.clase} · ${fila.momento} · ${fila.bytes} bytes` : '')

revisar('quedó anotado en el historial de la petición',
  (await p.$eval('body', (b) => b.innerText)).includes('Adjuntó una foto'))

/**
 * Pide el archivo y devuelve si de verdad llegó la imagen.
 *
 * Mirar solo el código de estado engaña: `fetch` sigue la redirección al
 * login y entrega un 200 que es HTML. Lo que importa es el tipo de
 * contenido.
 */
async function pedirArchivo(url: string) {
  return p.evaluate(async (u) => {
    const r = await fetch(u, { cache: 'no-store', redirect: 'follow' })
    const tipo = r.headers.get('content-type') ?? ''
    return { estado: r.status, tipo, esImagen: tipo.startsWith('image/') }
  }, url)
}

const ruta = `/peticiones/${peticion.id}/adjunto/${fila.id}`
const propio = await pedirArchivo(ruta)
revisar('el archivo se entrega a quien sí tiene acceso', propio.esImagen,
  `${propio.estado} ${propio.tipo}`)

// --- Lo que NO debe poder hacerse --------------------------------------
await entrar('chihuahua', 'gerardo@chihuahua.inpol.mx')
const ajeno = await pedirArchivo(ruta)
revisar('Chihuahua no alcanza el archivo de Monterrey', !ajeno.esImagen,
  `${ajeno.estado} ${ajeno.tipo}`)

// Sin sesión tampoco
const cdp = await p.createCDPSession()
await cdp.send('Network.clearBrowserCookies')
await cdp.detach()
await p.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
const anonimo = await pedirArchivo(ruta)
revisar('sin sesión el archivo no se entrega', !anonimo.esImagen,
  `${anonimo.estado} ${anonimo.tipo}`)

// --- Limpieza ----------------------------------------------------------
await sql`delete from adjuntos where id = ${fila.id}`
await sql`delete from peticion_seguimientos where peticion_id = ${peticion.id} and tipo = 'adjunto'`
await sql.end()
await nav.close()

console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  La evidencia funciona y no se filtra.\n')
process.exit(fallos ? 1 : 0)
