import puppeteer from 'puppeteer-core'
import postgres from 'postgres'
const nav = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
})
const p = await nav.newPage()
await p.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 })
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [t] = await sql`select id from tenants where clave='monterrey'`
const [pet] = await sql<{id:string}[]>`
  select p.id from peticiones p
  join estatus_peticiones e on e.id=p.estatus_id
  join problematicas pr on pr.id=p.problematica_id
  where p.tenant_id=${t.id} and e.descripcion='Completada' and pr.titulo='Obra Pública'
  order by p.fecha_cierre desc limit 1`

await p.goto('http://localhost:3200/plaza', { waitUntil: 'networkidle0' })
await p.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button'))
  b.find((x) => x.textContent?.toLowerCase().includes('monterrey'))?.click()
})
await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
await p.type('#correo', 'gerardo@monterrey.inpol.mx')
await p.type('#contrasena', 'inpol2026')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/entrar'), { timeout: 15000 })

for (const [archivo, momento, texto] of [
  [process.env.ANTES!, 'reporte', 'Bache en el cruce de Hidalgo y Morelos'],
  [process.env.DESPUES!, 'resultado', 'Bacheo concluido por la cuadrilla'],
] as const) {
  await p.goto(`http://localhost:3200/peticiones/${pet.id}`, { waitUntil: 'networkidle0' })
  const campo = await p.$('input[type=file]')
  await campo!.uploadFile(archivo)
  await p.select('select[name=momento]', momento)
  await new Promise(r => setTimeout(r, 400))
  await p.type('input[name=descripcion]', texto)
  await p.evaluate(() => {
    const f = document.querySelector('input[type=file]')?.closest('form')
    ;(f?.querySelector('button[type=submit]') as HTMLButtonElement)?.click()
  })
  await new Promise(r => setTimeout(r, 2500))
}

await p.goto(`http://localhost:3200/peticiones/${pet.id}`, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 800))
await p.screenshot({ path: 'herramientas/capturas/evidencia.png', fullPage: true })
console.log('  herramientas/capturas/evidencia.png')
const n = await p.$$eval('main img', i => i.length)
console.log(`  fotos visibles: ${n}`)
await sql.end()
await nav.close()
