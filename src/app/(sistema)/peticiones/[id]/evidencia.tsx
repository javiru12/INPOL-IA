'use client'

import { useActionState, useRef, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { subirAdjunto, quitarAdjunto, type EstadoAccion } from '../acciones'
import { fechaHora } from '@/lib/formato'

export type Adjunto = {
  id: string
  clase: 'foto' | 'audio' | 'video' | 'documento'
  momento: 'reporte' | 'evidencia' | 'resultado'
  nombre_original: string
  descripcion: string | null
  autor: string | null
  cuando: string
  bytes: number
}

const MOMENTOS = {
  reporte: 'Así llegó',
  evidencia: 'Durante la gestión',
  resultado: 'Así quedó',
} as const

/**
 * Evidencia de la petición.
 *
 * Se agrupa por momento —cómo llegó el problema y cómo quedó— porque el
 * antes y el después es lo que permite demostrar que algo se atendió. Un
 * montón de fotos sin orden no prueba nada.
 */
export function Evidencia({
  peticionId,
  adjuntos,
}: {
  peticionId: string
  adjuntos: Adjunto[]
}) {
  const [ampliada, setAmpliada] = useState<Adjunto | null>(null)

  const grupos = (['reporte', 'evidencia', 'resultado'] as const)
    .map((m) => ({ momento: m, items: adjuntos.filter((a) => a.momento === m) }))
    .filter((g) => g.items.length > 0)

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-borde)] px-4 py-3">
        <h2 className="text-[var(--text-base)] font-semibold">Evidencia</h2>
        <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {adjuntos.length === 0
            ? 'Sin archivos'
            : `${adjuntos.length} ${adjuntos.length === 1 ? 'archivo' : 'archivos'}`}
        </span>
      </div>

      {grupos.length > 0 && (
        <div className="space-y-5 px-4 py-4">
          {grupos.map((g) => (
            <div key={g.momento}>
              <p className="rotulo mb-2">{MOMENTOS[g.momento]}</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <Pieza
                      peticionId={peticionId}
                      adjunto={a}
                      onAmpliar={() => setAmpliada(a)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-3.5">
        <FormaSubida peticionId={peticionId} />
      </div>

      {ampliada && (
        <Visor peticionId={peticionId} adjunto={ampliada} onCerrar={() => setAmpliada(null)} />
      )}
    </section>
  )
}

function Pieza({
  peticionId,
  adjunto,
  onAmpliar,
}: {
  peticionId: string
  adjunto: Adjunto
  onAmpliar: () => void
}) {
  const fuente = `/peticiones/${peticionId}/adjunto/${adjunto.id}`

  if (adjunto.clase === 'foto') {
    return (
      <button
        type="button"
        onClick={onAmpliar}
        className="group block w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde)]"
        title={adjunto.descripcion ?? adjunto.nombre_original}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fuente}
          alt={adjunto.descripcion ?? 'Evidencia de la petición'}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      </button>
    )
  }

  if (adjunto.clase === 'audio') {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-borde)] p-2">
        <audio controls src={fuente} className="w-full" />
        <p className="mt-1 truncate text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {adjunto.descripcion ?? adjunto.nombre_original}
        </p>
      </div>
    )
  }

  if (adjunto.clase === 'video') {
    return (
      <button
        type="button"
        onClick={onAmpliar}
        className="block w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde)]"
      >
        <video src={fuente} className="aspect-[4/3] w-full bg-black object-cover" />
      </button>
    )
  }

  return (
    <a
      href={fuente}
      target="_blank"
      rel="noreferrer"
      className="flex h-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-borde)] px-3 py-2.5 transition-colors hover:bg-[var(--color-acento-suave)]"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-tinta-3)]">
        <path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13z" />
        <path d="M9.5 2.5V6h3.5" />
      </svg>
      <span className="min-w-0 flex-1 truncate text-[var(--text-menuda)]">
        {adjunto.nombre_original}
      </span>
    </a>
  )
}

function Visor({
  peticionId,
  adjunto,
  onCerrar,
}: {
  peticionId: string
  adjunto: Adjunto
  onCerrar: () => void
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(quitarAdjunto, {})

  useEffect(() => {
    if (estado.ok) onCerrar()
  }, [estado, onCerrar])

  useEffect(() => {
    function escapar(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', escapar)
    return () => window.removeEventListener('keydown', escapar)
  }, [onCerrar])

  const fuente = `/peticiones/${peticionId}/adjunto/${adjunto.id}`

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-tinta)]/85 p-4"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={adjunto.descripcion ?? 'Evidencia'}
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-3 text-white">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {adjunto.descripcion ?? adjunto.nombre_original}
            </p>
            <p className="text-[var(--text-menuda)] text-white/55">
              {MOMENTOS[adjunto.momento]} · {adjunto.autor ?? 'Sistema'} ·{' '}
              {fechaHora(adjunto.cuando)} · {(adjunto.bytes / 1024).toFixed(0)} KB
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={fuente} download className="boton boton-neutro !h-8 text-[var(--text-menuda)]">
              Descargar
            </a>
            <form action={accion}>
              <input type="hidden" name="adjuntoId" value={adjunto.id} />
              <BotonQuitar />
            </form>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="boton boton-neutro !h-8 !w-8 !p-0"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          {adjunto.clase === 'video' ? (
            <video src={fuente} controls autoPlay className="max-h-full max-w-full rounded-[var(--radius-sm)]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fuente}
              alt={adjunto.descripcion ?? 'Evidencia'}
              className="max-h-full max-w-full rounded-[var(--radius-sm)] object-contain"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function FormaSubida({ peticionId }: { peticionId: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(subirAdjunto, {})
  const forma = useRef<HTMLFormElement>(null)
  const [elegido, setElegido] = useState<string | null>(null)

  useEffect(() => {
    if (estado.ok) {
      forma.current?.reset()
      setElegido(null)
    }
  }, [estado])

  return (
    <form ref={forma} action={accion} className="space-y-2.5">
      <input type="hidden" name="peticionId" value={peticionId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="boton boton-neutro !h-8 cursor-pointer text-[var(--text-menuda)]">
          {elegido ? 'Cambiar archivo' : 'Elegir archivo'}
          <input
            type="file"
            name="archivo"
            required
            accept="image/jpeg,image/png,image/webp,image/heic,audio/mpeg,audio/mp4,audio/webm,video/mp4,video/quicktime,application/pdf"
            className="sr-only"
            onChange={(e) => setElegido(e.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>

        <select name="momento" defaultValue="evidencia" className="campo !h-8 !w-auto pr-7">
          <option value="reporte">Así llegó</option>
          <option value="evidencia">Durante la gestión</option>
          <option value="resultado">Así quedó</option>
        </select>

        {elegido && (
          <span className="min-w-0 flex-1 truncate text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {elegido}
          </span>
        )}
      </div>

      {elegido && (
        <input
          name="descripcion"
          maxLength={300}
          placeholder="Qué se ve en el archivo (opcional)"
          className="campo !h-8"
        />
      )}

      {estado.error && (
        <p role="alert" className="text-[var(--text-menuda)] text-[var(--color-alerta)]">
          {estado.error}
        </p>
      )}

      {elegido && <Subir />}

      <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
        Fotos, audio, video o PDF. Hasta 20 MB.
      </p>
    </form>
  )
}

function Subir() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario !h-8 w-full text-[var(--text-menuda)]">
      {pending ? 'Subiendo…' : 'Adjuntar'}
    </button>
  )
}

function BotonQuitar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-peligro !h-8 text-[var(--text-menuda)]">
      {pending ? 'Quitando…' : 'Quitar'}
    </button>
  )
}
