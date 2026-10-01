'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { registrarAviso, type EstadoAccion } from './acciones'
import { VIAS_AVISO } from './catalogo'

/**
 * Registro del aviso, renglón por renglón.
 *
 * El sistema no manda el mensaje: quien atiende llama o escribe y aquí
 * deja constancia. Por eso el control pregunta «por dónde» y no ofrece
 * un «enviar» que no existiría.
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

  const sugerida = tieneTelefono ? 'llamada' : tieneCorreo ? 'correo' : 'presencial'

  return (
    <form action={accion} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="peticionId" value={peticionId} />
      <label>
        <span className="sr-only">Por dónde se le avisó</span>
        <select
          name="via"
          defaultValue={sugerida}
          className="campo !h-7 !w-auto pr-6 text-[var(--text-menuda)]"
        >
          {VIAS_AVISO.map((v) => (
            <option key={v.valor} value={v.valor}>
              {v.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <Boton />
      {estado.error && (
        <span role="alert" className="text-[var(--text-micro)] text-[var(--color-alerta)]">
          {estado.error}
        </span>
      )}
    </form>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="boton boton-neutro !h-7 shrink-0 text-[var(--text-menuda)]"
    >
      {pending ? 'Guardando…' : 'Marcar avisado'}
    </button>
  )
}
