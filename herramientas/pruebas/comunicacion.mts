/**
 * Prueba de humo del módulo de Comunicación, sobre un navegador real:
 * registrar el aviso de una petición resuelta → armar una campaña
 * segmentada → comprobar que el conteo de destinatarios cuadra.
 *   npx tsx --env-file=.env.local herramientas/pruebas/comunicacion.mts
 */
import puppeteer from 'puppeteer-core'
import postgres from 'postgres'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3200'
const NOMBRE_CAMPANIA = `Prueba automática ${Date.now()}`

let fallos = 0
function revisar(que: string, ok: boolean, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${que}${detalle ? `  ${detalle}` : ''}`)
  if (!ok) fallos++
}

const admin = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
})
const p = await navegador.newPage()
await p.setViewport({ width: 1440, height: 1000 })

async function entrar(plaza: string, correo: string) {
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
}

/**
 * Envía el formulario que contiene el elemento indicado. El primer
 * `button[type=submit]` de la página es el de cerrar sesión del
 * encabezado, así que nunca se busca «el botón de enviar» a secas.
 */
async function enviarFormularioCon(selector: string, indice = 0) {
  await p.evaluate(
    (sel, i) => {
      const campo = document.querySelectorAll(sel)[i]
      const forma = campo?.closest('form')
      ;(forma?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
    },
    selector,
    indice,
  )
}

const leerAlcance = () =>
  p.$eval('[data-prueba=alcance]', (e) => Number(e.textContent!.replace(/[^\d]/g, '')))

console.log('\n  Módulo de Comunicación\n')

await entrar('monterrey', 'gerardo@monterrey.inpol.mx')

// --- Avisos pendientes ------------------------------------------------
await p.goto(`${BASE}/marketing`, { waitUntil: 'networkidle0' })
const pendientes = await p.$$eval('input[name=peticionId]', (e) => e.length)
revisar('la pantalla lista avisos pendientes', pendientes > 0, `${pendientes} en la página`)

const peticionId = await p.$eval('input[name=peticionId]', (e) =>
  (e as HTMLInputElement).value)
const [{ antes }] = await admin<{ antes: number }[]>`
  select count(*)::int as antes from mensajes_enviados where peticion_id = ${peticionId}`

await p.select('select[name=via]', 'whatsapp')
await enviarFormularioCon('input[name=peticionId]')
await p.waitForFunction(
  (id) => !document.querySelector(`input[name=peticionId][value="${id}"]`),
  { timeout: 15000 },
  peticionId,
).catch(() => {})

const [{ despues }] = await admin<{ despues: number }[]>`
  select count(*)::int as despues from mensajes_enviados
  where peticion_id = ${peticionId} and estado = 'enviado'`
revisar('el aviso queda registrado', despues === antes + 1, `${antes} → ${despues}`)

const yaNoEsta = await p.$$eval(
  'input[name=peticionId]',
  (e, id) => !e.some((x) => (x as HTMLInputElement).value === id),
  peticionId,
)
revisar('la petición avisada desaparece de los pendientes', yaNoEsta)

const [bitacoraAviso] = await admin<{ n: number }[]>`
  select count(*)::int as n from bitacora
  where entidad = 'mensajes_enviados' and detalle->>'peticion_id' = ${peticionId}`
revisar('el aviso deja rastro en la bitácora', bitacoraAviso.n > 0)

await p.goto(`${BASE}/peticiones/${peticionId}`, { waitUntil: 'networkidle0' })
revisar(
  'el aviso aparece en el historial de la petición',
  (await p.$eval('body', (b) => b.innerText)).includes('Se informó al ciudadano'),
)

// --- Campaña ----------------------------------------------------------
await p.goto(`${BASE}/marketing/nueva`, { waitUntil: 'networkidle0' })
await p.waitForFunction(
  () => document.querySelector('[data-prueba=alcance]')?.textContent !== '—',
  { timeout: 15000 },
)
const alcanceTotal = await leerAlcance()
revisar('el contador parte del padrón completo', alcanceTotal > 0, `${alcanceTotal} personas`)

await p.select('select[name=colonia]', 'Cumbres')
await p.waitForFunction(
  (previo) => {
    const n = Number(
      document.querySelector('[data-prueba=alcance]')?.textContent?.replace(/[^\d]/g, ''),
    )
    return n > 0 && n < previo
  },
  { timeout: 15000 },
  alcanceTotal,
).catch(() => {})
const alcanceColonia = await leerAlcance()
revisar(
  'el contador responde al segmento',
  alcanceColonia > 0 && alcanceColonia < alcanceTotal,
  `${alcanceTotal} → ${alcanceColonia} al filtrar por colonia`,
)

const [{ esperado }] = await admin<{ esperado: number }[]>`
  select count(*)::int as esperado from ciudadanos c
  join tenants t on t.id = c.tenant_id
  where t.clave = 'monterrey' and c.activo and c.colonia = 'Cumbres'
    and c.telefono_movil is not null and btrim(c.telefono_movil) <> ''`
revisar('el contador coincide con la base', alcanceColonia === esperado,
  `pantalla ${alcanceColonia}, base ${esperado}`)

// El correo no está capturado para nadie: la pantalla tiene que decirlo.
await p.select('select[name=canal]', 'correo')
await p.waitForFunction(
  () => document.body.innerText.includes('no se le puede escribir a nadie'),
  { timeout: 15000 },
).catch(() => {})
const avisoCanal = await p.$eval('body', (b) => b.innerText)
revisar(
  'avisa cuando el canal no alcanza a nadie',
  avisoCanal.includes('no se le puede escribir a nadie'),
)
await p.select('select[name=canal]', 'whatsapp')
await p.waitForFunction(
  () => Number(
    document.querySelector('[data-prueba=alcance]')?.textContent?.replace(/[^\d]/g, ''),
  ) > 0,
  { timeout: 15000 },
)

const vistaPrevia = await p.$eval('body', (b) => b.innerText)
revisar(
  'la vista previa sustituye los marcadores',
  vistaPrevia.includes('Como lo recibiría') && !vistaPrevia.split('Vista previa')[1]
    ?.slice(0, 600).includes('{nombre}'),
)

await p.type('input[name=nombre]', NOMBRE_CAMPANIA)
await enviarFormularioCon('textarea[name=cuerpo]')
await p.waitForFunction(
  () => /\/marketing\/[0-9a-f-]{36}/.test(location.pathname),
  { timeout: 20000 },
).catch(() => {})

const llego = /\/marketing\/[0-9a-f-]{36}/.test(p.url())
if (!llego) {
  const alerta = await p.$eval('[role=alert]', (e) => e.textContent).catch(() => null)
  console.log(`      url: ${p.url()}  ·  aviso: ${alerta?.trim() ?? 'ninguno'}`)
}
revisar('guarda la campaña y lleva a su detalle', llego)

const campaniaId = p.url().split('/').pop()!
const [guardada] = await admin<{ destinatarios: number; estado: string; reales: number }[]>`
  select cm.destinatarios, cm.estado,
         (select count(*)::int from mensajes_enviados m
          where m.campania_mensaje_id = cm.id) as reales
  from campanias_mensaje cm where cm.id = ${campaniaId}`
revisar('los destinatarios cuadran con el contador',
  guardada?.destinatarios === alcanceColonia && guardada?.reales === alcanceColonia,
  `contador ${alcanceColonia}, campaña ${guardada?.destinatarios}, filas ${guardada?.reales}`)
revisar('la campaña queda preparada, no enviada', guardada?.estado === 'preparada')

const [{ sinMarcador }] = await admin<{ sinMarcador: number }[]>`
  select count(*)::int as "sinMarcador" from mensajes_enviados
  where campania_mensaje_id = ${campaniaId} and cuerpo like '%{nombre}%'`
revisar('ningún destinatario conserva el marcador sin sustituir', sinMarcador === 0)

const detalle = await p.$eval('body', (b) => b.innerText)
revisar('el detalle dice que no se envió nada',
  detalle.includes('preparada') && detalle.includes('no'))

await p.goto(`${BASE}/marketing`, { waitUntil: 'networkidle0' })
const listado = await p.$eval('body', (b) => b.innerText)
revisar('la campaña aparece en el listado', listado.includes(NOMBRE_CAMPANIA))
revisar('con el número correcto de destinatarios',
  listado.includes(alcanceColonia.toLocaleString('es-MX')))

const [bitacoraCampania] = await admin<{ n: number }[]>`
  select count(*)::int as n from bitacora
  where entidad = 'campanias_mensaje' and entidad_id = ${campaniaId}`
revisar('la campaña deja rastro en la bitácora', bitacoraCampania.n > 0)

// --- El otro cliente no la alcanza ------------------------------------
await entrar('chihuahua', 'gerardo@chihuahua.inpol.mx')
await p.goto(`${BASE}/marketing/${campaniaId}`, { waitUntil: 'networkidle0' })
const ajeno = await p.$eval('body', (b) => b.innerText)
revisar('Chihuahua no alcanza una campaña de Monterrey',
  !ajeno.includes(NOMBRE_CAMPANIA),
  ajeno.includes(NOMBRE_CAMPANIA) ? 'FUGA ENTRE CLIENTES' : '')

// --- Limpieza ---------------------------------------------------------
await admin`delete from bitacora where entidad = 'campanias_mensaje' and entidad_id = ${campaniaId}`
await admin`delete from campanias_mensaje where nombre like ${'Prueba automática%'}`
await admin`delete from bitacora where entidad = 'mensajes_enviados'
            and detalle->>'peticion_id' = ${peticionId}`
await admin`delete from mensajes_enviados where peticion_id = ${peticionId}`
await admin`delete from peticion_seguimientos
            where peticion_id = ${peticionId} and detalle like ${'Se informó al ciudadano%'}`
await admin.end()

await navegador.close()
console.log(fallos ? `\n  ${fallos} prueba(s) fallida(s)\n` : '\n  Comunicación en orden.\n')
process.exit(fallos ? 1 : 0)
