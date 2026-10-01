'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import {
  marcarComoMovilizador,
  asignarPromovido,
  cambiarEstadoProspeccion,
  buscarDisponibles,
  type Candidato,
  type EstadoAccion,
} from './acciones'
import { ESTADOS, ETIQUETA_ESTADO, type EstadoProspeccion } from './consultas'
import { IconoBuscar } from '@/components/iconos'

/**
 * Buscador de personas del padrón que todavía no están en la red.
 * Es el mismo gesto en las dos altas del módulo: marcar movilizador y
 * asignarle gente, así que vive una sola vez.
 */
function BuscadorPadron({
  elegido,
  onElegir,
  marcador,
}: {
  elegido: Candidato | null
  onElegir: (c: Candidato | null) => void
  marcador: string
}) {
  const [resultados, setResultados] = useState<Candidato[]>([])
  const [buscado, setBuscado] = useState(false)
  const [buscando, iniciar] = useTransition()

  function buscar(termino: string) {
    if (termino.trim().length < 2) {
      setResultados([])
      setBuscado(false)
      return
    }
    iniciar(async () => {
      setResultados(await buscarDisponibles(termino))
      setBuscado(true)
    })
  }

  if (elegido) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-acento-suave)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-medium">{elegido.nombre}</p>
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {[elegido.colonia, elegido.seccion && `Sección ${elegido.seccion}`, elegido.telefono]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de contacto'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onElegir(null)}
          className="boton boton-llano !h-7 shrink-0 text-[var(--text-menuda)]"
        >
          Cambiar
        </button>
        <input type="hidden" name="ciudadanoId" value={elegido.id} />
      </div>
    )
  }

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{marcador}</span>
        <IconoBuscar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-tinta-3)]" />
        <input
          type="search"
          placeholder={marcador}
          className="campo !pl-8"
          onChange={(e) => buscar(e.currentTarget.value)}
        />
      </label>

      {buscando && (
        <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">Buscando…</p>
      )}

      {!buscando && resultados.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--color-borde)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onElegir(c)}
                className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--color-acento-suave)]"
              >
                <span className="block font-medium">{c.nombre}</span>
                <span className="block text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  {[c.colonia, c.seccion && `Sección ${c.seccion}`].filter(Boolean).join(' · ') ||
                    'Sin domicilio capturado'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!buscando && buscado && resultados.length === 0 && (
        <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Nadie coincide, o quien buscas ya está en la red de movilización.
        </p>
      )}
    </div>
  )
}

function Guardar({ texto, pendiente }: { texto: string; pendiente: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario w-full">
      {pending ? pendiente : texto}
    </button>
  )
}

function Aviso({ estado }: { estado: EstadoAccion }) {
  if (estado.error) {
    return (
      <p
        role="alert"
        className="rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-alerta)]"
      >
        {estado.error}
      </p>
    )
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p
        role="status"
        className="rounded-[var(--radius-sm)] bg-[var(--color-exito-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-exito)]"
      >
        {estado.mensaje}
      </p>
    )
  }
  return null
}

/** Alta de movilizador: una persona del padrón más una meta. */
export function FormaAltaMovilizador({
  tipos,
  responsables,
}: {
  tipos: { id: string; descripcion: string }[]
  responsables: { valor: string; etiqueta: string }[]
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(marcarComoMovilizador, {})
  const [elegido, setElegido] = useState<Candidato | null>(null)

  return (
    <form action={accion} className="space-y-3 px-4 py-3.5">
      <BuscadorPadron
        elegido={elegido}
        onElegir={setElegido}
        marcador="Busca en el padrón por nombre o teléfono…"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Meta <span className="text-[var(--color-alerta)]">*</span>
          </span>
          <input
            type="number"
            name="meta"
            min={1}
            max={500}
            required
            defaultValue={20}
            className="campo"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Tipo
          </span>
          <select name="tipoId" defaultValue="" className="campo">
            <option value="">Sin clasificar</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descripcion}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Responsable
          </span>
          <select name="responsableId" defaultValue="" className="campo">
            <option value="">Sin asignar</option>
            {responsables.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Aviso estado={estado} />
      <Guardar texto="Dar de alta como movilizador" pendiente="Dando de alta…" />
    </form>
  )
}

/** Asignación de una persona del padrón a un movilizador concreto. */
export function FormaAsignarPromovido({ movilizadorId }: { movilizadorId: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(asignarPromovido, {})
  const [elegido, setElegido] = useState<Candidato | null>(null)

  return (
    <form action={accion} className="space-y-3 px-4 py-3.5">
      <input type="hidden" name="movilizadorId" value={movilizadorId} />
      <BuscadorPadron
        elegido={elegido}
        onElegir={setElegido}
        marcador="Busca a la persona por nombre o teléfono…"
      />
      <Aviso estado={estado} />
      <Guardar texto="Asignar como prospecto" pendiente="Asignando…" />
    </form>
  )
}

/**
 * Selector del embudo, uno por renglón.
 *
 * No usa `useActionState` como los formularios de alta: montar un estado
 * de formulario por cada una de las decenas de filas de la ficha cuesta
 * más de lo que aporta. La Server Action es la misma y valida igual; lo
 * único que cambia es que aquí el FormData se arma a mano.
 */
export function SelectorEstado({
  promovidoId,
  estado,
}: {
  promovidoId: string
  estado: EstadoProspeccion
}) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function cambiar(nuevo: string) {
    setError(null)
    const datos = new FormData()
    datos.set('promovidoId', promovidoId)
    datos.set('estado', nuevo)
    iniciar(async () => {
      const r = await cambiarEstadoProspeccion({}, datos)
      if (r.error) setError(r.error)
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={estado}
        disabled={pendiente}
        onChange={(e) => cambiar(e.target.value)}
        aria-label="Estado de prospección"
        className="campo !h-7 !w-auto !pl-2 pr-6 text-[var(--text-menuda)]"
        style={{ opacity: pendiente ? 0.6 : 1 }}
      >
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {ETIQUETA_ESTADO[e]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-[var(--text-micro)] text-[var(--color-alerta)]">
          {error}
        </span>
      )}
    </span>
  )
}
