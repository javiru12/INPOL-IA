'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { consultarFolio, type Consulta } from '@/lib/portal'
import { fechaLarga, fechaCorta } from '@/lib/formato'

const EXPLICACION: Record<string, string> = {
  Abierta: 'Lo recibimos y está en la fila para asignarse.',
  'En proceso': 'Ya está asignado y se está trabajando.',
  'En gestión': 'Se turnó a la dependencia que le corresponde.',
  Completada: 'Se atendió y quedó cerrado.',
  Cancelada: 'No procedió. Si no estás de acuerdo, acude al módulo de atención.',
  'No interpretada': 'Necesitamos más información para poder atenderlo.',
}

const TONO: Record<string, string> = {
  Completada: 'var(--color-exito)',
  Cancelada: 'var(--color-tinta-3)',
  'No interpretada': 'var(--color-aviso)',
}

export function FormaSeguimiento({ folioInicial }: { folioInicial: string }) {
  const [estado, accion] = useActionState<Consulta, FormData>(consultarFolio, {})

  return (
    <>
      <form action={accion} className="panel mt-7 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium">
              Folio
            </span>
            <input
              name="folio"
              defaultValue={folioInicial}
              required
              placeholder="MON-A4F8K2"
              autoCapitalize="characters"
              className="campo font-mono uppercase tracking-[0.06em]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium">
              Últimos 4 de tu teléfono
            </span>
            <input
              name="ultimos"
              inputMode="numeric"
              required
              pattern="\d{4}"
              maxLength={4}
              placeholder="5678"
              className="campo font-mono tracking-[0.12em]"
            />
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

        <Consultar />
      </form>

      {estado.resultado && <Resultado datos={estado.resultado} />}
    </>
  )
}

function Resultado({ datos }: { datos: NonNullable<Consulta['resultado']> }) {
  const estatus = datos.estatus ?? 'Abierta'

  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="border-b border-[var(--color-borde)] px-5 py-4">
        <p className="clave">{datos.folio}</p>
        <p
          className="mt-1 text-[var(--text-titulo)] font-semibold"
          style={{ color: TONO[estatus] ?? 'var(--color-acento-fuerte)' }}
        >
          {estatus}
        </p>
        <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {EXPLICACION[estatus] ?? 'En revisión.'}
        </p>
      </div>

      <dl className="divide-y divide-[var(--color-borde)]">
        <Renglon etiqueta="Qué reportaste" valor={datos.descripcion ?? '—'} />
        <Renglon etiqueta="Tipo" valor={datos.problematica ?? '—'} />
        <Renglon etiqueta="Lo recibimos" valor={fechaLarga(datos.fecha)} />
        {datos.cierre && <Renglon etiqueta="Se cerró" valor={fechaLarga(datos.cierre)} />}
      </dl>

      {datos.movimientos.length > 0 && (
        <div className="border-t border-[var(--color-borde)] px-5 py-4">
          <p className="rotulo">Qué ha pasado</p>
          <ol className="mt-3 space-y-2.5">
            {datos.movimientos.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="clave shrink-0 pt-px">{fechaCorta(m.cuando)}</span>
                <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  {m.detalle}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="px-5 py-3">
      <dt className="rotulo">{etiqueta}</dt>
      <dd className="mt-0.5 text-[var(--text-menuda)] leading-relaxed">{valor}</dd>
    </div>
  )
}

function Consultar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario mt-4 w-full">
      {pending ? 'Buscando…' : 'Consultar'}
    </button>
  )
}
