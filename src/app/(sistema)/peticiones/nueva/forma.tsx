'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { crearPeticion, buscarCiudadanos, type EstadoAccion } from '../acciones'
import { IconoBuscar, IconoMas } from '@/components/iconos'

type Ciudadano = { id: string; nombre: string; colonia: string | null; telefono: string | null }

export function FormaPeticion({
  problematicas,
  subproblematicas,
  prioridades,
  fuentes,
  dependencias,
}: {
  problematicas: { id: string; titulo: string }[]
  subproblematicas: { id: string; titulo: string; problematica_id: string }[]
  prioridades: { id: string; descripcion: string }[]
  fuentes: { id: string; descripcion: string }[]
  dependencias: { id: string; descripcion: string }[]
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(crearPeticion, {})
  const [problematica, setProblematica] = useState('')
  const [elegido, setElegido] = useState<Ciudadano | null>(null)
  const [altaNueva, setAltaNueva] = useState(false)

  const sub = subproblematicas.filter((s) => s.problematica_id === problematica)

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-[1fr_1fr] lg:items-start">
      <section className="panel px-4 py-4">
        <h2 className="mb-1 text-[var(--text-base)] font-semibold">Ciudadano</h2>
        <p className="mb-4 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Búscalo primero: si ya está registrado, su historial queda ligado a esta petición.
        </p>

        {elegido ? (
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-acento-suave)] px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{elegido.nombre}</p>
              <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                {[elegido.colonia, elegido.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setElegido(null)}
              className="boton boton-llano !h-7 shrink-0 text-[var(--text-menuda)]"
            >
              Cambiar
            </button>
            <input type="hidden" name="ciudadanoId" value={elegido.id} />
          </div>
        ) : altaNueva ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo nombre="nombre" etiqueta="Nombre(s)" requerido />
              <Campo nombre="apellidoPaterno" etiqueta="Apellido paterno" />
              <Campo nombre="apellidoMaterno" etiqueta="Apellido materno" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo nombre="telefono" etiqueta="Teléfono móvil" tipo="tel" />
              <Campo nombre="colonia" etiqueta="Colonia" />
            </div>
            <button
              type="button"
              onClick={() => setAltaNueva(false)}
              className="boton boton-llano !h-7 text-[var(--text-menuda)]"
            >
              Volver a buscar
            </button>
          </div>
        ) : (
          <Buscador onElegir={setElegido} onAltaNueva={() => setAltaNueva(true)} />
        )}
      </section>

      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">La petición</h2>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selector
              nombre="problematicaId"
              etiqueta="Problemática"
              requerido
              valor={problematica}
              onChange={setProblematica}
              opciones={problematicas.map((p) => ({ valor: p.id, texto: p.titulo }))}
            />
            <Selector
              nombre="subproblematicaId"
              etiqueta="Sub-problemática"
              deshabilitado={!problematica}
              opciones={sub.map((s) => ({ valor: s.id, texto: s.titulo }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Selector
              nombre="prioridadId"
              etiqueta="Prioridad"
              requerido
              opciones={prioridades.map((p) => ({ valor: p.id, texto: p.descripcion }))}
            />
            <Selector
              nombre="fuenteId"
              etiqueta="Fuente"
              opciones={fuentes.map((f) => ({ valor: f.id, texto: f.descripcion }))}
            />
          </div>

          <Selector
            nombre="dependenciaId"
            etiqueta="Dependencia responsable"
            opciones={dependencias.map((d) => ({ valor: d.id, texto: d.descripcion }))}
          />

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Descripción <span className="text-[var(--color-alerta)]">*</span>
            </span>
            <textarea
              name="descripcion"
              rows={4}
              required
              placeholder="Qué pide la persona, dónde y desde cuándo. Entre más concreto, más fácil de gestionar."
              className="campo !h-auto resize-y py-2"
            />
          </label>
        </div>

        {estado.error && (
          <p
            role="alert"
            className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-alerta)]"
          >
            {estado.error}
          </p>
        )}

        <Guardar />
      </section>
    </form>
  )
}

function Buscador({
  onElegir,
  onAltaNueva,
}: {
  onElegir: (c: Ciudadano) => void
  onAltaNueva: () => void
}) {
  const [resultados, setResultados] = useState<Ciudadano[]>([])
  const [buscado, setBuscado] = useState(false)
  const [buscando, iniciar] = useTransition()

  function buscar(termino: string) {
    if (termino.trim().length < 2) {
      setResultados([])
      setBuscado(false)
      return
    }
    iniciar(async () => {
      setResultados(await buscarCiudadanos(termino))
      setBuscado(true)
    })
  }

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Buscar ciudadano</span>
        <IconoBuscar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-tinta-3)]" />
        <input
          type="search"
          placeholder="Nombre o teléfono…"
          className="campo !pl-8"
          onChange={(e) => buscar(e.currentTarget.value)}
        />
      </label>

      {buscando && (
        <p className="mt-3 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">Buscando…</p>
      )}

      {!buscando && resultados.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--color-borde)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onElegir(c)}
                className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--color-acento-suave)]"
              >
                <span className="block font-medium">{c.nombre}</span>
                <span className="block text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  {[c.colonia, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!buscando && buscado && resultados.length === 0 && (
        <p className="mt-3 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Nadie coincide con esa búsqueda.
        </p>
      )}

      <button type="button" onClick={onAltaNueva} className="boton boton-neutro mt-3 w-full">
        <IconoMas tamano={14} />
        Es la primera vez que lo atendemos
      </button>
    </div>
  )
}

function Campo({
  nombre,
  etiqueta,
  tipo = 'text',
  requerido,
}: {
  nombre: string
  etiqueta: string
  tipo?: string
  requerido?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta} {requerido && <span className="text-[var(--color-alerta)]">*</span>}
      </span>
      <input type={tipo} name={nombre} required={requerido} className="campo" />
    </label>
  )
}

function Selector({
  nombre,
  etiqueta,
  opciones,
  requerido,
  deshabilitado,
  valor,
  onChange,
}: {
  nombre: string
  etiqueta: string
  opciones: { valor: string; texto: string }[]
  requerido?: boolean
  deshabilitado?: boolean
  valor?: string
  onChange?: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta} {requerido && <span className="text-[var(--color-alerta)]">*</span>}
      </span>
      <select
        name={nombre}
        required={requerido}
        disabled={deshabilitado}
        value={onChange ? valor : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        defaultValue={onChange ? undefined : ''}
        className="campo"
      >
        <option value="">{deshabilitado ? 'Elige primero la problemática' : 'Selecciona…'}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario mt-4 w-full">
      {pending ? 'Guardando…' : 'Registrar petición'}
    </button>
  )
}
