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
      bloques.push(
        <div key={bloques.length} className="my-3">
          <Tabla>
            <thead>
              <tr>
                {encabezados.map((h, j) => (
                  // Las columnas de cifras se alinean a la derecha: una
                  // columna de números alineada a la izquierda no deja
                  // comparar magnitudes de un vistazo.
                  <th key={j} className={j === 0 ? undefined : 'num'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, j) => (
                <tr key={j}>
                  {f.map((c, k) => (
                    <td key={k} className={k === 0 ? 'whitespace-nowrap' : 'num'}>
                      {conNegritas(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Tabla>
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
