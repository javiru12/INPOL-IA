/**
 * Lee un archivo grande en el navegador, por rebanadas.
 *
 * Existe porque un archivo de dos gigabytes no puede subir: el cuerpo
 * de una petición se corta en 4.5 MB y una función sin servidor no
 * tiene ni la memoria ni el tiempo para sostenerlo. Lo que sí cabe es
 * leerlo aquí, donde el archivo ya está, e ir mandando lotes de filas.
 *
 * Nunca hay más de una rebanada en memoria, así que el tamaño del
 * archivo deja de importar: importa cuánto tarda, no cuánto pesa.
 *
 * Soporta CSV y DBF, que son los formatos en que de verdad llegan los
 * padrones de este tamaño. El .xlsx va por el camino chico: es un zip
 * que hay que descomprimir entero antes de poder leer una sola fila, y
 * además una hoja de Excel no pasa de 1,048,576 renglones.
 */

export type Formato = 'csv' | 'dbf' | 'xlsx'

export type Cabecera = {
  formato: Formato
  encabezados: string[]
  muestra: string[][]
  /** Filas estimadas. En DBF es exacto; en CSV es una proyección. */
  filasEstimadas: number
  exacto: boolean
}

const REBANADA = 4 * 1024 * 1024

export function formatoDe(nombre: string): Formato | null {
  const n = nombre.toLowerCase()
  if (n.endsWith('.csv') || n.endsWith('.txt')) return 'csv'
  if (n.endsWith('.dbf')) return 'dbf'
  if (n.endsWith('.xlsx')) return 'xlsx'
  return null
}

// ---------- CSV ----------------------------------------------------------

function partirLinea(linea: string, sep: string): string[] {
  const campos: string[] = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (enComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else campo += c
    } else if (c === '"') enComillas = true
    else if (c === sep) { campos.push(campo.trim()); campo = '' }
    else campo += c
  }
  campos.push(campo.trim())
  return campos
}

function adivinarSeparador(primera: string) {
  const cuenta = (c: string) => primera.split(c).length - 1
  return [';', ',', '\t'].sort((a, b) => cuenta(b) - cuenta(a))[0]
}

/**
 * Corta el texto en líneas completas y devuelve lo que sobró.
 *
 * Una rebanada casi nunca termina justo al final de una línea, y una
 * línea puede traer saltos dentro de un campo entrecomillado. Lo que
 * queda a medias se arrastra a la rebanada siguiente.
 */
function lineasCompletas(texto: string): { lineas: string[]; resto: string } {
  const lineas: string[] = []
  let inicio = 0
  let enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '"') enComillas = !enComillas
    else if (c === '\n' && !enComillas) {
      lineas.push(texto.slice(inicio, i).replace(/\r$/, ''))
      inicio = i + 1
    }
  }
  return { lineas, resto: texto.slice(inicio) }
}

// ---------- DBF ----------------------------------------------------------

type CampoDbf = { nombre: string; desde: number; largo: number }

type EsquemaDbf = {
  registros: number
  largoCabecera: number
  largoRegistro: number
  campos: CampoDbf[]
}

async function esquemaDbf(archivo: File): Promise<EsquemaDbf> {
  const cab = new DataView(await archivo.slice(0, 32).arrayBuffer())
  const registros = cab.getUint32(4, true)
  const largoCabecera = cab.getUint16(8, true)
  const largoRegistro = cab.getUint16(10, true)

  const buf = new Uint8Array(await archivo.slice(32, largoCabecera).arrayBuffer())
  const campos: CampoDbf[] = []
  let desde = 1 // el primer byte de cada registro es la marca de borrado
  for (let p = 0; p + 32 <= buf.length; p += 32) {
    if (buf[p] === 0x0d) break
    let nombre = ''
    for (let i = 0; i < 11 && buf[p + i] !== 0; i++) nombre += String.fromCharCode(buf[p + i])
    const largo = buf[p + 16]
    campos.push({ nombre, desde, largo })
    desde += largo
  }
  return { registros, largoCabecera, largoRegistro, campos }
}

const latin1 = new TextDecoder('latin1')

function filaDbf(bytes: Uint8Array, campos: CampoDbf[]) {
  return campos.map((c) => latin1.decode(bytes.subarray(c.desde, c.desde + c.largo)).trim())
}

// ---------- Entrada ------------------------------------------------------

/** Lee solo el principio: encabezados y unas filas para la vista previa. */
export async function leerCabecera(archivo: File): Promise<Cabecera> {
  const formato = formatoDe(archivo.name)
  if (!formato) throw new Error('Solo se aceptan archivos .csv, .dbf y .xlsx.')

  if (formato === 'dbf') {
    const e = await esquemaDbf(archivo)
    const cuantas = Math.min(5, e.registros)
    const bytes = new Uint8Array(
      await archivo.slice(e.largoCabecera, e.largoCabecera + cuantas * e.largoRegistro).arrayBuffer(),
    )
    const muestra: string[][] = []
    for (let i = 0; i < cuantas; i++) {
      muestra.push(filaDbf(bytes.subarray(i * e.largoRegistro, (i + 1) * e.largoRegistro), e.campos))
    }
    return {
      formato,
      encabezados: e.campos.map((c) => c.nombre),
      muestra,
      filasEstimadas: e.registros,
      exacto: true,
    }
  }

  if (formato === 'xlsx') {
    // El .xlsx se manda entero al servidor, que ya sabe leerlo.
    return { formato, encabezados: [], muestra: [], filasEstimadas: 0, exacto: false }
  }

  const trozo = await archivo.slice(0, Math.min(REBANADA, archivo.size)).text()
  const limpio = trozo.replace(/^﻿/, '').replace(/^sep=.\r?\n/, '')
  const { lineas } = lineasCompletas(limpio)
  if (lineas.length === 0) throw new Error('El archivo no trae ninguna línea.')

  const sep = adivinarSeparador(lineas[0])
  const encabezados = partirLinea(lineas[0], sep).map((h, i) => h || `Columna ${i + 1}`)
  const muestra = lineas.slice(1, 6).map((l) => partirLinea(l, sep))

  // Proyección por el peso medio de las líneas leídas. No es exacta y se
  // dice que no lo es: contar las líneas de un archivo de dos gigas
  // obliga a leerlo entero antes de empezar.
  const medio = limpio.length / Math.max(1, lineas.length)
  return {
    formato,
    encabezados,
    muestra,
    filasEstimadas: Math.max(0, Math.round(archivo.size / medio) - 1),
    exacto: archivo.size <= REBANADA,
  }
}

/**
 * Recorre el archivo entregando lotes de filas.
 *
 * `porLote` se mide en filas y no en bytes porque lo que limita al otro
 * lado es el tamaño de la petición, y una fila de padrón pesa parecido
 * siempre.
 */
export async function* recorrer(
  archivo: File,
  porLote = 2000,
): AsyncGenerator<{ filas: string[][]; bytesLeidos: number }> {
  const formato = formatoDe(archivo.name)

  if (formato === 'dbf') {
    const e = await esquemaDbf(archivo)
    for (let i = 0; i < e.registros; i += porLote) {
      const cuantas = Math.min(porLote, e.registros - i)
      const desde = e.largoCabecera + i * e.largoRegistro
      const bytes = new Uint8Array(
        await archivo.slice(desde, desde + cuantas * e.largoRegistro).arrayBuffer(),
      )
      const filas: string[][] = []
      for (let j = 0; j < cuantas; j++) {
        const r = bytes.subarray(j * e.largoRegistro, (j + 1) * e.largoRegistro)
        // 0x2a marca el registro como borrado; no es dato vigente.
        if (r[0] !== 0x2a) filas.push(filaDbf(r, e.campos))
      }
      yield { filas, bytesLeidos: desde + cuantas * e.largoRegistro }
    }
    return
  }

  let sep = ''
  let resto = ''
  let primera = true
  let acumuladas: string[][] = []

  for (let desde = 0; desde < archivo.size; desde += REBANADA) {
    const trozo = await archivo.slice(desde, Math.min(desde + REBANADA, archivo.size)).text()
    const texto = resto + (desde === 0 ? trozo.replace(/^﻿/, '').replace(/^sep=.\r?\n/, '') : trozo)
    const corte = lineasCompletas(texto)
    resto = corte.resto

    for (const linea of corte.lineas) {
      if (!linea.trim()) continue
      if (primera) {
        sep = adivinarSeparador(linea)
        primera = false
        continue
      }
      acumuladas.push(partirLinea(linea, sep))
      if (acumuladas.length >= porLote) {
        yield { filas: acumuladas, bytesLeidos: desde + trozo.length }
        acumuladas = []
      }
    }
  }

  if (resto.trim() && !primera) acumuladas.push(partirLinea(resto, sep))
  if (acumuladas.length) yield { filas: acumuladas, bytesLeidos: archivo.size }
}
