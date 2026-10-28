'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { IconoBuscar, IconoFiltro } from './iconos'

export type Opcion = { valor: string; etiqueta: string; conteo?: number }

/** Cuántos selectores se quedan a la vista antes de «Más filtros». */
const A_LA_VISTA = 2

/**
 * Barra de filtros. Todo vive en la URL: un filtro aplicado se puede
 * copiar, compartir y volver atrás con el botón del navegador.
 *
 * Seis selectores en fila gastan el ancho de la pantalla para decir
 * seis veces «todas». A la vista quedan el buscador y los dos primeros
 * —que son los que se usan— y el resto se abre bajo demanda. Lo que sí
 * está aplicado nunca se esconde: baja como etiqueta quitable, de modo
 * que se puede ver y deshacer sin abrir nada.
 */
export function Filtros({
  busqueda,
  selectores,
  recortes = [],
}: {
  busqueda?: { nombre: string; marcador: string }
  selectores: {
    nombre: string
    etiqueta: string
    opciones: Opcion[]
    /** Texto de la opción vacía. Por omisión, «<etiqueta>: todas». */
    vacio?: string
  }[]
  /** Recortes que llegan de otra pantalla y no tienen selector propio
      —un mes de la gráfica, un municipio del mapa—. Se enseñan con las
      demás etiquetas para que el total nunca cambie sin explicación. */
  recortes?: { llave: string; texto: string; sinEste: string }[]
}) {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState(false)

  function fijar(nombre: string, valor: string) {
    const siguientes = new URLSearchParams(params.toString())
    if (valor) siguientes.set(nombre, valor)
    else siguientes.delete(nombre)
    siguientes.delete('pagina')
    iniciar(() => router.push(`${ruta}?${siguientes.toString()}`))
  }

  const activos = selectores.filter((s) => params.get(s.nombre)).length +
    (busqueda && params.get(busqueda.nombre) ? 1 : 0)

  const visibles = selectores.slice(0, A_LA_VISTA)
  const guardados = selectores.slice(A_LA_VISTA)
  const guardadosActivos = guardados.filter((s) => params.get(s.nombre)).length

  // Cada filtro puesto, con su nombre en claro para la etiqueta.
  const puestos = selectores
    .map((s) => {
      const v = params.get(s.nombre)
      if (!v) return null
      const siguientes = new URLSearchParams(params.toString())
      siguientes.delete(s.nombre)
      siguientes.delete('pagina')
      const cola = siguientes.toString()
      return {
        llave: s.nombre,
        texto: `${s.etiqueta}: ${s.opciones.find((o) => o.valor === v)?.etiqueta ?? v}`,
        sinEste: cola ? `${ruta}?${cola}` : ruta,
      }
    })
    .filter((x): x is { llave: string; texto: string; sinEste: string } => x !== null)
    .concat(recortes)

  const selector = (s: (typeof selectores)[number]) => (
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
  )

  return (
    <div
      className="panel mb-6"
      data-pendiente={pendiente || undefined}
      style={{ opacity: pendiente ? 0.6 : 1, transition: 'opacity 120ms' }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
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

      {visibles.map(selector)}

      {guardados.length > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="boton boton-neutro !h-8 shrink-0 text-[var(--text-menuda)]"
        >
          <IconoFiltro tamano={13} />
          Más filtros
          {guardadosActivos > 0 && ` (${guardadosActivos})`}
        </button>
      )}

      {activos > 0 && (
        <button
          type="button"
          onClick={() => iniciar(() => router.push(ruta))}
          className="boton boton-llano !h-8 shrink-0 text-[var(--text-menuda)]"
        >
          Limpiar todo
        </button>
      )}
      </div>

      {abierto && guardados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-borde)] px-3 py-2.5">
          {guardados.map(selector)}
        </div>
      )}

      {puestos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-borde)] px-3 py-2.5">
          <span className="rotulo">Viendo solo</span>
          {puestos.map((c) => (
            <Link
              key={c.llave}
              href={c.sinEste}
              className="distintivo gap-1.5 transition-opacity hover:opacity-70"
              style={{ background: 'var(--color-acento-suave)', color: 'var(--color-acento-fuerte)' }}
              title="Quitar este filtro"
            >
              {c.texto}
              <span aria-hidden="true">×</span>
            </Link>
          ))}
        </div>
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
