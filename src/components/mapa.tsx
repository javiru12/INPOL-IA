'use client'

import { useMemo, useRef, useState } from 'react'
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { escalaPorCuantiles, RAMPA_SECUENCIAL, SIN_DATO } from '@/lib/escalas'
import { rebobinarParaD3 } from '@/lib/geo'

export type Region = { clave: string; nombre: string }

export type DatoRegion = {
  valor: number | null
  /** Renglones del globo informativo, en orden. */
  detalle?: [string, string][]
  /** Pinta la región con este color en vez de la rampa (p. ej. por partido). */
  color?: string
}

type Props = {
  geojson: FeatureCollection<Geometry, Region>
  datos: Record<string, DatoRegion>
  /** Unidad de la cifra principal, para la leyenda y el globo. */
  unidad: string
  formato?: (v: number) => string
  /** Clave de la región seleccionada, si la hay. */
  activa?: string | null
  onElegir?: (clave: string | null) => void
  /** Oculta la leyenda cuando el color no viene de la rampa. */
  leyenda?: boolean
  altura?: number
  /** Arranca acercado al territorio con operación. */
  enfocadoAlInicio?: boolean
  /** Muestra el botón para alternar el encuadre. */
  controlDeEnfoque?: boolean
}

/**
 * Mapa de intensidad.
 *
 * Proyección cónica conforme de Lambert con los paralelos que usa el INEGI
 * para México (17.5° y 29.5°). Es la proyección oficial de la cartografía
 * nacional: respeta las formas y evita el estiramiento que Mercator produce
 * hacia el norte del país.
 */
export function Mapa({
  geojson,
  datos,
  unidad,
  formato = (v) => v.toLocaleString('es-MX'),
  activa,
  onElegir,
  leyenda = true,
  altura = 420,
  enfocadoAlInicio = false,
  controlDeEnfoque = true,
}: Props) {
  const [encima, setEncima] = useState<string | null>(null)
  const [enfocado, setEnfocado] = useState(enfocadoAlInicio)
  const [puntero, setPuntero] = useState<{ x: number; y: number } | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  const { rutas, escala, vista, vistaEnfocada, valeAcercar } = useMemo(() => {
    const capa = rebobinarParaD3(geojson)

    // Se proyecta sobre un lienzo cuadrado y después se recorta el viewBox
    // al contenido real. Así un territorio alto y estrecho como Nuevo León
    // llena el espacio en lugar de quedar diminuto en el centro.
    const base = 1000
    const proyeccion: GeoProjection = geoConicConformal()
      .parallels([17.5, 29.5])
      .rotate([102, 0])
      .fitSize([base, base], capa)

    const trazo = geoPath(proyeccion)

    function encuadre(rasgos: typeof capa.features) {
      const sub = { ...capa, features: rasgos }
      const [[x0, y0], [x1, y1]] = trazo.bounds(sub)
      const margen = Math.max((x1 - x0) * 0.04, 8)
      return {
        x: x0 - margen,
        y: y0 - margen,
        ancho: x1 - x0 + margen * 2,
        alto: y1 - y0 + margen * 2,
      }
    }

    const conDatos = capa.features.filter((f) => {
      const d = datos[f.properties.clave]
      return d && d.valor !== null && d.valor !== undefined && Number(d.valor) > 0
    })

    // Si el cliente solo opera en una parte del territorio, se le ofrece
    // acercar ahí: ver el estado completo con nueve municipios pintados
    // desperdicia la mitad de la pantalla.
    const valeAcercar =
      conDatos.length > 0 && conDatos.length <= capa.features.length * 0.45

    const vista = encuadre(capa.features)
    const vistaEnfocada = valeAcercar ? encuadre(conDatos) : vista
    const escala = escalaPorCuantiles(Object.values(datos).map((d) => d.valor))

    const rutas = capa.features.map((f: Feature<Geometry, Region>) => ({
      clave: f.properties.clave,
      nombre: f.properties.nombre,
      d: trazo(f) ?? '',
    }))

    return { rutas, escala, vista, vistaEnfocada, valeAcercar }
  }, [geojson, datos])

  const marco = enfocado && valeAcercar ? vistaEnfocada : vista

  // Un territorio vertical necesita más alto; uno horizontal, menos.
  const proporcion = marco.alto / marco.ancho
  const altoDelLienzo = Math.round(
    Math.min(Math.max(altura * Math.min(proporcion, 1.25), altura * 0.7), altura * 1.25),
  )

  const resaltada = encima ?? activa ?? null
  const dato = resaltada ? datos[resaltada] : null
  const nombre = rutas.find((r) => r.clave === resaltada)?.nombre

  return (
    <div ref={contenedor} className="relative">
      <svg
        viewBox={`${marco.x} ${marco.y} ${marco.ancho} ${marco.alto}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height: altoDelLienzo, transition: 'height 200ms' }}
        role="img"
        aria-label={`Mapa de ${unidad} por región`}
        onMouseLeave={() => {
          setEncima(null)
          setPuntero(null)
        }}
      >
        <g>
          {rutas.map((r) => {
            const d = datos[r.clave]
            const relleno = d?.color ?? escala.color(d?.valor ?? null)
            const seleccionada = activa === r.clave
            const sobre = encima === r.clave
            return (
              <path
                key={r.clave}
                d={r.d}
                fill={relleno}
                stroke={sobre || seleccionada ? 'var(--color-tinta)' : '#ffffff'}
                strokeWidth={sobre || seleccionada ? 1.8 : 0.8}
                vectorEffect="non-scaling-stroke"
                className={onElegir ? 'cursor-pointer' : undefined}
                style={{ transition: 'stroke-width 90ms' }}
                onMouseEnter={(e) => {
                  setEncima(r.clave)
                  const caja = contenedor.current?.getBoundingClientRect()
                  if (caja) setPuntero({ x: e.clientX - caja.left, y: e.clientY - caja.top })
                }}
                onMouseMove={(e) => {
                  const caja = contenedor.current?.getBoundingClientRect()
                  if (caja) setPuntero({ x: e.clientX - caja.left, y: e.clientY - caja.top })
                }}
                onClick={() => onElegir?.(activa === r.clave ? null : r.clave)}
              >
                <title>{r.nombre}</title>
              </path>
            )
          })}
        </g>
      </svg>

      {resaltada && puntero && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-[11rem] rounded-[var(--radius-sm)] bg-[var(--color-barra)] px-2.5 py-2 text-white"
          style={{
            left: Math.min(puntero.x + 14, 760),
            top: Math.max(puntero.y - 12, 0),
            boxShadow: 'var(--shadow-menu)',
          }}
        >
          <p className="text-[var(--text-menuda)] font-medium">{nombre}</p>
          <p className="cifra mt-0.5 text-[var(--text-media)] font-semibold tabular-nums">
            {dato?.valor === null || dato?.valor === undefined
              ? 'Sin dato'
              : formato(dato.valor)}
            <span className="ml-1 text-[var(--text-micro)] font-normal text-white/55">
              {unidad}
            </span>
          </p>
          {dato?.detalle?.length ? (
            <dl className="mt-1.5 space-y-0.5 border-t border-white/15 pt-1.5">
              {dato.detalle.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-[var(--text-micro)]">
                  <dt className="text-white/55">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )}

      {valeAcercar && controlDeEnfoque && (
        <button
          type="button"
          onClick={() => setEnfocado((v) => !v)}
          className="boton boton-neutro absolute right-0 top-0 !h-7 text-[var(--text-menuda)]"
        >
          {enfocado ? 'Ver todo el territorio' : 'Acercar donde hay operación'}
        </button>
      )}

      {leyenda && escala.cortes.length > 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <span className="rotulo">{unidad}</span>
          <div className="flex items-center gap-px">
            {RAMPA_SECUENCIAL.map((color, i) => (
              <span
                key={color}
                className="h-2.5 w-7 first:rounded-l-[2px] last:rounded-r-[2px]"
                style={{ background: color }}
                title={
                  i === 0
                    ? `hasta ${formato(escala.cortes[0])}`
                    : i === RAMPA_SECUENCIAL.length - 1
                      ? `más de ${formato(escala.cortes[escala.cortes.length - 1])}`
                      : `${formato(escala.cortes[i - 1])} – ${formato(escala.cortes[i])}`
                }
              />
            ))}
          </div>
          <span className="text-[var(--text-micro)] tabular-nums text-[var(--color-tinta-3)]">
            0 – {formato(escala.maximo)}
          </span>
          <span className="ml-2 flex items-center gap-1.5 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            <span
              className="h-2.5 w-4 rounded-[2px] border border-[var(--color-borde)]"
              style={{ background: SIN_DATO }}
            />
            sin dato
          </span>
        </div>
      )}
    </div>
  )
}
