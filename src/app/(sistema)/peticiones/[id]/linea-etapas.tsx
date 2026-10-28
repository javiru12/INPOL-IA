'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * La ruta que recorre una petición.
 *
 * El historial de abajo dice todo lo que pasó, en orden inverso y con
 * detalle; esto dice otra cosa: en qué parte del camino va y cuánto
 * lleva ahí. Son dos preguntas distintas y la segunda se contestaba
 * leyendo doce renglones y restando fechas a mano.
 *
 * El marcador viaja por la curva de verdad —se mide con
 * `getPointAtLength` sobre el trazo— y no por una interpolación entre
 * dos puntos: así cae siempre encima de la línea, con la curva que sea.
 */

export type Etapa = { nombre: string; fecha: string | null }

const ALTO = 150
const ANCHO = 1000
/** Curva suave: sube un poco al avanzar, como un camino que progresa. */
const TRAZO = 'M 46 74 C 260 74, 300 48, 520 44 S 790 28, 954 24'

export function LineaDeEtapas({
  etapas,
  actual,
  diasEnLaEtapa,
  desviada,
}: {
  etapas: Etapa[]
  /** Índice de la etapa en la que está. -1 si se salió del camino. */
  actual: number
  diasEnLaEtapa: number | null
  /** Cancelada o sin interpretar: no está en la ruta, se salió de ella. */
  desviada?: string | null
}) {
  const trazo = useRef<SVGPathElement>(null)
  const [puntos, setPuntos] = useState<{ x: number; y: number }[]>([])
  const [avance, setAvance] = useState(0)
  const [largo, setLargo] = useState(0)

  useEffect(() => {
    const p = trazo.current
    if (!p) return

    const total = p.getTotalLength()
    setLargo(total)

    const n = Math.max(etapas.length - 1, 1)
    setPuntos(
      etapas.map((_, i) => {
        const { x, y } = p.getPointAtLength((total * i) / n)
        return { x, y }
      }),
    )

    const destino = actual < 0 ? 0 : (total * actual) / n
    // Quien pidió menos movimiento no ve el viaje, ve el resultado.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAvance(destino)
      return
    }

    const arranque = performance.now()
    const duracion = 1100
    let vivo = true
    const paso = (ahora: number) => {
      if (!vivo) return
      const t = Math.min((ahora - arranque) / duracion, 1)
      // Sale rápido y frena al llegar, como algo que se posa.
      const suave = 1 - Math.pow(1 - t, 3)
      setAvance(destino * suave)
      if (t < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
    return () => {
      vivo = false
    }
  }, [etapas, actual])

  const marcador = trazo.current && largo ? trazo.current.getPointAtLength(avance) : null

  return (
    <section className="panel overflow-hidden px-5 py-4">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          actual >= 0
            ? `La petición va en ${etapas[actual]?.nombre}, etapa ${actual + 1} de ${etapas.length}`
            : `La petición salió del camino: ${desviada}`
        }
      >
        {/* El camino completo, tenue: lo que falta por recorrer. */}
        <path
          ref={trazo}
          d={TRAZO}
          fill="none"
          stroke="var(--color-borde)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />

        {/* Lo ya recorrido, sólido y en el acento. */}
        {largo > 0 && (
          <path
            d={TRAZO}
            fill="none"
            stroke="var(--color-acento)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${avance} ${largo}`}
          />
        )}

        {puntos.map((p, i) => {
          const hecha = actual >= 0 && i < actual
          const aqui = i === actual
          return (
            <g key={etapas[i].nombre}>
              <circle
                cx={p.x}
                cy={p.y}
                r={aqui ? 11 : 8}
                fill={hecha || aqui ? 'var(--color-acento)' : 'var(--color-superficie)'}
                stroke={hecha || aqui ? 'var(--color-acento)' : 'var(--color-borde-fuerte)'}
                strokeWidth="2"
              />
              {hecha && (
                <path
                  d={`M ${p.x - 3.4} ${p.y} l 2.4 2.6 l 4.6 -5.2`}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={p.x}
                y={p.y + 30}
                textAnchor="middle"
                className="fill-[var(--color-tinta)] text-[13px] font-medium"
              >
                {etapas[i].nombre}
              </text>
              <text
                x={p.x}
                y={p.y + 47}
                textAnchor="middle"
                className="fill-[var(--color-tinta-3)] text-[12px]"
              >
                {etapas[i].fecha ?? '—'}
              </text>
            </g>
          )
        })}

        {/* El marcador que viaja. Un halo detrás para que se despegue
            de la línea y se vea dónde está sin buscarlo. */}
        {marcador && actual >= 0 && (
          <>
            <circle cx={marcador.x} cy={marcador.y} r="18" fill="var(--color-acento-suave)" />
            <circle
              cx={marcador.x}
              cy={marcador.y}
              r="7"
              fill="var(--color-acento-fuerte)"
              stroke="#fff"
              strokeWidth="2.5"
            />
          </>
        )}
      </svg>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        {actual < 0 ? (
          <>
            <span
              className="distintivo"
              style={{ background: 'var(--color-superficie-2)', color: 'var(--color-tinta-2)' }}
            >
              {desviada}
            </span>
            <span>Esta petición salió del camino normal de atención.</span>
          </>
        ) : (
          <>
            <span
              className="distintivo"
              style={{
                background: 'var(--color-acento-suave)',
                color: 'var(--color-acento-fuerte)',
              }}
            >
              {etapas[actual]?.nombre}
            </span>
            <span>
              {diasEnLaEtapa === null
                ? 'Sin movimientos registrados todavía.'
                : diasEnLaEtapa === 0
                  ? 'Entró a esta etapa hoy.'
                  : `Lleva ${diasEnLaEtapa} ${diasEnLaEtapa === 1 ? 'día' : 'días'} aquí.`}
              {actual < etapas.length - 1 &&
                (etapas.length - 1 - actual === 1
                  ? ' Falta una etapa para cerrar.'
                  : ` Faltan ${etapas.length - 1 - actual} etapas para cerrar.`)}
            </span>
          </>
        )}
      </p>
    </section>
  )
}
