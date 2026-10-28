import 'server-only'
import { inflateRawSync } from 'node:zlib'

/**
 * Lee un archivo tabular subido por quien usa el sistema: .xlsx o .csv.
 *
 * Se escribe a mano por lo mismo que el generador de `xlsx.ts`: traer
 * una librería de hoja de cálculo entera para leer encabezados y filas
 * es desproporcionado, y las que hay cargan el archivo completo en
 * memoria, que es justo lo que no queremos de un archivo subido por
 * alguien más.
 */

export type Tabla = {
  encabezados: string[]
  filas: string[][]
  /** Cuántas filas tenía el archivo, aunque se hayan leído menos. */
  totalFilas: number
}

/**
 * Tope del camino que sube el archivo entero, que hoy es solo el .xlsx.
 *
 * No es un número elegido: Vercel corta el cuerpo de cualquier petición
 * en 4.5 MB, así que por encima de eso manda el servidor y no esta
 * línea. Se deja en 8 MB porque en una instalación propia sí aplica.
 *
 * El CSV y el DBF no pasan por aquí cuando vienen del navegador: los
 * lee `leer-tabla-cliente.ts` por rebanadas y no tienen tope.
 */
export const MAXIMO_FILAS = 200_000
export const MAXIMO_BYTES = 8 * 1024 * 1024

// ---------- ZIP ----------------------------------------------------------

/**
 * Saca un archivo de dentro de un zip.
 *
 * Se recorre el directorio central y no los encabezados locales: el
 * local no siempre trae los tamaños —cuando el escritor usó descriptor
 * de datos vienen en cero— y entonces no se sabe dónde termina cada
 * entrada.
 */
function delZip(buf: Buffer, nombre: string): Buffer | null {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (fin < 0) return null
  const cuantos = buf.readUInt16LE(fin + 10)
  let p = buf.readUInt32LE(fin + 16)

  for (let i = 0; i < cuantos; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null
    const metodo = buf.readUInt16LE(p + 10)
    const comprimido = buf.readUInt32LE(p + 20)
    const crudo = buf.readUInt32LE(p + 24)
    const largoNombre = buf.readUInt16LE(p + 28)
    const largoExtra = buf.readUInt16LE(p + 30)
    const largoComentario = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const actual = buf.subarray(p + 46, p + 46 + largoNombre).toString('utf8')

    if (actual === nombre) {
      // El encabezado local tiene su propio largo de nombre y extra, que
      // no siempre coinciden con los del directorio.
      const ln = buf.readUInt16LE(offset + 26)
      const le = buf.readUInt16LE(offset + 28)
      const datos = buf.subarray(offset + 30 + ln + le, offset + 30 + ln + le + comprimido)
      return metodo === 0 ? datos : inflateRawSync(datos, { maxOutputLength: crudo + 1024 })
    }
    p += 46 + largoNombre + largoExtra + largoComentario
  }
  return null
}

// ---------- XLSX ---------------------------------------------------------

function desescapar(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/** El texto de un nodo, juntando los <t> que pueda tener dentro. */
function textoDe(xml: string) {
  const partes = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g)
  if (!partes) return ''
  return desescapar(partes.map((p) => p.replace(/<[^>]+>/g, '')).join(''))
}

function columnaDeRef(ref: string) {
  const letras = ref.replace(/\d+/g, '')
  let n = 0
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/**
 * La fecha que representa un número de Excel.
 *
 * Excel cuenta los días desde el 30/12/1899 y cree que 1900 fue
 * bisiesto; arrastrar ese error es lo que hace que las fechas cuadren.
 */
function fechaDeSerie(n: number) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function leerXlsx(buf: Buffer): Tabla {
  const hoja = delZip(buf, 'xl/worksheets/sheet1.xml')
  if (!hoja) throw new Error('El archivo no parece un Excel válido.')

  const compartidas: string[] = []
  const sst = delZip(buf, 'xl/sharedStrings.xml')
  if (sst) {
    for (const si of sst.toString('utf8').match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      compartidas.push(textoDe(si))
    }
  }

  // Qué estilos son fecha: sin esto, una columna de fechas se lee como
  // el número de días que Excel guarda por dentro y sale «46307».
  const estilosFecha = new Set<number>()
  const estilos = delZip(buf, 'xl/styles.xml')
  if (estilos) {
    const texto = estilos.toString('utf8')
    const personalizados = new Set<number>()
    for (const m of texto.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
      if (/[dmy]/i.test(m[2]) && !/[eE]\+/.test(m[2])) personalizados.add(Number(m[1]))
    }
    const xfs = texto.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
    let i = 0
    for (const m of xfs.matchAll(/<xf[^>]*numFmtId="(\d+)"[^>]*>?/g)) {
      const id = Number(m[1])
      // 14 a 22 y 45 a 47 son los formatos de fecha y hora que Excel trae de fábrica.
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || personalizados.has(id)) {
        estilosFecha.add(i)
      }
      i++
    }
  }

  const filas: string[][] = []
  const texto = hoja.toString('utf8')
  let total = 0

  // La variante autocerrada va PRIMERO en la alternancia. Al revés,
  // `<row r="8"/>` encaja como etiqueta de apertura y se traga hasta el
  // `</row>` de la fila siguiente.
  for (const fila of texto.match(/<row[^>]*\/>|<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    total++
    if (filas.length >= MAXIMO_FILAS + 1) continue
    const celdas: string[] = []
    // Lo mismo con las celdas, y aquí el daño es peor: una celda vacía
    // autocerrada —`<c r="A8" t="inlineStr" />`, que es como Excel
    // escribe un campo en blanco— se comía la celda siguiente y todas
    // las columnas de esa fila se recorrían una posición. El teléfono
    // de una persona acababa en el campo de otra sin que nada fallara.
    for (const c of fila.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1]
      const col = ref ? columnaDeRef(ref) : celdas.length
      const tipo = /t="([^"]+)"/.exec(c)?.[1]
      const estilo = Number(/s="(\d+)"/.exec(c)?.[1] ?? -1)

      let valor = ''
      if (tipo === 'inlineStr') valor = textoDe(c)
      else if (tipo === 's') valor = compartidas[Number(/<v>([^<]*)<\/v>/.exec(c)?.[1] ?? -1)] ?? ''
      else if (tipo === 'str') valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(c)?.[1] ?? '')
      else {
        const crudo = /<v>([^<]*)<\/v>/.exec(c)?.[1] ?? ''
        valor =
          crudo && estilosFecha.has(estilo) && Number.isFinite(Number(crudo))
            ? fechaDeSerie(Number(crudo))
            : crudo
      }

      while (celdas.length < col) celdas.push('')
      celdas[col] = valor.trim()
    }
    filas.push(celdas)
  }

  const encabezados = (filas.shift() ?? []).map((h, i) => h || `Columna ${i + 1}`)
  return { encabezados, filas: filas.slice(0, MAXIMO_FILAS), totalFilas: Math.max(0, total - 1) }
}

// ---------- CSV ----------------------------------------------------------

/**
 * CSV con comillas, saltos de línea dentro de campo y separador
 * adivinado: los archivos que manda la gente vienen con coma, con punto
 * y coma y a veces con tabulador, y preguntar cuál es pide que quien
 * sube sepa algo que no tiene por qué saber.
 */
function leerCsv(texto: string): Tabla {
  let t = texto.replace(/^﻿/, '')
  // Excel escribe esta línea al principio cuando exporta; no es dato.
  const sep0 = /^sep=(.)\r?\n/.exec(t)
  let sep = sep0?.[1]
  if (sep0) t = t.slice(sep0[0].length)

  if (!sep) {
    const primera = t.slice(0, t.indexOf('\n') + 1 || undefined)
    const cuenta = (c: string) => (primera.match(new RegExp(`\\${c}`, 'g')) ?? []).length
    sep = [';', ',', '\t'].sort((a, b) => cuenta(b) - cuenta(a))[0]
  }

  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else campo += c
    } else if (c === '"') enComillas = true
    else if (c === sep) { fila.push(campo.trim()); campo = '' }
    else if (c === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila) }

  const llenas = filas.filter((f) => f.some((x) => x !== ''))
  const encabezados = (llenas.shift() ?? []).map((h, i) => h || `Columna ${i + 1}`)
  return { encabezados, filas: llenas.slice(0, MAXIMO_FILAS), totalFilas: llenas.length }
}

// ---------- Entrada ------------------------------------------------------

export function leerTabla(nombre: string, buf: Buffer): Tabla {
  if (buf.length > MAXIMO_BYTES) {
    throw new Error(
      `El archivo pesa ${(buf.length / 1024 ** 2).toFixed(1)} MB y el tope para Excel es ` +
        `${MAXIMO_BYTES / 1024 ** 2} MB. Guárdalo como CSV: así no tiene tope, porque se lee ` +
        'en el navegador en vez de subirlo.',
    )
  }
  const bajo = nombre.toLowerCase()
  if (bajo.endsWith('.xlsx')) return leerXlsx(buf)
  if (bajo.endsWith('.csv') || bajo.endsWith('.txt')) return leerCsv(buf.toString('utf8'))
  throw new Error('Solo se aceptan archivos .xlsx y .csv.')
}
