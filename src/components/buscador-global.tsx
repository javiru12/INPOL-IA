'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fijarBusquedaMaestra } from '@/app/(sistema)/busqueda-acciones'
import { buscarEnTodo, type Hallazgo } from '@/lib/busqueda'
import { IconoBuscar, IconoCiudadanos, IconoPeticiones, IconoMapa, IconoEstructura } from './iconos'

const ICONO = {
  ciudadano: IconoCiudadanos,
  peticion: IconoPeticiones,
  seccion: IconoMapa,
  colonia: IconoEstructura,
} as const

const ETIQUETA = {
  ciudadano: 'Ciudadano',
  peticion: 'Petición',
  seccion: 'Sección',
  colonia: 'Colonia',
} as const

/**
 * Búsqueda transversal con atajo de teclado. Quien usa esto todo el día
 * no quiere navegar hasta un listado y filtrar: quiere escribir un nombre
 * y llegar.
 */
export function BuscadorGlobal() {
  const [abierto, setAbierto] = useState(false)
  const [termino, setTermino] = useState('')
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [elegido, setElegido] = useState(0)
  const [buscando, iniciar] = useTransition()
  // Qué término produjo los resultados que tenemos en la mano. Durante
  // los 160 ms de espera `buscando` todavía es falso y la lista sigue
  // vacía, así que la pantalla alcanzaba a decir «nada coincide» antes
  // de haber buscado nada.
  const [resuelto, setResuelto] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    function atajo(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierto((v) => !v)
      }
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', atajo)
    return () => window.removeEventListener('keydown', atajo)
  }, [])

  useEffect(() => {
    if (abierto) {
      // El autofocus no basta: el diálogo se monta después del evento.
      requestAnimationFrame(() => campo.current?.focus())
    } else {
      setTermino('')
      setHallazgos([])
      setElegido(0)
    }
  }, [abierto])

  useEffect(() => {
    const t = termino.trim()
    if (t.length < 2) {
      setHallazgos([])
      setResuelto(t)
      return
    }
    const id = setTimeout(() => {
      iniciar(async () => {
        setHallazgos(await buscarEnTodo(termino))
        setResuelto(t)
        setElegido(0)
      })
    }, 160)
    return () => clearTimeout(id)
  }, [termino])

  const enCurso = buscando || resuelto !== termino.trim()

  function ir(h: Hallazgo) {
    setAbierto(false)
    router.push(h.ruta)
  }

  // Saltar a un resultado y acotar todo el sistema son dos cosas
  // distintas: la primera sirve cuando ya se sabe a quién se busca, la
  // segunda cuando se quiere ver todo lo que haya de alguien.
  function filtrarTodo() {
    const t = termino.trim()
    if (t.length < 2) return
    setAbierto(false)
    iniciar(async () => {
      await fijarBusquedaMaestra(t)
      router.push('/peticiones')
      router.refresh()
    })
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setElegido((i) => Math.min(i + 1, hallazgos.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setElegido((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && hallazgos[elegido]) {
      e.preventDefault()
      ir(hallazgos[elegido])
    } else if (e.key === 'Enter' && termino.trim().length >= 2) {
      // Sin resultados concretos, Enter acota el sistema entero: es lo
      // único útil que queda por hacer con lo escrito.
      e.preventDefault()
      filtrarTodo()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="campo !h-8 hidden w-full max-w-[26rem] items-center gap-2 bg-[var(--color-superficie-2)] text-left text-[var(--color-tinta-3)] md:flex"
      >
        <IconoBuscar />
        <span className="flex-1 truncate">Buscar ciudadano, petición o sección…</span>
        <kbd className="rounded-[3px] border border-[var(--color-borde-fuerte)] px-1.5 py-px font-mono text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
          ⌘K
        </kbd>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-tinta)]/35 px-4 pt-[14vh]"
          onClick={() => setAbierto(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda"
            className="w-full max-w-xl overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-superficie)]"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--color-borde)] px-4">
              <IconoBuscar className="shrink-0 text-[var(--color-tinta-3)]" tamano={17} />
              <input
                ref={campo}
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                onKeyDown={teclas}
                placeholder="Nombre, teléfono, folio, colonia o número de sección…"
                className="h-12 flex-1 bg-transparent text-[var(--text-media)] outline-none placeholder:text-[var(--color-tinta-3)]"
              />
              {enCurso && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-acento)]"
                />
              )}
            </div>

            {termino.trim().length >= 2 && (
              <button
                type="button"
                onClick={filtrarTodo}
                className="flex w-full items-center gap-2.5 border-b border-[var(--color-borde)] px-4 py-2.5 text-left hover:bg-[var(--color-acento-suave)]"
              >
                <IconoBuscar className="shrink-0 text-[var(--color-acento-fuerte)]" tamano={15} />
                <span className="text-[var(--text-menuda)]">
                  Filtrar todo el sistema por{' '}
                  <strong className="font-semibold">«{termino.trim()}»</strong>
                </span>
                <span className="ml-auto text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                  se queda puesto
                </span>
              </button>
            )}

            {hallazgos.length > 0 ? (
              <ul className="max-h-[22rem] overflow-y-auto py-1.5">
                {hallazgos.map((h, i) => {
                  const Icono = ICONO[h.tipo]
                  return (
                    <li key={`${h.tipo}-${h.id}`}>
                      <button
                        type="button"
                        onClick={() => ir(h)}
                        onMouseEnter={() => setElegido(i)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                          i === elegido ? 'bg-[var(--color-acento-suave)]' : ''
                        }`}
                      >
                        <Icono className="shrink-0 text-[var(--color-tinta-3)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[var(--text-base)]">{h.titulo}</span>
                          {h.apoyo && (
                            <span className="block truncate text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                              {h.apoyo}
                            </span>
                          )}
                        </span>
                        <span className="rotulo shrink-0">{ETIQUETA[h.tipo]}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                {termino.trim().length < 2
                  ? 'Escribe al menos dos letras.'
                  : enCurso
                    ? 'Buscando…'
                    : 'Nada coincide con esa búsqueda.'}
              </p>
            )}

            <div className="flex items-center gap-4 border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-2 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
              <span>↑↓ moverse</span>
              <span>↵ abrir</span>
              <span>esc cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
