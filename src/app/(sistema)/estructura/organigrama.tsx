'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { asignarResponsable, type EstadoAccion } from './acciones'
import type { NodoOrganigrama } from './consultas'

/**
 * El organigrama como árbol.
 *
 * Se dibuja con sangría y líneas, no con cajas enlazadas: un orgchart de
 * cajas se lee bonito con doce personas y deja de caber en la pantalla
 * con cincuenta. Con sangría se recorre igual de rápido y se puede buscar
 * dentro sin perder el sitio.
 */
export function Organigrama({
  nodos,
  responsables,
  /** En su pantalla propia el título ya lo pone la página. */
  sinTitulo,
}: {
  nodos: NodoOrganigrama[]
  responsables: { id: string; nombre: string; perfil: string | null }[]
  sinTitulo?: boolean
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  const hijosDe = useMemo(() => {
    const m = new Map<string | null, NodoOrganigrama[]>()
    for (const n of nodos) {
      const llave = n.responsable_id
      const lista = m.get(llave)
      if (lista) lista.push(n)
      else m.set(llave, [n])
    }
    return m
  }, [nodos])

  // Al buscar se marcan las coincidencias, pero se conservan sus jefes:
  // una persona suelta sin su cadena de mando no dice nada.
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return null
    const porId = new Map(nodos.map((n) => [n.id, n]))
    const dejar = new Set<string>()
    for (const n of nodos) {
      const texto = `${n.nombre} ${n.perfil ?? ''} ${n.correo}`.toLowerCase()
      if (!texto.includes(q)) continue
      dejar.add(n.id)
      let arriba = n.responsable_id
      while (arriba && !dejar.has(arriba)) {
        dejar.add(arriba)
        arriba = porId.get(arriba)?.responsable_id ?? null
      }
    }
    return dejar
  }, [filtro, nodos])

  const raices = hijosDe.get(null) ?? []

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-3">
        <div>
          {!sinTitulo && (
            <h2 className="text-[var(--text-base)] font-semibold">Organigrama</h2>
          )}
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Quién responde ante quién · {nodos.length} personas
          </p>
        </div>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar en el equipo…"
          className="campo !h-8 w-56"
        />
      </div>

      {raices.length === 0 ? (
        <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Nadie tiene responsable asignado todavía.
        </p>
      ) : (
        <ul className="py-1.5">
          {raices.map((r) => (
            <Rama
              key={r.id}
              nodo={r}
              hijosDe={hijosDe}
              visibles={visibles}
              editando={editando}
              setEditando={setEditando}
              responsables={responsables}
              filtro={filtro}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Rama({
  nodo,
  hijosDe,
  visibles,
  editando,
  setEditando,
  responsables,
  filtro,
}: {
  nodo: NodoOrganigrama
  hijosDe: Map<string | null, NodoOrganigrama[]>
  visibles: Set<string> | null
  editando: string | null
  setEditando: (v: string | null) => void
  responsables: { id: string; nombre: string; perfil: string | null }[]
  filtro: string
}) {
  if (visibles && !visibles.has(nodo.id)) return null

  const hijos = hijosDe.get(nodo.id) ?? []
  const coincide =
    filtro.trim() !== '' &&
    `${nodo.nombre} ${nodo.perfil ?? ''} ${nodo.correo}`
      .toLowerCase()
      .includes(filtro.trim().toLowerCase())

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 py-1.5 pr-4 hover:bg-[var(--color-superficie-2)]"
        style={{ paddingLeft: `${16 + nodo.nivel * 22}px` }}
      >
        {nodo.nivel > 0 && (
          <span aria-hidden="true" className="text-[var(--color-tinta-3)]">
            └
          </span>
        )}

        <span
          className="font-medium"
          style={coincide ? { background: 'var(--color-acento-suave)' } : undefined}
        >
          {nodo.nombre}
        </span>

        <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {nodo.perfil ?? 'Sin perfil'}
        </span>

        {nodo.a_cargo > 0 && (
          <span className="clave text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            {nodo.a_cargo} a su cargo
          </span>
        )}

        {nodo.asignadas > 0 && (
          <span className="clave text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            {nodo.asignadas} peticiones
            {nodo.abiertas > 0 && (
              <span style={{ color: 'var(--color-aviso)' }}> · {nodo.abiertas} abiertas</span>
            )}
          </span>
        )}

        <span className="ml-auto shrink-0">
          {editando === nodo.id ? (
            <FormaResponsable
              nodo={nodo}
              responsables={responsables}
              cerrar={() => setEditando(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditando(nodo.id)}
              className="boton boton-llano !h-6 !px-1.5 text-[var(--text-micro)]"
            >
              Cambiar responsable
            </button>
          )}
        </span>
      </div>

      {hijos.length > 0 && (
        <ul>
          {hijos.map((h) => (
            <Rama
              key={h.id}
              nodo={h}
              hijosDe={hijosDe}
              visibles={visibles}
              editando={editando}
              setEditando={setEditando}
              responsables={responsables}
              filtro={filtro}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function FormaResponsable({
  nodo,
  responsables,
  cerrar,
}: {
  nodo: NodoOrganigrama
  responsables: { id: string; nombre: string; perfil: string | null }[]
  cerrar: () => void
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(asignarResponsable, {})

  return (
    <form action={accion} className="flex items-center gap-1.5">
      <input type="hidden" name="usuarioId" value={nodo.id} />
      <select
        name="responsableId"
        defaultValue={nodo.responsable_id ?? ''}
        className="campo !h-6 !w-auto text-[var(--text-micro)]"
      >
        <option value="">Sin responsable (es la cabeza)</option>
        {responsables
          .filter((r) => r.id !== nodo.id)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
              {r.perfil ? ` · ${r.perfil}` : ''}
            </option>
          ))}
      </select>
      <Guardar />
      <button
        type="button"
        onClick={cerrar}
        className="boton boton-llano !h-6 !px-1.5 text-[var(--text-micro)]"
      >
        Cancelar
      </button>
      {estado.error && (
        <span className="text-[var(--text-micro)]" style={{ color: 'var(--color-alerta)' }}>
          {estado.error}
        </span>
      )}
    </form>
  )
}

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="boton boton-primario !h-6 !px-2 text-[var(--text-micro)]"
    >
      {pending ? '…' : 'Guardar'}
    </button>
  )
}
