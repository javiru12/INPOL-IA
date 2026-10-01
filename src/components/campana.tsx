'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconoCampana } from './iconos'
import type { Alerta } from '@/lib/alertas'

const COLOR = {
  alerta: 'var(--color-alerta)',
  aviso: 'var(--color-aviso)',
  dato: 'var(--color-dato)',
  acento: 'var(--color-acento)',
} as const

/**
 * Campana de alertas.
 *
 * Las cifras llegan ya resueltas del servidor, filtradas por el perfil:
 * aquí no se decide qué se ve, solo cómo se enseña. Cada renglón es un
 * enlace a la pantalla donde eso se resuelve.
 */
export function Campana({ alertas }: { alertas: Alerta[] }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const total = alertas.reduce((suma, a) => suma + a.cifra, 0)

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
        className="boton boton-llano !h-8 !w-8 !p-0 relative"
        aria-label={total ? `Alertas: ${total} pendientes` : 'Alertas: nada pendiente'}
        aria-expanded={abierto}
        data-alertas={total}
      >
        <IconoCampana />
        {total > 0 && (
          <span
            className="cifra absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[length:var(--text-micro)] font-semibold leading-none text-white"
            style={{ background: 'var(--color-alerta)' }}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Alertas"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[22rem] overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-superficie)]"
          style={{ boxShadow: 'var(--shadow-menu)' }}
        >
          <div className="flex items-baseline justify-between border-b border-[var(--color-borde)] px-4 py-2.5">
            <span className="rotulo">Alertas</span>
            {total > 0 && (
              <span className="cifra text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                {total} pendiente{total === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {alertas.length === 0 ? (
            <p className="px-4 py-7 text-center text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              No tienes nada pendiente ahora mismo.
            </p>
          ) : (
            <ul className="py-1">
              {alertas.map((a) => (
                <li key={a.clave}>
                  <Link
                    href={a.ruta}
                    onClick={() => setAbierto(false)}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--color-acento-suave)]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: COLOR[a.tono] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[var(--text-base)] font-medium">
                        {a.etiqueta}
                      </span>
                      <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                        {a.apoyo}
                      </span>
                    </span>
                    <span
                      className="cifra shrink-0 text-[var(--text-media)] font-semibold tabular-nums"
                      style={{ color: COLOR[a.tono] }}
                    >
                      {a.cifra.toLocaleString('es-MX')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
