'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { registrarAviso, type EstadoAccion } from './acciones'
import { VIAS_AVISO } from './catalogo'

/**
 * Registro del aviso, renglón por renglón.
 *
 * El sistema no manda el mensaje: quien atiende llama o escribe y aquí
 * deja constancia. Por eso pregunta «por dónde» y no ofrece un «enviar»
 * que no existiría.
 *
 * Un solo control por renglón, no dos: con 25 filas por página, un
 * selector y un botón en cada una son cincuenta cajas que hacen ruido
 * para registrar un dato que casi siempre es el mismo. El botón abre el
 * canal y al elegirlo guarda: cada opción es su propio `submit`, así que
 * la vía viaja en el envío sin estado de por medio.
 */
export function RegistrarAviso({
  peticionId,
  tieneTelefono,
  tieneCorreo,
}: {
  peticionId: string
  tieneTelefono: boolean
  tieneCorreo: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(registrarAviso, {})
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLFormElement>(null)

  // La vía que tiene sentido para esta persona va primero en la lista.
  const sugerida = tieneTelefono ? 'llamada' : tieneCorreo ? 'correo' : 'presencial'
  const vias = [...VIAS_AVISO].sort(
    (a, b) => Number(b.valor === sugerida) - Number(a.valor === sugerida),
  )

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
    <form ref={caja} action={accion} className="relative flex items-center justify-end">
      <input type="hidden" name="peticionId" value={peticionId} />
      <Boton abierto={abierto} alternar={() => setAbierto((v) => !v)} />

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 w-48 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-superficie)] p-1"
          style={{ boxShadow: 'var(--shadow-menu)' }}
        >
          <p className="rotulo px-2 pb-1 pt-0.5">Se le avisó por</p>
          {vias.map((v) => (
            <button
              key={v.valor}
              type="submit"
              name="via"
              value={v.valor}
              className="block w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[var(--text-menuda)] text-[var(--color-tinta-2)] transition-colors hover:bg-[var(--color-acento-suave)] hover:text-[var(--color-acento-fuerte)]"
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      )}

      {estado.error && (
        <span role="alert" className="ml-2 text-[var(--text-micro)] text-[var(--color-alerta)]">
          {estado.error}
        </span>
      )}
    </form>
  )
}

function Boton({ abierto, alternar }: { abierto: boolean; alternar: () => void }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pending}
      aria-expanded={abierto}
      className="boton boton-neutro !h-7 shrink-0 text-[var(--text-menuda)]"
    >
      {pending ? 'Guardando…' : 'Marcar avisado'}
      <span aria-hidden="true" className="text-[var(--color-tinta-3)]">▾</span>
    </button>
  )
}
