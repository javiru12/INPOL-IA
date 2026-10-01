'use client'

import { useEffect, useRef, useState } from 'react'
import { mesCorto } from '@/lib/formato'

/* ============================================================
   Formas que la pantalla de estadísticas necesita y que no
   estaban: una línea temporal, un diagrama de rango por
   categoría y un embudo.

   Reglas que se respetan aquí y conviene no romper al editarlas:
   un solo eje vertical por gráfica (nunca dos escalas), leyenda
   en cuanto hay dos series, etiqueta directa en el extremo, y el
   color lo pone quien llama —desde `paleta.ts` o `escalas.ts`—,
   nunca se escribe un color literal en este archivo.
   ============================================================ */

const ANCHO_POR_DEFECTO = 760

/** Las props cruzan a cliente, así que el formato va como número de
 *  decimales y no como función: una función no es serializable. */
function enEspanol(n: number, decimales = 0) {
  return n.toLocaleString('es-MX', { maximumFractionDigits: decimales })
}

/** En columna el decimal va fijo, para que los dígitos caigan alineados. */
function enColumna(n: number, decimales = 0) {
  return n.toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/** Mide el ancho real del contenedor. El SVG se dibuja en píxeles
 *  reales para que el trazo y el texto no se deformen al escalar. */
function useAncho(inicial = ANCHO_POR_DEFECTO) {
  const ref = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(inicial)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    const observador = new ResizeObserver(([entrada]) => {
      const w = Math.round(entrada.contentRect.width)
      if (w > 0) setAncho(w)
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return [ref, ancho] as const
}

/**
 * Escala con marcas en cifras redondas (1 · 2 · 5 · 10 y sus múltiplos).
 *
 * Se toma el paso más chico que quepa en el número de tramos permitido,
 * no un número fijo de tramos: con tope fijo una serie que llega a 201
 * acabaría con el eje en 300 y un tercio de la gráfica vacío.
 */
function escalaLimpia(maximo: number, tramos = 5) {
  if (!Number.isFinite(maximo) || maximo <= 0) {
    return { tope: tramos, marcas: Array.from({ length: tramos + 1 }, (_, i) => i) }
  }
  const PASOS = [1, 2, 5, 10]
  let magnitud = 10 ** Math.floor(Math.log10(maximo / tramos))
  for (let intento = 0; intento < 12; intento++, magnitud *= 10) {
    for (const base of PASOS) {
      const paso = base * magnitud
      if (Math.ceil(maximo / paso) > tramos) continue
      const tope = Math.ceil(maximo / paso) * paso
      const marcas: number[] = []
      for (let v = 0; v <= tope + paso / 1000; v += paso) marcas.push(Number(v.toPrecision(12)))
      return { tope, marcas }
    }
  }
  return { tope: maximo, marcas: [0, maximo] }
}

export type SerieTemporal = {
  clave: string
  etiqueta: string
  color: string
  valores: (number | null)[]
}

/**
 * Serie(s) de tiempo en línea. Un solo eje vertical: si hay dos medidas
 * de magnitud distinta son dos gráficas, nunca dos escalas aquí.
 */
export function LineasTemporales({
  meses,
  series,
  altura = 200,
  decimales = 0,
  unidad = '',
  mesEnCurso = false,
}: {
  /** Fechas ISO del primer día de cada mes. */
  meses: string[]
  series: SerieTemporal[]
  altura?: number
  /** Decimales de los valores y de las marcas del eje. */
  decimales?: number
  /** Se añade a los valores del tooltip y de la etiqueta directa. */
  unidad?: string
  /** Sombrea el último mes: va a medias y no se compara con los demás. */
  mesEnCurso?: boolean
}) {
  const [ref, ancho] = useAncho()
  const [encima, setEncima] = useState<number | null>(null)

  const n = meses.length
  const M = { izq: 44, der: 58, arr: 14, abj: 36 }
  const anchoTrazo = Math.max(ancho - M.izq - M.der, 40)
  const altoTrazo = altura - M.arr - M.abj

  const valores = series.flatMap((s) => s.valores.filter((v): v is number => v !== null))
  const { tope, marcas } = escalaLimpia(Math.max(...valores, 0))

  const x = (i: number) => M.izq + (n <= 1 ? anchoTrazo / 2 : (i / (n - 1)) * anchoTrazo)
  const y = (v: number) => M.arr + altoTrazo - (v / tope) * altoTrazo
  const paso = n <= 1 ? anchoTrazo : anchoTrazo / (n - 1)

  // Con muchos meses se rotulan uno sí y uno no para que no se encimen.
  // El año se escribe en el primer rótulo y cada vez que cambia entre los
  // rótulos que de verdad se pintan: si enero cae en un mes saltado, el
  // cambio de año se quedaría sin marcar.
  const salto = Math.max(1, Math.ceil(n / 14))
  const rotulados = meses
    .map((mes, i) => ({ mes, i }))
    .filter(({ i }) => i % salto === 0 || i === n - 1)
  const conAno = new Set<number>()
  let anoPrevio: number | null = null
  for (const { mes, i } of rotulados) {
    const ano = Number(mes.slice(0, 4))
    if (ano !== anoPrevio) conAno.add(i)
    anoPrevio = ano
  }

  // Etiqueta directa en el extremo de cada serie, separadas si chocan.
  const extremos = series
    .map((s) => {
      for (let i = s.valores.length - 1; i >= 0; i--) {
        const v = s.valores[i]
        if (v !== null) return { serie: s, i, v }
      }
      return null
    })
    .filter((e): e is { serie: SerieTemporal; i: number; v: number } => e !== null)
    .sort((a, b) => y(a.v) - y(b.v))

  const posiciones = extremos.map((e) => y(e.v))
  for (let i = 1; i < posiciones.length; i++) {
    if (posiciones[i] - posiciones[i - 1] < 13) posiciones[i] = posiciones[i - 1] + 13
  }

  return (
    <div ref={ref} className="relative w-full">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.clave} className="flex items-center gap-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              <span
                aria-hidden="true"
                className="h-[3px] w-4 rounded-full"
                style={{ background: s.color }}
              />
              {s.etiqueta}
            </li>
          ))}
        </ul>
      )}

      <svg
        width={ancho}
        height={altura}
        role="img"
        aria-label={`Serie mensual de ${series.map((s) => s.etiqueta).join(' y ')}`}
        onMouseLeave={() => setEncima(null)}
        onMouseMove={(ev) => {
          const caja = ev.currentTarget.getBoundingClientRect()
          const rel = ev.clientX - caja.left - M.izq
          const i = Math.round(rel / (paso || 1))
          setEncima(i >= 0 && i < n ? i : null)
        }}
      >
        {mesEnCurso && n > 1 && (
          <rect
            x={x(n - 1) - paso / 2}
            y={M.arr}
            width={paso / 2}
            height={altoTrazo}
            fill="var(--color-superficie-2)"
          />
        )}

        {marcas.map((m) => (
          <g key={m}>
            <line
              x1={M.izq}
              x2={M.izq + anchoTrazo}
              y1={y(m)}
              y2={y(m)}
              stroke="var(--color-borde)"
              strokeWidth={1}
            />
            <text
              x={M.izq - 7}
              y={y(m) + 3.5}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-tinta-3)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {enEspanol(m, decimales)}
            </text>
          </g>
        ))}

        {rotulados.map(({ mes, i }) => {
          return (
            <g key={mes}>
              <text
                x={x(i)}
                y={altura - M.abj + 15}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-tinta-3)"
              >
                {mesCorto(mes)}
              </text>
              {conAno.has(i) && (
                <text
                  x={x(i)}
                  y={altura - M.abj + 27}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-tinta-3)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {mes.slice(0, 4)}
                </text>
              )}
            </g>
          )
        })}

        {series.map((s) => (
          <path
            key={s.clave}
            d={trazo(s.valores, x, y)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {encima !== null && (
          <line
            x1={x(encima)}
            x2={x(encima)}
            y1={M.arr}
            y2={M.arr + altoTrazo}
            stroke="var(--color-borde-fuerte)"
            strokeWidth={1}
          />
        )}

        {series.map((s) =>
          encima !== null && s.valores[encima] !== null && s.valores[encima] !== undefined ? (
            <circle
              key={`h-${s.clave}`}
              cx={x(encima)}
              cy={y(s.valores[encima] as number)}
              r={4.5}
              fill={s.color}
              stroke="var(--color-superficie)"
              strokeWidth={2}
            />
          ) : null,
        )}

        {extremos.map((e, idx) => (
          <g key={`fin-${e.serie.clave}`}>
            <circle
              cx={x(e.i)}
              cy={y(e.v)}
              r={4.5}
              fill={e.serie.color}
              stroke="var(--color-superficie)"
              strokeWidth={2}
            />
            <text
              x={x(e.i) + 9}
              y={posiciones[idx] + 4}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-tinta-2)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {enEspanol(e.v, decimales)}
              {unidad}
            </text>
          </g>
        ))}
      </svg>

      {encima !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-barra)] px-2 py-1.5 text-[length:var(--text-micro)] text-white"
          style={{
            left: Math.min(Math.max(x(encima) - 60, 0), Math.max(ancho - 130, 0)),
            top: 0,
            boxShadow: 'var(--shadow-menu)',
          }}
        >
          <p className="font-semibold capitalize">
            {mesCorto(meses[encima])} {meses[encima].slice(0, 4)}
          </p>
          {series.map((s) => (
            <p key={s.clave} className="mt-0.5 flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-[3px] w-3 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-white/60">{s.etiqueta}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {s.valores[encima] === null || s.valores[encima] === undefined
                  ? '—'
                  : `${enEspanol(s.valores[encima] as number, decimales)}${unidad}`}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Traza la serie partiendo el camino allí donde no hubo dato. */
function trazo(
  valores: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
) {
  let d = ''
  let abierto = false
  valores.forEach((v, i) => {
    if (v === null || v === undefined) {
      abierto = false
      return
    }
    d += `${abierto ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)} `
    abierto = true
  })
  return d.trim()
}

const ETIQUETA = '11rem'
const VALORES = '7.5rem'
const HUECO = '0.75rem'

export type FilaRango = {
  etiqueta: string
  desde: number
  hasta: number
  pie?: string
}

/**
 * Rango por categoría («dumbbell»). Dos puntos de la misma medida sobre
 * un solo eje: la distancia entre ellos es la pregunta —cuánto se separa
 * el caso típico del caso malo—, y por eso no son dos barras.
 */
export function RangoPorCategoria({
  datos,
  decimales = 0,
  unidad = '',
  etiquetaDesde,
  etiquetaHasta,
  colorDesde,
  colorHasta,
  colorConector,
}: {
  datos: FilaRango[]
  decimales?: number
  unidad?: string
  etiquetaDesde: string
  etiquetaHasta: string
  colorDesde: string
  colorHasta: string
  colorConector: string
}) {
  const { tope, marcas } = escalaLimpia(Math.max(...datos.map((d) => d.hasta), 0))
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / tope) * 100))}%`

  return (
    <div>
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          { etiqueta: etiquetaDesde, color: colorDesde },
          { etiqueta: etiquetaHasta, color: colorHasta },
        ].map((l) => (
          <li
            key={l.etiqueta}
            className="flex items-center gap-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: l.color }}
            />
            {l.etiqueta}
          </li>
        ))}
      </ul>

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0"
          style={{ left: `calc(${ETIQUETA} + ${HUECO})`, right: `calc(${VALORES} + ${HUECO})` }}
        >
          {marcas.map((m) => (
            <span
              key={m}
              className="absolute inset-y-0 w-px bg-[var(--color-borde)]"
              style={{ left: pct(m) }}
            />
          ))}
        </div>

        <ul className="relative">
          {datos.map((d) => (
            <li key={d.etiqueta} className="flex items-center" style={{ gap: HUECO }}>
              <span
                className="shrink-0 truncate py-[7px] text-[var(--text-menuda)]"
                style={{ width: ETIQUETA }}
                title={d.etiqueta}
              >
                {d.etiqueta}
              </span>

              <span className="relative h-[30px] flex-1">
                <span
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                  style={{
                    left: pct(Math.min(d.desde, d.hasta)),
                    width: `calc(${pct(Math.abs(d.hasta - d.desde))})`,
                    background: colorConector,
                  }}
                />
                <span
                  className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: pct(d.desde),
                    background: colorDesde,
                    boxShadow: '0 0 0 2px var(--color-superficie)',
                  }}
                />
                <span
                  className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: pct(d.hasta),
                    background: colorHasta,
                    boxShadow: '0 0 0 2px var(--color-superficie)',
                  }}
                />
              </span>

              <span
                className="shrink-0 text-right text-[var(--text-menuda)] text-[var(--color-tinta-2)]"
                style={{ width: VALORES }}
              >
                <span className="cifra font-semibold text-[var(--color-tinta)]">
                  {enColumna(d.desde, decimales)}
                </span>
                <span className="mx-1 text-[var(--color-tinta-3)]">→</span>
                <span className="cifra font-semibold text-[var(--color-tinta)]">
                  {enColumna(d.hasta, decimales)}
                </span>
                <span className="text-[var(--color-tinta-3)]">{unidad}</span>
                {d.pie && (
                  <span className="block text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
                    {d.pie}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex" style={{ gap: HUECO }}>
        <span className="shrink-0" style={{ width: ETIQUETA }} />
        <span className="relative h-5 flex-1">
          {marcas.map((m) => (
            <span
              key={m}
              className="absolute top-1 -translate-x-1/2 text-[length:var(--text-micro)] tabular-nums text-[var(--color-tinta-3)]"
              style={{ left: pct(m) }}
            >
              {enEspanol(m, decimales)}
            </span>
          ))}
        </span>
        <span className="shrink-0" style={{ width: VALORES }} />
      </div>
    </div>
  )
}

export type EtapaEmbudo = {
  etiqueta: string
  valor: number
  descripcion: string
  color: string
}

/**
 * Embudo de cumplimiento. Las etapas están ordenadas, así que el color
 * es una rampa de un solo tono —más avanzada, más oscura—, no ocho
 * colores de identidad.
 */
export function Embudo({
  etapas,
  fugas,
}: {
  etapas: EtapaEmbudo[]
  fugas: { etiqueta: string; valor: number; descripcion: string }[]
}) {
  const base = etapas[0]?.valor || 1

  return (
    <div>
      <ol className="space-y-3">
        {etapas.map((e, i) => {
          const previa = i === 0 ? null : etapas[i - 1].valor
          const sobrevive = previa ? Math.round((e.valor / previa) * 100) : 100
          const delTotal = Math.round((e.valor / base) * 100)
          return (
            <li key={e.etiqueta}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text-menuda)] font-medium">{e.etiqueta}</span>
                <span className="shrink-0 text-[var(--text-menuda)]">
                  <span className="cifra font-semibold text-[var(--text-base)]">
                    {enEspanol(e.valor)}
                  </span>
                  <span className="ml-1.5 text-[var(--color-tinta-3)]">{delTotal}% del total</span>
                </span>
              </div>
              <div
                className="mt-1 h-[18px] rounded-[var(--radius-xs)]"
                style={{ width: `${Math.max((e.valor / base) * 100, 1)}%`, background: e.color }}
              />
              <p className="mt-1 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
                {e.descripcion}
                {previa !== null && ` · sobrevive el ${sobrevive}% del paso anterior`}
              </p>
            </li>
          )
        })}
      </ol>

      {fugas.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-borde)] pt-3">
          <p className="rotulo">Se quedan en el camino</p>
          <ul className="mt-2 space-y-1.5">
            {fugas.map((f) => (
              <li key={f.etiqueta} className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  {f.etiqueta}
                  <span className="ml-1.5 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
                    {f.descripcion}
                  </span>
                </span>
                <span className="cifra shrink-0 text-[var(--text-menuda)] font-semibold">
                  {enEspanol(f.valor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
