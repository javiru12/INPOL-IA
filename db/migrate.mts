/**
 * Aplica en orden los .sql de db/migrations que aún no se hayan corrido.
 * Cada archivo va dentro de una transacción: o entra completo o no entra.
 *
 *   npm run db:migrate
 */
import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const carpeta = join(raiz, 'migrations')

// Migrar con el rol dueño, no con el de la aplicación.
const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')

const sql = postgres(url, { max: 1 })

try {
  await sql`
    create table if not exists migraciones (
      nombre text primary key,
      aplicada_en timestamptz not null default now()
    )`

  const aplicadas = new Set(
    (await sql<{ nombre: string }[]>`select nombre from migraciones`).map((f) => f.nombre),
  )

  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort()
  let corridas = 0

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue
    const contenido = await readFile(join(carpeta, archivo), 'utf8')
    process.stdout.write(`  ${archivo} ... `)
    const inicio = Date.now()
    await sql.begin(async (tx) => {
      await tx.unsafe(contenido)
      await tx`insert into migraciones (nombre) values (${archivo})`
    })
    console.log(`${Date.now() - inicio} ms`)
    corridas++
  }

  console.log(corridas ? `\n${corridas} migración(es) aplicada(s).` : 'Todo al día.')
} finally {
  await sql.end()
}
