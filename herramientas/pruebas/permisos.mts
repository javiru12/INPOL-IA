/**
 * Comprueba que cada perfil vea solo lo suyo.
 *
 * La matriz de autorización es el corazón del producto: si el menú no
 * cambia entre perfiles, el sistema tiene 293 funcionalidades y un solo
 * nivel de acceso real.
 *   npx tsx --env-file=.env.local herramientas/pruebas/permisos.mts
 */
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3200'

let fallos = 0
function revisar(que: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${que}${detalle ? `  ${detalle}` : ''}`)
  if (!ok) fallos++
}

const nav = await puppeteer.launch({
  executablePath: CHROME, headless: true, args: ['--no-sandbox'],
})
const p = await nav.newPage()
await p.setViewport({ width: 1440, height: 900 })

async function entrarComo(correo: string) {
  const cdp = await p.createCDPSession()
  await cdp.send('Network.clearBrowserCookies')
  await cdp.detach()
  await p.goto(`${BASE}/plaza`, { waitUntil: 'networkidle0' })
  await p.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
    b.find((x) => x.textContent?.toLowerCase().includes('monterrey'))?.click()
  })
  await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
  await p.type('#correo', correo)
  await p.type('#contrasena', 'inpol2026')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/entrar'), { timeout: 15000 })
  return p.$$eval('nav a', (as) => as.map((a) => a.textContent?.trim() ?? ''))
}

console.log('\n  Permisos por perfil\n')

const menus = new Map<string, string[]>()
for (const [perfil, correo] of [
  ['Súper Administrador', 'gerardo@monterrey.inpol.mx'],
  ['Gestor Social', 'luis@monterrey.inpol.mx'],
  ['Asignador', 'marleny@monterrey.inpol.mx'],
  ['Operador de Gestión', 'sebastian@monterrey.inpol.mx'],
  ['Operador de Campo', 'ivonne@monterrey.inpol.mx'],
  ['Marketing', 'diego@monterrey.inpol.mx'],
] as const) {
  const menu = await entrarComo(correo)
  menus.set(perfil, menu)
  console.log(`  ${perfil.padEnd(22)} ${menu.length} entradas: ${menu.join(', ')}`)
}

console.log('')
const superAdmin = menus.get('Súper Administrador')!
revisar('el Súper Administrador ve el menú más amplio',
  [...menus.values()].every((m) => m.length <= superAdmin.length))

const distintos = new Set([...menus.values()].map((m) => m.join('|')))
revisar('los perfiles no ven todos lo mismo', distintos.size > 1,
  `${distintos.size} menús distintos entre ${menus.size} perfiles`)

const campo = menus.get('Operador de Campo')!
revisar('el Operador de Campo tiene menos acceso que el Súper Administrador',
  campo.length < superAdmin.length, `${campo.length} contra ${superAdmin.length}`)

revisar('ningún perfil se queda sin menú',
  [...menus.values()].every((m) => m.length > 0))

// --- El acceso directo por URL también se bloquea ----------------------
// Ocultar la entrada del menú no protege nada por sí solo.
console.log('')
await entrarComo('ivonne@monterrey.inpol.mx') // Operador de Campo
for (const ruta of ['/configuracion', '/ciudadanos', '/mapa', '/estadisticas']) {
  await p.goto(BASE + ruta, { waitUntil: 'networkidle0' })
  const bloqueada = p.url().includes('/sin-acceso')
  revisar(`el Operador de Campo no alcanza ${ruta} por URL`, bloqueada,
    bloqueada ? '' : `entró a ${p.url().replace(BASE, '')}`)
}

// Y lo que sí le toca sigue abierto.
for (const ruta of ['/actividades', '/']) {
  await p.goto(BASE + ruta, { waitUntil: 'networkidle0' })
  revisar(`el Operador de Campo sí entra a ${ruta}`, !p.url().includes('/sin-acceso'))
}

await nav.close()
console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  Los permisos diferencian y bloquean correctamente.\n')
process.exit(fallos ? 1 : 0)
