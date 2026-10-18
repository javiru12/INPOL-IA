'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Búsqueda y filtro por perfil para la tabla del equipo.
 *
 * Filtra las filas ya pintadas por el servidor en vez de volver a pedir
 * la página: son trece renglones, y recargar entero para esconder cinco
 * sería más lento que útil. El orden de las columnas sí sigue viviendo en
 * la URL, porque esa vista sí se comparte.
 *
 * Cada fila trae `data-persona` y `data-perfil` puestos por el servidor;
 * aquí solo se decide cuáles se ven.
 */
export function FiltrosEquipo({ perfiles }: { perfiles: string[] }) {
  const [texto, setTexto] = useState('')
  const [perfil, setPerfil] = useState('')
  const [visibles, setVisibles] = useState<number | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tabla = caja.current?.closest('section')?.querySelector('tbody')
    if (!tabla) return

    const q = texto.trim().toLowerCase()
    let cuenta = 0

    for (const fila of Array.from(tabla.rows)) {
      const persona = (fila.dataset.persona ?? '').toLowerCase()
      const suPerfil = fila.dataset.perfil ?? ''
      const pasaTexto = !q || persona.includes(q)
      const pasaPerfil = !perfil || suPerfil === perfil
      const mostrar = pasaTexto && pasaPerfil
      fila.hidden = !mostrar
      if (mostrar) cuenta++
    }

    setVisibles(q || perfil ? cuenta : null)
  }, [texto, perfil])

  return (
    <div ref={caja} className="flex flex-wrap items-center gap-2">
      {visibles !== null && (
        <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {visibles === 0 ? 'nadie coincide' : `${visibles} visible${visibles === 1 ? '' : 's'}`}
        </span>
      )}
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar persona…"
        className="campo !h-8 w-44"
      />
      <select
        value={perfil}
        onChange={(e) => setPerfil(e.target.value)}
        className="campo !h-8 !w-auto"
      >
        <option value="">Todos los perfiles</option>
        {perfiles.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {(texto || perfil) && (
        <button
          type="button"
          onClick={() => {
            setTexto('')
            setPerfil('')
          }}
          className="boton boton-llano !h-8 text-[var(--text-menuda)]"
        >
          Limpiar
        </button>
      )}
    </div>
  )
}
