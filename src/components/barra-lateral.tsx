'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Marca } from './marca'
import { ICONOS } from './iconos'
import type { Grupo } from '@/lib/navegacion'

export function BarraLateral({
  grupos,
  tenant,
}: {
  grupos: Grupo[]
  tenant: { nombre: string; nombre_corto: string | null }
}) {
  const ruta = usePathname()
  const [plegada, setPlegada] = useState(false)

  // La preferencia se recuerda por navegador. Quien trabaja todo el día
  // en tablas la quiere plegada siempre, y volver a plegarla en cada
  // visita convierte una comodidad en una molestia.
  useEffect(() => {
    try {
      setPlegada(localStorage.getItem('inpol_barra_plegada') === '1')
    } catch {
      /* navegación privada: se queda abierta, que es lo seguro */
    }
  }, [])

  function alternar() {
    setPlegada((p) => {
      try {
        localStorage.setItem('inpol_barra_plegada', p ? '0' : '1')
      } catch {
        /* da igual: como mucho no se recuerda */
      }
      return !p
    })
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="relative flex shrink-0 flex-col border-r border-[var(--color-borde)] bg-[var(--color-barra)] text-[var(--color-barra-texto)] transition-[width] duration-200 ease-out"
      style={{ width: plegada ? 60 : 232 }}
    >
      <div
        className={`flex h-[52px] items-center border-b border-[var(--color-borde)] ${
          plegada ? 'justify-center px-0' : 'px-4'
        }`}
      >
        <Marca compacto={plegada} />
      </div>

      {/* El tirador vive en el borde, a la altura del contenido y no
          arriba con la marca: ahí es donde la mano ya está cuando quiere
          más espacio para la tabla. */}
      <button
        type="button"
        onClick={alternar}
        aria-label={plegada ? 'Desplegar el menú' : 'Plegar el menú'}
        title={plegada ? 'Desplegar el menú' : 'Plegar el menú'}
        className="absolute -right-3 top-[70px] z-20 grid h-6 w-6 place-items-center rounded-full border border-[var(--color-acento-borde)] bg-[var(--color-acento-suave)] text-[var(--color-acento-fuerte)] transition-colors hover:border-[var(--color-acento)] hover:bg-[var(--color-acento)] hover:text-white"
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ transform: plegada ? 'rotate(180deg)' : undefined }}
        >
          <path d="M10 3 5 8l5 5" />
        </svg>
      </button>

      <div className={`border-b border-[var(--color-borde)] py-3 ${plegada ? 'hidden' : 'px-4'}`}>
        <p className="rotulo">Cliente</p>
        <p className="mt-0.5 truncate text-[var(--text-base)] font-medium text-[var(--color-tinta)]">
          {tenant.nombre_corto ?? tenant.nombre}
        </p>
      </div>

      <div className={`flex-1 overflow-y-auto py-3 ${plegada ? 'px-2' : 'px-2.5'}`}>
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo ?? i} className={i > 0 ? 'mt-5' : ''}>
            {grupo.titulo &&
              (plegada ? (
                // Plegada, el título del grupo se vuelve una línea: se
                // pierde el nombre pero se conserva la agrupación, que
                // es lo que hace que los iconos no sean una lista suelta.
                <div className="mx-2 mb-1.5 h-px bg-[var(--color-borde)]" aria-hidden="true" />
              ) : (
                <p className="rotulo mb-1.5 px-2">{grupo.titulo}</p>
              ))}
            <ul className="space-y-px">
              {grupo.entradas.map((entrada) => {
                const activo =
                  entrada.ruta === '/' ? ruta === '/' : ruta.startsWith(entrada.ruta)
                const Icono = ICONOS[entrada.icono]
                return (
                  <li key={entrada.ruta}>
                    <Link
                      href={entrada.ruta}
                      aria-current={activo ? 'page' : undefined}
                      // Plegada, el nombre viaja en el `title`: un icono
                      // sin forma de saber qué es obliga a desplegar para
                      // buscar, que es justo lo que se quería evitar.
                      title={plegada ? entrada.etiqueta : undefined}
                      className={`group flex items-center rounded-[var(--radius-sm)] py-[7px] text-[var(--text-base)] transition-colors ${
                        plegada ? 'justify-center px-0' : 'gap-2.5 px-2'
                      } ${
                        activo
                          ? 'bg-[var(--color-barra-2)] font-medium text-[var(--color-barra-activo)]'
                          : 'hover:bg-[var(--color-superficie-2)] hover:text-[var(--color-tinta)]'
                      }`}
                    >
                      <Icono
                        className={`shrink-0 ${activo ? 'text-[var(--color-acento)]' : 'text-[var(--color-tinta-3)] group-hover:text-[var(--color-tinta-2)]'}`}
                      />
                      {!plegada && entrada.etiqueta}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
