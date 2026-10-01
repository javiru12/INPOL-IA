'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { IconoBuscar, IconoFiltro } from './iconos'

export type Opcion = { valor: string; etiqueta: string; conteo?: number }

/**
 * Barra de filtros. Todo vive en la URL: un filtro aplicado se puede
 * copiar, compartir y volver atrás con el botón del navegador.
 */
export function Filtros({
  busqueda,
  selectores,
}: {
  busqueda?: { nombre: string; marcador: string }
  selectores: {
    nombre: string
    etiqueta: string
    opciones: Opcion[]
    /** Texto de la opción vacía. Por omisión, «<etiqueta>: todas». */
    vacio?: string
  }[]
}) {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const [pendiente, iniciar] = useTransition()

  function fijar(nombre: string, valor: string) {
    const siguientes = new URLSearchParams(params.toString())
    if (valor) siguientes.set(nombre, valor)
    else siguientes.delete(nombre)
    siguientes.delete('pagina')
    iniciar(() => router.push(`${ruta}?${siguientes.toString()}`))
  }

  const activos = selectores.filter((s) => params.get(s.nombre)).length +
    (busqueda && params.get(busqueda.nombre) ? 1 : 0)

  return (
    <div
      className="panel mb-3 flex flex-wrap items-center gap-2 px-3 py-2.5"
      data-pendiente={pendiente || undefined}
      style={{ opacity: pendiente ? 0.6 : 1, transition: 'opacity 120ms' }}
    >
      {busqueda && (
        <label className="relative min-w-[15rem] flex-1">
          <span className="sr-only">{busqueda.marcador}</span>
          <IconoBuscar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-tinta-3)]" />
          <input
            type="search"
            defaultValue={params.get(busqueda.nombre) ?? ''}
            placeholder={busqueda.marcador}
            className="campo !h-8 !pl-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') fijar(busqueda.nombre, e.currentTarget.value.trim())
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v !== (params.get(busqueda.nombre) ?? '')) fijar(busqueda.nombre, v)
            }}
          />
        </label>
      )}

      {selectores.map((s) => (
        <label key={s.nombre} className="shrink-0">
          <span className="sr-only">{s.etiqueta}</span>
          <select
            value={params.get(s.nombre) ?? ''}
            onChange={(e) => fijar(s.nombre, e.target.value)}
            className="campo !h-8 !w-auto pr-7"
          >
            <option value="">{s.vacio ?? `${s.etiqueta}: todas`}</option>
            {s.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
                {o.conteo !== undefined ? ` (${o.conteo})` : ''}
              </option>
            ))}
          </select>
        </label>
      ))}

      {activos > 0 && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push(ruta))}
          className="boton boton-llano !h-8 shrink-0 text-[var(--text-menuda)]"
        >
          <IconoFiltro tamano={13} />
          Limpiar ({activos})
        </button>
      )}
    </div>
  )
}

export function Paginador({
  pagina,
  porPagina,
  total,
}: {
  pagina: number
  porPagina: number
  total: number
}) {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const ultima = Math.max(1, Math.ceil(total / porPagina))

  function ir(n: number) {
    const siguientes = new URLSearchParams(params.toString())
    if (n <= 1) siguientes.delete('pagina')
    else siguientes.set('pagina', String(n))
    router.push(`${ruta}?${siguientes.toString()}`)
  }

  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)

  return (
    <div className="flex items-center justify-between border-t border-[var(--color-borde)] px-4 py-2.5">
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)] tabular-nums">
        {desde.toLocaleString('es-MX')}–{hasta.toLocaleString('es-MX')} de{' '}
        {total.toLocaleString('es-MX')}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={pagina <= 1}
          onClick={() => ir(pagina - 1)}
          className="boton boton-neutro !h-7 text-[var(--text-menuda)]"
        >
          Anterior
        </button>
        <span className="px-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)] tabular-nums">
          {pagina} / {ultima}
        </span>
        <button
          type="button"
          disabled={pagina >= ultima}
          onClick={() => ir(pagina + 1)}
          className="boton boton-neutro !h-7 text-[var(--text-menuda)]"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
