'use client'

import { useActionState, useRef, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { agregarSeguimiento, cambiarEstatus, type EstadoAccion } from '../acciones'

export function PanelSeguimiento({
  peticionId,
  estatusActual,
  estatusPosibles,
}: {
  peticionId: string
  estatusActual: string | null
  estatusPosibles: { id: string; descripcion: string }[]
}) {
  return (
    <>
      <section className="panel px-4 py-4">
        <h2 className="mb-3 text-[var(--text-base)] font-semibold">Cambiar estatus</h2>
        <FormaEstatus
          peticionId={peticionId}
          estatusActual={estatusActual}
          estatusPosibles={estatusPosibles}
        />
      </section>

      <section className="panel px-4 py-4">
        <h2 className="mb-3 text-[var(--text-base)] font-semibold">Registrar movimiento</h2>
        <FormaSeguimiento peticionId={peticionId} />
      </section>
    </>
  )
}

function FormaEstatus({
  peticionId,
  estatusActual,
  estatusPosibles,
}: {
  peticionId: string
  estatusActual: string | null
  estatusPosibles: { id: string; descripcion: string }[]
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarEstatus, {})

  return (
    <form action={accion} className="space-y-2.5">
      <input type="hidden" name="peticionId" value={peticionId} />
      <label>
        <span className="sr-only">Estatus</span>
        <select name="estatusId" defaultValue={estatusActual ?? ''} className="campo">
          <option value="" disabled>
            Selecciona un estatus
          </option>
          {estatusPosibles.map((e) => (
            <option key={e.id} value={e.id}>
              {e.descripcion}
            </option>
          ))}
        </select>
      </label>
      <Aviso estado={estado} exito="Estatus actualizado" />
      <Enviar etiqueta="Actualizar" pendiente="Actualizando…" variante="neutro" />
    </form>
  )
}

function FormaSeguimiento({ peticionId }: { peticionId: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(agregarSeguimiento, {})
  const forma = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado.ok) forma.current?.reset()
  }, [estado])

  return (
    <form ref={forma} action={accion} className="space-y-2.5">
      <input type="hidden" name="peticionId" value={peticionId} />
      <label>
        <span className="sr-only">Tipo de movimiento</span>
        <select name="tipo" defaultValue="nota" className="campo">
          <option value="nota">Nota</option>
          <option value="llamada">Llamada</option>
          <option value="visita">Visita</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Detalle</span>
        <textarea
          name="detalle"
          rows={3}
          required
          placeholder="Qué se hizo, con quién se habló, qué sigue…"
          className="campo !h-auto py-2 resize-y"
        />
      </label>
      <Aviso estado={estado} exito="Movimiento registrado" />
      <Enviar etiqueta="Registrar" pendiente="Guardando…" variante="primario" />
    </form>
  )
}

function Aviso({ estado, exito }: { estado: EstadoAccion; exito: string }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-[var(--text-menuda)] text-[var(--color-alerta)]">
        {estado.error}
      </p>
    )
  }
  if (estado.ok) {
    return (
      <p role="status" className="text-[var(--text-menuda)] text-[var(--color-exito)]">
        {exito}
      </p>
    )
  }
  return null
}

function Enviar({
  etiqueta,
  pendiente,
  variante,
}: {
  etiqueta: string
  pendiente: string
  variante: 'primario' | 'neutro'
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`boton boton-${variante} w-full`}
    >
      {pending ? pendiente : etiqueta}
    </button>
  )
}
