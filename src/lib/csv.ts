import 'server-only'

/**
 * Serializa filas a CSV para Excel en español.
 *
 * Tres cosas, y las tres hacen falta:
 *
 * - **BOM UTF-8**, o Excel abre los acentos rotos.
 * - **Punto y coma** como separador, que es lo que espera Excel con
 *   configuración regional de México.
 * - **La línea `sep=;` al principio.** El separador correcto no basta: al
 *   abrir el archivo de un doble clic, Excel usa el de su configuración
 *   regional y no el del archivo, así que en una máquina en inglés todo
 *   caía encimado en la primera columna. Esta línea se la impone y
 *   funciona en cualquier idioma y en Mac.
 */
export function aCsv(
  columnas: { clave: string; titulo: string }[],
  filas: Record<string, unknown>[],
): string {
  const escapar = (valor: unknown) => {
    if (valor === null || valor === undefined) return ''
    const texto = String(valor)
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }

  const lineas = [
    columnas.map((c) => escapar(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => escapar(f[c.clave])).join(';')),
  ]

  return '﻿' + 'sep=;\r\n' + lineas.join('\r\n') + '\r\n'
}

export function respuestaCsv(contenido: string, nombre: string) {
  return new Response(contenido, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nombre}"`,
      'cache-control': 'no-store',
    },
  })
}

/** Nombre de archivo con la fecha, para no acumular «descarga (3).csv». */
export function nombreConFecha(base: string) {
  const hoy = new Date().toISOString().slice(0, 10)
  return `${base}-${hoy}.csv`
}
