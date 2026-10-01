/**
 * PostgreSQL local embebido. No requiere Docker ni instalación de sistema.
 *   node db/local.mjs up      arranca (e inicializa la primera vez)
 *   node db/local.mjs down    detiene
 *   node db/local.mjs reset   borra el cluster y vuelve a empezar
 */
import EmbeddedPostgres from 'embedded-postgres'
import { rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = dirname(fileURLToPath(import.meta.url))
const datos = join(raiz, '.data')

export const CONFIG = {
  databaseDir: datos,
  user: 'inpol',
  password: 'inpol_local',
  port: 5434,
  persistent: true,
}

const pg = new EmbeddedPostgres(CONFIG)
const comando = process.argv[2] ?? 'up'

async function up() {
  const primeraVez = !existsSync(datos)
  if (primeraVez) {
    await mkdir(datos, { recursive: true })
    console.log('Inicializando cluster...')
    await pg.initialise()
  }
  await pg.start()
  if (primeraVez) {
    await pg.createDatabase('inpol')
    console.log('Base "inpol" creada.')
  }
  console.log(`PostgreSQL escuchando en localhost:${CONFIG.port} (base: inpol)`)
}

if (comando === 'up') {
  await up()
} else if (comando === 'down') {
  await pg.stop()
  console.log('Detenido.')
} else if (comando === 'reset') {
  try { await pg.stop() } catch {}
  await rm(datos, { recursive: true, force: true })
  console.log('Cluster borrado.')
  await up()
} else {
  console.error(`Comando desconocido: ${comando}`)
  process.exit(1)
}
