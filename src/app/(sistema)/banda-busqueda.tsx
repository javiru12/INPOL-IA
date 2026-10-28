'use client'

import { useTransition } from 'react'
import { limpiarBusquedaMaestra } from './busqueda-acciones'

/**
 * La banda que avisa que hay una búsqueda maestra puesta.
 *
 * Sin ella, un listado acotado se ve igual que uno vacío y quien mira
 * concluye que no hay datos. Lo que filtra tiene que decirse en la
 * pantalla, y con el botón para quitarlo al lado.
 */
export function BandaBusqueda({ termino }: { termino: string }) {
  const [quitando, iniciar] = useTransition()

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--color-borde)] px-5 py-2 text-[var(--text-menuda)]"
      style={{ background: 'var(--color-acento-suave)' }}
      role="status"
    >
      <span className="rotulo">Buscando en todo el sistema</span>
      <strong className="font-semibold">«{termino}»</strong>
      <span className="text-[var(--color-tinta-2)]">
        · los listados están acotados a esto
      </span>
      <button
        type="button"
        disabled={quitando}
        onClick={() => iniciar(() => void limpiarBusquedaMaestra())}
        className="boton boton-neutro !h-7 ml-auto"
      >
        {quitando ? 'Quitando…' : 'Limpiar filtro'}
      </button>
    </div>
  )
}
