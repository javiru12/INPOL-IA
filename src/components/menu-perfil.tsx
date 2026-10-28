'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconoSalir } from './iconos'
import { salir } from '@/app/acciones'

/**
 * Menú de la persona que entró.
 *
 * El nombre completo, el rol y el botón de salir vivían sueltos en la
 * cabecera y pesaban tanto como la búsqueda, que es lo que la gente
 * viene a usar. Aquí arriba queda solo la inicial; lo demás se abre
 * cuando hace falta, que es casi nunca.
 */
export function MenuPerfil({
  nombre,
  rol,
  campania,
}: {
  nombre: string
  rol: string
  campania: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  const iniciales = nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

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
        aria-label={`Cuenta de ${nombre}`}
        aria-expanded={abierto}
        className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-acento-suave)] text-[var(--text-micro)] font-semibold text-[var(--color-acento-fuerte)] transition-colors hover:bg-[var(--color-acento-borde)]"
      >
        {iniciales}
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-superficie)]"
          style={{ boxShadow: 'var(--shadow-menu)' }}
        >
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <p className="truncate font-medium leading-tight">{nombre}</p>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">{rol}</p>
            {campania && (
              <p className="mt-2 truncate text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                <span className="text-[var(--color-tinta-3)]">Campaña:</span> {campania}
              </p>
            )}
          </div>

          <div className="p-1">
            <Link
              href="/informe"
              role="menuitem"
              onClick={() => setAbierto(false)}
              className="block rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)] transition-colors hover:bg-[var(--color-superficie-2)] hover:text-[var(--color-tinta)]"
            >
              Informe de gestión
            </Link>
          </div>

          <form action={salir} className="border-t border-[var(--color-borde)] p-1">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[var(--text-menuda)] text-[var(--color-tinta-2)] transition-colors hover:bg-[var(--color-alerta-suave)] hover:text-[var(--color-alerta)]"
            >
              <IconoSalir />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
