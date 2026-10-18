'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cambiarEstatusEnLote, type EstadoAccion } from './acciones'
import { MAXIMO_EN_LOTE } from './limites'

/**
 * Selección múltiple y cambio de estatus de varias peticiones.
 *
 * Las casillas las pinta el servidor dentro de cada renglón; aquí solo se
 * escucha cuáles están marcadas. Así la tabla sigue llegando armada desde
 * el servidor y esto es únicamente la capa que actúa sobre ella.
 *
 * La barra aparece solo cuando hay algo marcado: una barra de acciones
 * siempre visible y casi siempre inútil es ruido permanente.
 */
export function SeleccionEnLote({
  estatus,
}: {
  estatus: { id: string; descripcion: string }[]
}) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [estado, accion] = useActionState<EstadoAccion & { movidas?: number }, FormData>(
    cambiarEstatusEnLote,
    {},
  )

  // Las casillas viven en el HTML del servidor, así que se escuchan desde
  // la tabla en vez de controlarlas con estado de React.
  useEffect(() => {
    const tabla = document.querySelector('table.tabla')
    if (!tabla) return

    const recontar = () => {
      const marcadas = Array.from(
        tabla.querySelectorAll<HTMLInputElement>('input[data-peticion]:checked'),
      ).map((c) => c.dataset.peticion!)
      setMarcadas(marcadas)

      // La casilla del encabezado refleja si están todas, algunas o ninguna.
      const todas = tabla.querySelectorAll<HTMLInputElement>('input[data-peticion]')
      const cabecera = document.querySelector<HTMLInputElement>('input[data-todas]')
      if (cabecera) {
        cabecera.checked = marcadas.length > 0 && marcadas.length === todas.length
        cabecera.indeterminate = marcadas.length > 0 && marcadas.length < todas.length
      }
    }

    const alCambiar = (e: Event) => {
      const t = e.target as HTMLInputElement
      if (t.dataset.todas !== undefined) {
        for (const c of Array.from(
          tabla.querySelectorAll<HTMLInputElement>('input[data-peticion]'),
        )) {
          c.checked = t.checked
        }
      }
      if (t.dataset.peticion !== undefined || t.dataset.todas !== undefined) recontar()
    }

    document.addEventListener('change', alCambiar)
    recontar()
    return () => document.removeEventListener('change', alCambiar)
  }, [])

  // Al terminar, se desmarca todo: dejar las casillas puestas invita a
  // aplicar un segundo cambio sin querer sobre lo mismo.
  useEffect(() => {
    if (!estado.ok) return
    for (const c of Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-peticion], input[data-todas]'),
    )) {
      c.checked = false
      c.indeterminate = false
    }
    setMarcadas([])
  }, [estado.ok])

  if (marcadas.length === 0) {
    return estado.ok && estado.movidas ? (
      <p
        className="mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
        style={{ background: 'var(--color-exito-suave)', color: 'var(--color-exito)' }}
        role="status"
      >
        Se movieron {estado.movidas} peticiones.
      </p>
    ) : null
  }

  const demasiadas = marcadas.length > MAXIMO_EN_LOTE

  return (
    <form
      action={accion}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2"
      style={{ background: 'var(--color-acento-suave)' }}
    >
      {marcadas.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <span className="font-medium">
        {marcadas.length.toLocaleString('es-MX')} seleccionada
        {marcadas.length === 1 ? '' : 's'}
      </span>

      <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">mover a</span>

      <select name="estatusId" required className="campo !h-8 !w-auto">
        <option value="">Elige un estatus…</option>
        {estatus.map((e) => (
          <option key={e.id} value={e.id}>
            {e.descripcion}
          </option>
        ))}
      </select>

      <Aplicar deshabilitado={demasiadas} />

      {demasiadas && (
        <span className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
          Son más de {MAXIMO_EN_LOTE}: acota con los filtros antes de mover tantas.
        </span>
      )}

      {estado.error && (
        <span className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
          {estado.error}
        </span>
      )}
    </form>
  )
}

function Aplicar({ deshabilitado }: { deshabilitado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || deshabilitado}
      className="boton boton-primario !h-8"
    >
      {pending ? 'Moviendo…' : 'Aplicar'}
    </button>
  )
}
