'use client'

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

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-[232px] shrink-0 flex-col bg-[var(--color-barra)] text-[var(--color-barra-texto)]"
    >
      <div className="flex h-[52px] items-center border-b border-white/[0.07] px-4">
        <Marca tono="claro" />
      </div>

      <div className="border-b border-white/[0.07] px-4 py-3">
        <p className="rotulo !text-white/35">Cliente</p>
        <p className="mt-0.5 truncate text-[var(--text-base)] font-medium text-white/90">
          {tenant.nombre_corto ?? tenant.nombre}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo ?? i} className={i > 0 ? 'mt-5' : ''}>
            {grupo.titulo && (
              <p className="rotulo mb-1.5 px-2 !text-white/30">{grupo.titulo}</p>
            )}
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
                      className={`group flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-[7px] text-[var(--text-base)] transition-colors ${
                        activo
                          ? 'bg-white/[0.09] font-medium text-[var(--color-barra-activo)]'
                          : 'hover:bg-white/[0.05] hover:text-white/90'
                      }`}
                    >
                      <Icono
                        className={activo ? 'text-white' : 'text-white/45 group-hover:text-white/70'}
                      />
                      {entrada.etiqueta}
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
