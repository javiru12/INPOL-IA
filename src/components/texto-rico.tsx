import type { ReactNode } from 'react'
import { Tabla } from './tabla'

/**
 * Pinta el subconjunto de Markdown que el asistente usa de verdad.
 *
 * No es un intérprete completo ni quiere serlo: traer una librería de
 * Markdown entera —con enlaces, imágenes y HTML incrustado— para
 * respuestas que solo traen negritas, listas y tablas sería cargar una
 * superficie de ataque que no necesitamos. Lo que no reconoce sale como
 * texto, que es la forma correcta de fallar aquí.
 */

function conNegritas(linea: string): ReactNode[] {
  return linea.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) =>
    trozo.startsWith('**') && trozo.endsWith('**') ? (
      <strong key={i} className="font-semibold">
        {trozo.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{trozo}</span>
    ),
  )
}

const esFilaTabla = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|')
const esSeparador = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l)
const celdas = (l: string) =>
  l.trim().slice(1, -1).split('|').map((c) => c.trim())

export function TextoRico({ texto }: { texto: string }) {
  const lineas = texto.split('\n')
  const bloques: ReactNode[] = []
  let i = 0

  while (i < lineas.length) {
    const l = lineas[i]

    // Tabla: encabezado, separador y filas hasta que deje de serlo.
    if (esFilaTabla(l) && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      const encabezados = celdas(l)
      const filas: string[][] = []
      i += 2
      while (i < lineas.length && esFilaTabla(lineas[i])) {
        filas.push(celdas(lineas[i]))
        i++
      }
      // Qué columnas son de cifras se decide por lo que traen, no por
      // su posición: antes todo lo que no fuera la primera columna se
      // alineaba a la derecha, así que en una tabla «# · Colonia ·
      // Peticiones» los nombres de colonia salían pegados a la derecha.
      const esNumero = (v: string) =>
        /^[-+]?[$]?\s*[0-9][0-9.,\s]*%?$/.test(v.replace(/\*/g, '').trim())
      const columnaDeCifras = encabezados.map((_, j) => {
        const valores = filas.map((f) => (f[j] ?? '').trim()).filter(Boolean)
        return valores.length > 0 && valores.every(esNumero)
      })

      bloques.push(
        // Una respuesta con cuarenta renglones empujaba todo lo demás
        // fuera de la pantalla y había que recorrer la tabla entera para
        // volver al texto. Contenida: alto máximo, encabezado pegado
        // arriba y el conteo al pie para saber cuánto hay sin bajar.
        <div
          key={bloques.length}
          className="tabla-contenida my-3 overflow-clip rounded-[var(--radius-md)] border border-[var(--color-borde)]"
        >
          <div className="max-h-[22rem] overflow-auto">
          <Tabla>
            <thead>
              <tr>
                {encabezados.map((h, j) => (
                  // Las columnas de cifras se alinean a la derecha: una
                  // columna de números alineada a la izquierda no deja
                  // comparar magnitudes de un vistazo.
                  <th key={j} className={columnaDeCifras[j] ? 'num' : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, j) => (
                <tr key={j}>
                  {f.map((c, k) => (
                    <td key={k} className={columnaDeCifras[k] ? 'num' : 'whitespace-nowrap'}>
                      {conNegritas(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Tabla>
          </div>
          {filas.length > 8 && (
            <p className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-3 py-1.5 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
              {filas.length} renglones
            </p>
          )}
        </div>,
      )
      continue
    }

    // Lista.
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = []
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) {
        items.push(lineas[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      bloques.push(
        <ul key={bloques.length} className="my-2 space-y-1.5 pl-1">
          {items.map((t, j) => (
            <li key={j} className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--color-tinta-3)]">
                ·
              </span>
              <span>{conNegritas(t)}</span>
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Párrafo: junta líneas seguidas hasta un renglón en blanco.
    if (l.trim()) {
      const parrafo: string[] = []
      while (
        i < lineas.length &&
        lineas[i].trim() &&
        !esFilaTabla(lineas[i]) &&
        !/^\s*[-*]\s+/.test(lineas[i])
      ) {
        parrafo.push(lineas[i])
        i++
      }
      bloques.push(
        <p key={bloques.length} className="my-2 leading-relaxed">
          {conNegritas(parrafo.join(' '))}
        </p>,
      )
      continue
    }

    i++
  }

  return <div className="text-[var(--text-base)]">{bloques}</div>
}
