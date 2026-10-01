'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { Mapa, type Region, type DatoRegion } from '@/components/mapa'
import { colorDePartido, nombreDePartido, SIN_DATO } from '@/lib/escalas'
import { cifra } from '@/lib/formato'
import type { FilaRegion, Metrica } from './consultas'

type Props = {
  archivo: string
  regiones: FilaRegion[]
  metrica: Metrica
  unidad: string
}

export function LienzoMapa({ archivo, regiones, metrica, unidad }: Props) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, Region> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setGeo(null)
    setError(null)
    fetch(`/geo/${archivo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`No se encontró ${archivo}`)
        return r.json()
      })
      .then((j) => vigente && setGeo(j))
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [archivo])

  const datos = useMemo(() => {
    const mapa: Record<string, DatoRegion> = {}
    for (const r of regiones) {
      const detalle: [string, string][] = [
        ['Secciones', cifra(r.secciones)],
        ['Lista nominal', cifra(r.lista_nominal)],
      ]

      if (metrica === 'peticiones') {
        detalle.push(['Ciudadanos', cifra(r.ciudadanos)])
      } else if (metrica === 'ganador' || metrica === 'margen') {
        if (r.ganador) {
          detalle.push([nombreDePartido(r.ganador), cifra(r.votos_ganador)])
        }
        if (r.segundo) {
          detalle.push([nombreDePartido(r.segundo), cifra(r.votos_segundo)])
        }
        if (r.margen !== null) detalle.push(['Margen', `${r.margen} pts`])
      } else if (metrica === 'participacion') {
        detalle.push(['Votos emitidos', cifra(r.votos_totales)])
      }

      const valor =
        metrica === 'peticiones' ? r.peticiones
        : metrica === 'margen' ? r.margen
        : metrica === 'participacion' ? r.participacion
        : metrica === 'lista_nominal' ? r.lista_nominal
        : r.votos_ganador

      mapa[r.clave] = {
        valor,
        detalle,
        color: metrica === 'ganador' ? colorDePartido(r.ganador) : undefined,
      }
    }
    return mapa
  }, [regiones, metrica])

  const formato = useMemo(() => {
    if (metrica === 'participacion') return (v: number) => `${v.toFixed(1)}%`
    if (metrica === 'margen') return (v: number) => `${v.toFixed(1)} pts`
    return (v: number) => v.toLocaleString('es-MX')
  }, [metrica])

  if (error) {
    return (
      <div className="panel flex h-[420px] flex-col items-center justify-center px-6 text-center">
        <p className="font-medium">No se pudo cargar la cartografía</p>
        <p className="mt-1 max-w-sm text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Falta el archivo <span className="clave">{archivo}</span> en <span className="clave">public/geo/</span>.
          El resto de la pantalla funciona sin él.
        </p>
      </div>
    )
  }

  if (!geo) {
    return (
      <div
        className="panel flex h-[420px] items-center justify-center"
        role="status"
        aria-label="Cargando mapa"
      >
        <div className="flex items-center gap-2 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--color-acento)]" />
          Cargando cartografía…
        </div>
      </div>
    )
  }

  return (
    <div className="panel px-4 py-3.5">
      <Mapa
        geojson={geo}
        datos={datos}
        unidad={unidad}
        formato={formato}
        activa={activa}
        onElegir={setActiva}
        leyenda={metrica !== 'ganador'}
        altura={430}
      />
      {metrica === 'ganador' && <LeyendaPartidos regiones={regiones} />}
    </div>
  )
}

/** Identidad por color + nombre, nunca por color solo. */
function LeyendaPartidos({ regiones }: { regiones: FilaRegion[] }) {
  const conteo = new Map<string, number>()
  for (const r of regiones) {
    if (!r.ganador) continue
    conteo.set(r.ganador, (conteo.get(r.ganador) ?? 0) + 1)
  }
  const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="rotulo">Ganó en 2015</span>
      {ordenados.map(([partido, n]) => (
        <span key={partido} className="flex items-center gap-1.5 text-[var(--text-menuda)]">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: colorDePartido(partido) }}
          />
          {nombreDePartido(partido)}
          <span className="tabular-nums text-[var(--color-tinta-3)]">{n}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-[2px] border border-[var(--color-borde)]"
          style={{ background: SIN_DATO }}
        />
        sin dato
      </span>
    </div>
  )
}
