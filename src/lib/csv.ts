import 'server-only'

/**
 * Serializa filas a CSV para Excel en español.
 *
 * Lleva BOM UTF-8 y separador de punto y coma: sin eso, Excel en una
 * máquina con configuración regional de México abre el archivo con los
 * acentos rotos y todas las columnas encimadas en la primera celda.
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

  return '﻿' + lineas.join('\r\n') + '\r\n'
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
