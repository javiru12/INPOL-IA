'use client'

import { useState } from 'react'

type Dato = { etiqueta: string; valor: number; color?: string }

/**
 * Barras horizontales ordenadas por magnitud.
 * Se prefieren a una dona cuando las etiquetas son largas: el ojo compara
 * longitudes mucho mejor que ángulos, y el nombre se lee completo.
 */
export function BarrasHorizontales({
  datos,
  formato = (n: number) => n.toLocaleString('es-MX'),
  colorUnico,
  participacion = true,
}: {
  datos: Dato[]
  formato?: (n: number) => string
  colorUnico?: string
  /**
   * Muestra qué parte del total representa cada barra. Debe apagarse
   * cuando los valores ya son tasas: el «4% del total» de una serie de
   * porcentajes de participación no significa nada.
   */
  participacion?: boolean
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1)
  const total = datos.reduce((s, d) => s + d.valor, 0)

  return (
    <ul className="space-y-2.5">
      {datos.map((d) => {
        const ancho = (d.valor / maximo) * 100
        const porcentaje = total ? Math.round((d.valor / total) * 100) : 0
        return (
          <li key={d.etiqueta}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[var(--text-menuda)]">{d.etiqueta}</span>
              <span className="cifra shrink-0 text-[var(--text-menuda)] font-medium tabular-nums">
                {formato(d.valor)}
                {participacion && (
                  <span className="ml-1.5 text-[var(--color-tinta-3)]">{porcentaje}%</span>
                )}
              </span>
            </div>
            <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--color-superficie-2)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(ancho, 1.5)}%`,
                  background: colorUnico ?? d.color ?? 'var(--color-acento)',
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Serie temporal en barras verticales. Una sola serie, un solo color:
 * la gráfica responde «cuántas y cuándo», no compara categorías.
 */
export function BarrasTemporales({
  datos,
  altura = 148,
}: {
  datos: Dato[]
  altura?: number
}) {
  const [encima, setEncima] = useState<number | null>(null)
  const maximo = Math.max(...datos.map((d) => d.valor), 1)

  // Escala redondeada hacia arriba para que la cuadrícula caiga en cifras limpias.
  const tope = Math.ceil(maximo / 10) * 10 || 10
  const lineas = [0, 0.5, 1]

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-[18px]">
        {[...lineas].reverse().map((l) => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-right text-[length:var(--text-micro)] tabular-nums text-[var(--color-tinta-3)]">
              {Math.round(tope * l)}
            </span>
            <div className="h-px flex-1 bg-[var(--color-borde)]" />
          </div>
        ))}
      </div>

      <div className="relative flex items-end gap-2 pl-9" style={{ height: altura }}>
        {datos.map((d, i) => {
          const alto = (d.valor / tope) * (altura - 22)
          const activo = encima === i
          return (
            <div
              key={d.etiqueta}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: altura }}
              onMouseEnter={() => setEncima(i)}
              onMouseLeave={() => setEncima(null)}
            >
              {activo && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-barra)] px-2 py-1 text-[length:var(--text-micro)] text-white"
                  style={{ boxShadow: 'var(--shadow-menu)' }}
                >
                  <span className="font-medium">{d.valor.toLocaleString('es-MX')}</span>
                  <span className="ml-1.5 text-white/60">{d.etiqueta}</span>
                </div>
              )}
              <div
                className="w-full max-w-[34px] rounded-t-[4px] transition-colors"
                style={{
                  height: Math.max(alto, d.valor > 0 ? 2 : 0),
                  background: activo ? 'var(--color-acento-fuerte)' : 'var(--color-acento)',
                }}
              />
              <span className="mt-1 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
                {d.etiqueta}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
