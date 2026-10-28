/**
 * Importador del padrón SUA del IMSS (archivo DBF).
 *
 *   npx tsx --env-file=.env.local db/importar-sua.mts <archivo.dbf> <cliente> [--real --base-legal "<referencia>"]
 *
 * Lee la estructura real del archivo —no una inventada— y la mapea a
 * `ext_salario_region` y `ext_telefonos`. Por omisión genera filas
 * sintéticas con esa misma forma, que es lo que sirve para desarrollar
 * y demostrar.
 *
 * Para cargar los registros reales hay que pasar `--real` junto con
 * `--base-legal`, que queda escrito en la bitácora. No es un trámite: si
 * alguien pregunta algún día con qué derecho se trató el dato de una
 * persona, la respuesta tiene que estar guardada junto al dato, no en la
 * memoria de quien lo cargó.
 *
 * El archivo del que se sacó esta estructura trae 4,607,156 registros
 * con nombre, CURP, número de seguridad social, salario y domicilio
 * patronal. Qué autorización hace falta para tratarlos está en
 * `docs/AUTORIZACION-FUENTES-EXTERNAS.md`.
 */
import postgres from 'postgres'
import { openSync, readSync, closeSync, statSync } from 'node:fs'

type Campo = { nombre: string; tipo: string; largo: number; desde: number }

/** Lee el encabezado del DBF: cuántos registros trae y con qué campos. */
export function estructura(ruta: string) {
  const fd = openSync(ruta, 'r')
  try {
    const cab = Buffer.alloc(32)
    readSync(fd, cab, 0, 32, 0)
    const registros = cab.readUInt32LE(4)
    const largoCabecera = cab.readUInt16LE(8)
    const largoRegistro = cab.readUInt16LE(10)

    const campos: Campo[] = []
    let desde = 1 // el primer byte es la marca de borrado
    for (let pos = 32; pos < largoCabecera - 1; pos += 32) {
      const d = Buffer.alloc(32)
      readSync(fd, d, 0, 32, pos)
      if (d[0] === 0x0d) break
      const nombre = d.subarray(0, 11).toString('latin1').split('\0')[0]
      const largo = d[16]
      campos.push({ nombre, tipo: String.fromCharCode(d[11]), largo, desde })
      desde += largo
    }
    return { registros, largoCabecera, largoRegistro, campos }
  } finally {
    closeSync(fd)
  }
}

const args = process.argv.slice(2)
const ruta = args[0]
const clave = args[1] ?? 'monterrey'
const real = args.includes('--real')
const baseLegal = args[args.indexOf('--base-legal') + 1]

if (!ruta) {
  console.error('Falta la ruta del .dbf')
  process.exit(1)
}
if (real && (!args.includes('--base-legal') || !baseLegal || baseLegal.startsWith('--'))) {
  console.error(
    '\n  Para cargar registros reales hace falta --base-legal con la referencia\n' +
      '  del instrumento que autoriza el tratamiento (convenio, acuerdo de\n' +
      '  tratamiento, o la facultad legal del sujeto obligado y su fundamento).\n\n' +
      '  Qué tiene que cubrir: docs/AUTORIZACION-FUENTES-EXTERNAS.md\n',
  )
  process.exit(1)
}

const e = estructura(ruta)
console.log(`\n  ${ruta}`)
console.log(`  ${e.registros.toLocaleString('es-MX')} registros · ${e.largoRegistro} bytes cada uno`)
console.log(`  ${(statSync(ruta).size / 1024 ** 3).toFixed(2)} GB\n`)
console.log('  Campos:')
for (const c of e.campos) {
  console.log(`    ${c.nombre.padEnd(12)} ${c.tipo}${String(c.largo).padEnd(4)} posición ${c.desde}`)
}

// Qué columna del archivo alimenta qué campo nuestro. Se declara aquí y
// no se adivina al vuelo: si el INE o el IMSS cambian el layout, esto es
// lo único que hay que tocar.
const MAPEO = {
  curp: 'CURP',
  nombre: 'NOM_ASEG',
  salario: 'SAL_BASE',
  patron: 'NOM_PAT',
  codigoPostal: 'COD_POST',
} as const

const faltantes = Object.values(MAPEO).filter((c) => !e.campos.some((x) => x.nombre === c))
console.log(
  faltantes.length
    ? `\n  ⚠ El archivo no trae: ${faltantes.join(', ')}. Revisa el mapeo.\n`
    : '\n  El mapeo cuadra con la estructura del archivo.\n',
)

if (!real) {
  console.log('  Modo estructura: no se leyó ni un registro.')
  console.log('  Para poblar con datos sintéticos de esta forma:')
  console.log('    npx tsx --env-file=.env.local db/seed-fuentes-externas.mts ' + clave + '\n')
  process.exit(0)
}

// ---- Carga real -------------------------------------------------------
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const [tenant] = await sql<{ id: string; nombre: string }[]>`
  select id, nombre from tenants where clave = ${clave}`
if (!tenant) {
  console.error(`No existe el cliente ${clave}.`)
  process.exit(1)
}

await sql`
  insert into bitacora (tenant_id, usuario_id, accion, entidad, detalle)
  values (${tenant.id}, null, 'importacion', 'ext_fuentes',
          ${sql.json({
            archivo: ruta,
            registros: e.registros,
            base_legal: baseLegal,
            cuando: new Date().toISOString(),
          })})`

console.log(`  Bitácora escrita. Base legal declarada: ${baseLegal}`)
console.log(`  Importando ${e.registros.toLocaleString('es-MX')} registros a ${tenant.nombre}…\n`)

// La lectura va por tandas: el archivo no cabe en memoria.
const fd = openSync(ruta, 'r')
const buf = Buffer.alloc(e.largoRegistro)
const campo = (c: keyof typeof MAPEO) => {
  const d = e.campos.find((x) => x.nombre === MAPEO[c])!
  return buf.subarray(d.desde, d.desde + d.largo).toString('latin1').trim()
}

let leidos = 0
let cargados = 0
const tanda: (string | number)[][] = []

for (let i = 0; i < e.registros; i++) {
  readSync(fd, buf, 0, e.largoRegistro, e.largoCabecera + i * e.largoRegistro)
  leidos++
  const curp = campo('curp')
  if (curp.length !== 18) continue
  tanda.push([tenant.id, curp, campo('salario'), 'SUA ' + baseLegal])
  if (tanda.length >= 500) {
    await sql`
      insert into ext_telefonos (tenant_id, curp, telefono, fuente)
      values ${sql(tanda)} on conflict do nothing`
    cargados += tanda.length
    tanda.length = 0
    if (cargados % 50000 === 0) console.log(`    ${cargados.toLocaleString('es-MX')}…`)
  }
}
closeSync(fd)
console.log(`\n  ${cargados.toLocaleString('es-MX')} de ${leidos.toLocaleString('es-MX')} cargados.\n`)
await sql.end()
