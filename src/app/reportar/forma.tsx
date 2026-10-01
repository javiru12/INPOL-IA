'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { levantarReporte, type EstadoReporte } from '@/lib/portal'

export function FormaReporte({
  problematicas,
}: {
  problematicas: { id: string; titulo: string }[]
}) {
  const [estado, accion] = useActionState<EstadoReporte, FormData>(levantarReporte, {})

  if (estado.folio) return <Recibido folio={estado.folio} />

  return (
    <form action={accion} className="panel mt-7 px-5 py-5 sm:px-6 sm:py-6">
      <fieldset>
        <legend className="rotulo">1 · Qué está pasando</legend>
        <div className="mt-3 space-y-4">
          <Campo etiqueta="¿De qué se trata?" requerido>
            <select name="problematicaId" required className="campo">
              <option value="">Elige una opción…</option>
              {problematicas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Descríbelo"
            requerido
            ayuda="Entre más claro, más rápido lo podemos atender. Dinos desde cuándo pasa y dónde exactamente."
          >
            <textarea
              name="descripcion"
              rows={4}
              required
              minLength={20}
              maxLength={1500}
              placeholder="Por ejemplo: hay una fuga de agua en el cruce de Morelos y Las Palmas desde hace tres días."
              className="campo !h-auto resize-y py-2"
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="mt-7 border-t border-[var(--color-borde)] pt-6">
        <legend className="rotulo">2 · Dónde</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Colonia" requerido>
            <input name="colonia" required maxLength={120} className="campo" />
          </Campo>
          <Campo etiqueta="Calle o referencia">
            <input
              name="calle"
              maxLength={160}
              placeholder="Entre qué calles, o algo cercano"
              className="campo"
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="mt-7 border-t border-[var(--color-borde)] pt-6">
        <legend className="rotulo">3 · Para avisarte</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Tu nombre" requerido>
            <input name="nombre" required minLength={3} maxLength={120} className="campo" />
          </Campo>
          <Campo etiqueta="Teléfono celular" requerido ayuda="10 dígitos, sin espacios">
            <input
              name="telefono"
              type="tel"
              inputMode="numeric"
              required
              pattern="\d{10}"
              maxLength={10}
              placeholder="8112345678"
              className="campo"
            />
          </Campo>
        </div>
      </fieldset>

      <div className="mt-6 rounded-[var(--radius-sm)] bg-[var(--color-superficie-2)] px-4 py-3.5">
        <label className="flex gap-2.5 text-[var(--text-menuda)] leading-relaxed">
          <input
            type="checkbox"
            name="aviso"
            value="si"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-acento)]"
          />
          <span>
            Acepto que mis datos se usen para atender este reporte y darle seguimiento.{' '}
            <Link href="/aviso-de-privacidad" className="text-[var(--color-acento-fuerte)] underline">
              Leer el aviso de privacidad
            </Link>
          </span>
        </label>
      </div>

      {estado.error && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2.5 text-[var(--text-menuda)] text-[var(--color-alerta)]"
        >
          {estado.error}
        </p>
      )}

      <Enviar />
    </form>
  )
}

function Recibido({ folio }: { folio: string }) {
  return (
    <div className="panel mt-7 px-6 py-8 text-center">
      <div
        aria-hidden="true"
        className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--color-exito-suave)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-exito)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
      </div>

      <h2 className="mt-4 text-[var(--text-titulo)]">Recibimos tu reporte</h2>
      <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        Guarda este folio. Con él y los últimos cuatro dígitos de tu teléfono puedes
        consultar en qué va.
      </p>

      <p className="mx-auto mt-5 w-fit rounded-[var(--radius-md)] border border-[var(--color-acento-borde)] bg-[var(--color-acento-suave)] px-6 py-3 font-mono text-[1.625rem] font-medium tracking-[0.08em] text-[var(--color-acento-fuerte)]">
        {folio}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href={`/seguimiento?folio=${folio}`} className="boton boton-primario">
          Consultar mi reporte
        </Link>
        <Link href="/reportar" className="boton boton-neutro">
          Levantar otro
        </Link>
      </div>
    </div>
  )
}

function Campo({
  etiqueta,
  ayuda,
  requerido,
  children,
}: {
  etiqueta: string
  ayuda?: string
  requerido?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-[var(--color-alerta)]">*</span>}
      </span>
      {children}
      {ayuda && (
        <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {ayuda}
        </span>
      )}
    </label>
  )
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario mt-5 w-full !h-10">
      {pending ? 'Enviando…' : 'Enviar mi reporte'}
    </button>
  )
}
