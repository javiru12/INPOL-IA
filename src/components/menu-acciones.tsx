'use client'

import { useEffect, useRef, useState } from 'react'
import { IconoPuntos } from './iconos'

/**
 * Menú de acciones secundarias.
 *
 * Lo que es delicado —dar de baja a alguien, borrar— no puede estar al
 * mismo nivel que «Editar»: compite por la mirada y se toca por error.
 * Aquí vive detrás de un paso más, que es exactamente la fricción que
 * una acción así merece.
 */
export function MenuAcciones({
  children,
  etiqueta = 'Más acciones',
}: {
  children: React.ReactNode
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return

    function fuera(e: MouseEvent) {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={etiqueta}
        aria-expanded={abierto}
        className="boton boton-neutro !w-9 !px-0"
      >
        <IconoPuntos />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-superficie)] p-1"
          style={{ boxShadow: 'var(--shadow-menu)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
