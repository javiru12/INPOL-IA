'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { archivarHilo, marcarLeido, responderHilo, type EstadoAccion } from '../acciones'

/**
 * Marca el hilo como leído al abrirlo.
 *
 * Se hace desde el cliente y no al renderizar porque, además de tocar la
 * base, hay que revalidar el encabezado: el contador de la campana vive
 * en el layout y el router no lo vuelve a pedir por navegar a una
 * pantalla hija. Si no hay nada pendiente, no se llama a nada.
 */
export function MarcarVisto({ hiloId, pendientes }: { hiloId: string; pendientes: boolean }) {
  const hecho = useRef(false)

  useEffect(() => {
    if (!pendientes || hecho.current) return
    hecho.current = true
    void marcarLeido(hiloId)
  }, [hiloId, pendientes])

  return null
}

export function Responder({ hiloId }: { hiloId: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(responderHilo, {})
  const forma = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado.ok) forma.current?.reset()
  }, [estado])

  return (
    <form ref={forma} action={accion} className="space-y-2.5">
      <input type="hidden" name="hiloId" value={hiloId} />
      <label>
        <span className="sr-only">Respuesta</span>
        <textarea
          name="cuerpo"
          rows={4}
          required
          placeholder="Escribe tu respuesta…"
          className="campo !h-auto resize-y py-2"
        />
      </label>

      {estado.error && (
        <p role="alert" className="text-[var(--text-menuda)] text-[var(--color-alerta)]">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="text-[var(--text-menuda)] text-[var(--color-exito)]">
          Respuesta enviada
        </p>
      )}

      <Boton etiqueta="Responder" pendiente="Enviando…" variante="primario" />
    </form>
  )
}

export function ArchivarHilo({ hiloId, archivado }: { hiloId: string; archivado: boolean }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(archivarHilo, {})

  return (
    <form action={accion}>
      <input type="hidden" name="hiloId" value={hiloId} />
      <input type="hidden" name="archivar" value={archivado ? 'no' : 'si'} />
      {estado.error && (
        <p role="alert" className="mb-2 text-[var(--text-menuda)] text-[var(--color-alerta)]">
          {estado.error}
        </p>
      )}
      <Boton
        etiqueta={archivado ? 'Devolver a la bandeja' : 'Archivar conversación'}
        pendiente="Guardando…"
        variante="neutro"
      />
    </form>
  )
}

function Boton({
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
    <button type="submit" disabled={pending} className={`boton boton-${variante} w-full`}>
      {pending ? pendiente : etiqueta}
    </button>
  )
}
