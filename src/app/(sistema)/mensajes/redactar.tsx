'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { enviarMensaje, type EstadoAccion } from './acciones'
import { PERFILES } from '@/lib/perfiles'
import type { Companiero, PeticionCorta } from './consultas'

/**
 * Alta de mensaje, al lado de la bandeja y no en otra pantalla: el
 * recado se escribe en diez segundos y mandar a la gente a una página
 * aparte para eso es hacerle perder el hilo.
 */
export function Redactar({
  equipo,
  peticiones,
  peticionId,
}: {
  equipo: Companiero[]
  peticiones: PeticionCorta[]
  peticionId: string | null
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(enviarMensaje, {})
  const forma = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado.ok) forma.current?.reset()
  }, [estado])

  return (
    <section className="panel px-4 py-4">
      <h2 className="mb-3 text-[var(--text-base)] font-semibold">Nuevo mensaje</h2>

      <form ref={forma} action={accion} className="space-y-2.5">
        <label className="block">
          <span className="rotulo">Para</span>
          <select name="destinatarioId" required defaultValue="" className="campo mt-1">
            <option value="" disabled>
              Elige a quién le escribes
            </option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {PERFILES[p.perfil_clave] ?? p.perfil_clave}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Sobre la petición</span>
          <select
            name="peticionId"
            defaultValue={peticionId ?? ''}
            className="campo mt-1"
          >
            <option value="">Ninguna · recado suelto</option>
            {peticiones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.folio} · {p.etiqueta || 'Sin ciudadano'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Asunto</span>
          <input
            name="asunto"
            required
            maxLength={120}
            placeholder="Duda sobre la petición"
            className="campo mt-1"
          />
        </label>

        <label className="block">
          <span className="rotulo">Mensaje</span>
          <textarea
            name="cuerpo"
            rows={4}
            required
            placeholder="Qué necesitas saber o avisar…"
            className="campo mt-1 !h-auto resize-y py-2"
          />
        </label>

        {estado.error && (
          <p role="alert" className="text-[var(--text-menuda)] text-[var(--color-alerta)]">
            {estado.error}
          </p>
        )}

        <Enviar />
      </form>
    </section>
  )
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario w-full">
      {pending ? 'Enviando…' : 'Enviar mensaje'}
    </button>
  )
}
