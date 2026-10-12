'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cambiarBajaActividad, type EstadoAccion } from '../../acciones'

/**
 * Baja lógica: durante la actividad se levantaron peticiones y borrarla
 * las dejaría sin origen. Deja de contar, no deja de haber ocurrido.
 */
export function BajaActividad({
  id,
  tipo,
  activo,
}: {
  id: string
  tipo: 'evento' | 'recorrido'
  activo: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarBajaActividad, {})
  const [confirmando, setConfirmando] = useState(false)

  if (activo && !confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="boton boton-neutro">
        Cancelar actividad
      </button>
    )
  }

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="alta" value={activo ? 'no' : 'si'} />
      {activo && (
        <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          ¿Seguro? Las peticiones que salieron de aquí se conservan.
        </span>
      )}
      <Confirmar activo={activo} />
      {activo && (
        <button type="button" onClick={() => setConfirmando(false)} className="boton boton-llano">
          No
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
      {pending ? 'Guardando…' : activo ? 'Sí, cancelarla' : 'Reactivar'}
    </button>
  )
}
