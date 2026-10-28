import 'server-only'
import { deflateRawSync } from 'node:zlib'

/**
 * Generador mínimo de archivos .xlsx.
 *
 * Se dejó de exportar CSV porque en Excel no hay forma de quedar bien
 * con las tres cosas a la vez:
 *
 * - Sin la línea `sep=;`, Excel parte las columnas con el separador de
 *   su configuración regional y en una máquina en inglés todo cae
 *   encimado en la primera columna.
 * - Con `sep=;`, Excel entra por un camino de lectura antiguo que
 *   IGNORA el BOM, lee los bytes UTF-8 con la codificación del sistema
 *   y saca «San Bernab√©» donde dice «San Bernabé».
 * - Y en cualquiera de los dos casos una fecha es texto: «12/10/2026»
 *   lo lee como 12 de octubre o como 10 de diciembre según el idioma,
 *   y «25/10/2026» no lo puede leer como fecha, así que lo deja de
 *   texto. En la misma columna salen los dos tipos.
 *
 * Un .xlsx no tiene separador —es XML dentro de un zip—, es UTF-8 por
 * definición y las fechas van como número con formato, así que el
 * archivo se ve igual en cualquier computadora.
 *
 * Esto escribe lo mínimo que Excel acepta; no es una librería general.
 */

export type TipoColumna = 'texto' | 'numero' | 'fecha'

export type ColumnaXlsx = {
  clave: string
  titulo: string
  tipo?: TipoColumna
}

const TABLA_CRC = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(b: Buffer) {
  let c = -1
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function escapar(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Excel rechaza el archivo entero si encuentra un carácter de
    // control; los datos capturados a mano a veces los traen.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

/**
 * Excel cuenta los días desde el 30/12/1899. El día de base no es un
 * error de dedo: Excel cree que 1900 fue bisiesto y arrastrar ese error
 * es lo que hace que las fechas cuadren.
 */
function serieDeFecha(d: Date) {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor((utc - Date.UTC(1899, 11, 30)) / 86400000)
}

function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string' || !v.trim()) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const mx = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v)
  if (mx) return new Date(Number(mx[3]), Number(mx[2]) - 1, Number(mx[1]))
  return null
}

function celda(ref: string, valor: unknown, tipo: TipoColumna) {
  if (valor === null || valor === undefined || valor === '') return ''

  if (tipo === 'fecha') {
    const d = aFecha(valor)
    if (d) return `<c r="${ref}" s="2"><v>${serieDeFecha(d)}</v></c>`
  }

  if (tipo === 'numero') {
    const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/,/g, ''))
    if (Number.isFinite(n)) return `<c r="${ref}"><v>${n}</v></c>`
  }

  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(String(valor))}</t></is></c>`
}

function columnaDeIndice(i: number) {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - r) / 26)
  }
  return s
}

const ARCHIVOS_FIJOS: Record<string, string> = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,

  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,

  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,

  // Estilo 1: encabezado en negritas. Estilo 2: fecha DD/MM/AAAA, que
  // al ser número con formato se ve igual en cualquier idioma.
  'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="DD/MM/YYYY"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
}

function libro(nombreHoja: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(nombreHoja).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
}

function hoja(columnas: ColumnaXlsx[], filas: Record<string, unknown>[]) {
  // Un ancho aproximado por el contenido: sin esto todo sale en el
  // ancho por omisión y hay que ajustar columna por columna a mano.
  const anchos = columnas.map((c, i) => {
    let max = c.titulo.length
    for (const f of filas) {
      const v = f[c.clave]
      if (v !== null && v !== undefined) max = Math.max(max, String(v).length)
    }
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(max + 2, 9), 55)}" customWidth="1"/>`
  })

  const encabezado = columnas
    .map(
      (c, i) =>
        `<c r="${columnaDeIndice(i)}1" t="inlineStr" s="1"><is><t>${escapar(c.titulo)}</t></is></c>`,
    )
    .join('')

  const cuerpo = filas.map((f, n) => {
    const r = n + 2
    const celdas = columnas
      .map((c, i) => celda(`${columnaDeIndice(i)}${r}`, f[c.clave], c.tipo ?? 'texto'))
      .join('')
    return `<row r="${r}">${celdas}</row>`
  })

  const ultima = `${columnaDeIndice(columnas.length - 1)}${filas.length + 1}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultima}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${anchos.join('')}</cols><sheetData><row r="1">${encabezado}</row>${cuerpo.join('')}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`
}

function zip(entradas: { nombre: string; datos: Buffer }[]) {
  const locales: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8')
    const comprimido = deflateRawSync(e.datos)
    const crc = crc32(e.datos)

    const cabecera = Buffer.alloc(30)
    cabecera.writeUInt32LE(0x04034b50, 0)
    cabecera.writeUInt16LE(20, 4)
    cabecera.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    cabecera.writeUInt16LE(8, 8) // deflate
    cabecera.writeUInt32LE(0, 10) // fecha y hora: irrelevantes aquí
    cabecera.writeUInt32LE(crc, 14)
    cabecera.writeUInt32LE(comprimido.length, 18)
    cabecera.writeUInt32LE(e.datos.length, 22)
    cabecera.writeUInt16LE(nombre.length, 26)
    locales.push(cabecera, nombre, comprimido)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(0, 12)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(comprimido.length, 20)
    dir.writeUInt32LE(e.datos.length, 24)
    dir.writeUInt16LE(nombre.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nombre)

    offset += cabecera.length + nombre.length + comprimido.length
  }

  const directorio = Buffer.concat(central)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(entradas.length, 8)
  fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(offset, 16)

  return Buffer.concat([...locales, directorio, fin])
}

export function aXlsx(
  columnas: ColumnaXlsx[],
  filas: Record<string, unknown>[],
  nombreHoja = 'Datos',
): Buffer {
  const partes: Record<string, string> = {
    ...ARCHIVOS_FIJOS,
    'xl/workbook.xml': libro(nombreHoja),
    'xl/worksheets/sheet1.xml': hoja(columnas, filas),
  }
  return zip(
    Object.entries(partes).map(([nombre, texto]) => ({
      nombre,
      datos: Buffer.from(texto, 'utf8'),
    })),
  )
}

export function respuestaXlsx(contenido: Buffer, nombre: string) {
  return new Response(new Uint8Array(contenido), {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${nombre}"`,
      'cache-control': 'no-store',
    },
  })
}

/**
 * Nombre con la fecha, para no acumular «descarga (3).xlsx».
 *
 * La fecha se arma en la zona del estado y no con `toISOString`, que da
 * la de UTC: a las nueve de la noche en México el archivo salía fechado
 * al día siguiente.
 */
export function nombreConFechaXlsx(base: string, zona = 'America/Mexico_City') {
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return `${base}-${hoy}.xlsx`
}
