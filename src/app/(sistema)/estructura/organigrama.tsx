'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { IconoFlechaAbajo } from '@/components/iconos'
import { asignarResponsable, type EstadoAccion } from './acciones'
import type { NodoOrganigrama } from './consultas'

/**
 * El organigrama como árbol.
 *
 * Se dibuja con sangría y líneas, no con cajas enlazadas: un orgchart de
 * cajas se lee bonito con doce personas y deja de caber en la pantalla
 * con cincuenta. Con sangría se recorre igual de rápido y se puede buscar
 * dentro sin perder el sitio.
 *
 * Cada rama se pliega. Con cincuenta personas en una lista corrida hay
 * que recorrerla entera para entender quién depende de quién; plegada,
 * la cadena de mando se ve de un vistazo y se abre la parte que importa.
 */

/** Iniciales para el disco de la izquierda. */
function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}
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
  const [plegados, setPlegados] = useState<Set<string>>(new Set())
  // Quién está seleccionado. Las acciones salen solo en esa fila: un
  // «Cambiar responsable» repetido cincuenta veces es ruido, y encima
  // invita a tocarlo por accidente.
  const [elegido, setElegido] = useState<string | null>(null)

  function plegar(id: string) {
    setPlegados((antes) => {
      const s = new Set(antes)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

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
  const conGente = nodos.filter((n) => (hijosDe.get(n.id) ?? []).length > 0)
  const todoPlegado = conGente.length > 0 && plegados.size >= conGente.length

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
        <div className="flex items-center gap-2">
          {conGente.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setPlegados(todoPlegado ? new Set() : new Set(conGente.map((n) => n.id)))
              }
              className="boton boton-llano !h-8 text-[var(--text-menuda)]"
            >
              {todoPlegado ? 'Desplegar todo' : 'Plegar todo'}
            </button>
          )}
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar en el equipo…"
            className="campo !h-8 w-56"
          />
        </div>
      </div>

      {raices.length === 0 ? (
        <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Nadie tiene responsable asignado todavía.
        </p>
      ) : (
        <ul className="py-1.5 pl-2">
          {raices.map((r) => (
            <Rama
              key={r.id}
              nodo={r}
              raiz
              hijosDe={hijosDe}
              visibles={visibles}
              editando={editando}
              setEditando={setEditando}
              responsables={responsables}
              filtro={filtro}
              plegados={plegados}
              plegar={plegar}
              elegido={elegido}
              setElegido={setElegido}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Rama({
  nodo,
  raiz,
  hijosDe,
  visibles,
  editando,
  setEditando,
  responsables,
  filtro,
  plegados,
  plegar,
  elegido,
  setElegido,
}: {
  nodo: NodoOrganigrama
  raiz?: boolean
  hijosDe: Map<string | null, NodoOrganigrama[]>
  visibles: Set<string> | null
  editando: string | null
  setEditando: (v: string | null) => void
  responsables: { id: string; nombre: string; perfil: string | null }[]
  filtro: string
  plegados: Set<string>
  plegar: (id: string) => void
  elegido: string | null
  setElegido: (v: string | null) => void
}) {
  if (visibles && !visibles.has(nodo.id)) return null

  const hijos = hijosDe.get(nodo.id) ?? []
  // Buscando no se pliega nada: esconder una coincidencia detrás de un
  // triángulo es justo lo contrario de buscar.
  const plegado = !visibles && plegados.has(nodo.id)
  const coincide =
    filtro.trim() !== '' &&
    `${nodo.nombre} ${nodo.perfil ?? ''} ${nodo.correo}`
      .toLowerCase()
      .includes(filtro.trim().toLowerCase())
  const abierto = elegido === nodo.id || editando === nodo.id
  const mando = hijos.length > 0

  return (
    <li className="relative">
      <div
        onClick={() => setElegido(elegido === nodo.id ? null : nodo.id)}
        className={`group relative flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] py-1.5 pr-3 transition-colors ${
          raiz ? 'pl-1' : 'pl-5'
        } ${abierto ? 'bg-[var(--color-acento-suave)]' : 'hover:bg-[var(--color-superficie-2)]'}`}
      >
        {/* Codo que une esta persona con la línea de su jefe. */}
        {!raiz && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-px w-3.5 bg-[var(--color-borde)]"
          />
        )}

        {mando ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              plegar(nodo.id)
            }}
            aria-label={plegado ? `Desplegar el equipo de ${nodo.nombre}` : `Plegar el equipo de ${nodo.nombre}`}
            aria-expanded={!plegado}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[var(--color-tinta-3)] transition-colors hover:bg-[var(--color-borde)] hover:text-[var(--color-tinta)]"
          >
            <IconoFlechaAbajo
              tamano={12}
              className={`transition-transform duration-150 ${plegado ? '-rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        <span
          aria-hidden="true"
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[length:var(--text-micro)] font-semibold ${
            mando
              ? 'bg-[var(--color-acento)] text-white'
              : 'bg-[var(--color-superficie-2)] text-[var(--color-tinta-2)] ring-1 ring-[var(--color-borde)]'
          }`}
        >
          {iniciales(nodo.nombre)}
        </span>

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

        {plegado && hijos.length > 0 && (
          <span className="clave text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            +{hijos.length} plegad{hijos.length === 1 ? 'a' : 'as'}
          </span>
        )}

        <span className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
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
              className={`boton boton-llano !h-6 !px-1.5 text-[var(--text-micro)] transition-opacity ${
                abierto ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              }`}
            >
              Cambiar responsable
            </button>
          )}
        </span>
      </div>

      {hijos.length > 0 && !plegado && (
        <ul className="ml-[22px] border-l border-[var(--color-borde)]">
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
              plegados={plegados}
              plegar={plegar}
              elegido={elegido}
              setElegido={setElegido}
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
