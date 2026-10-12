'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cambiarBajaCiudadano, type EstadoAccion } from '../acciones'

/**
 * Baja lógica, no borrado: la persona tiene peticiones colgando y su
 * historial debe seguir siendo consultable. Deja de aparecer en el padrón,
 * no deja de haber existido.
 */
export function BotonBaja({ id, activo }: { id: string; activo: boolean }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarBajaCiudadano, {})
  const [confirmando, setConfirmando] = useState(false)

  if (activo && !confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="boton boton-neutro"
      >
        Dar de baja
      </button>
    )
  }

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="alta" value={activo ? 'no' : 'si'} />
      {activo && (
        <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          ¿Seguro? Su historial se conserva.
        </span>
      )}
      <Confirmar activo={activo} />
      {activo && (
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="boton boton-llano"
        >
          Cancelar
        </button>
      )}
      {estado.error && (
        <span className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
          {estado.error}
        </span>
      )}
    </form>
  )
}

function Confirmar({ activo }: { activo: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={activo ? 'boton' : 'boton boton-primario'}
      style={
        activo
          ? { background: 'var(--color-alerta)', color: '#fff', borderColor: 'var(--color-alerta)' }
          : undefined
      }
    >
      {pending ? 'Guardando…' : activo ? 'Sí, dar de baja' : 'Reactivar'}
    </button>
  )
}
