'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { Mapa, type Region, type DatoRegion } from '@/components/mapa'
import { cifra } from '@/lib/formato'
import type { DistritoPriorizado } from './consultas'

export function LienzoPrioridad({ distritos }: { distritos: DistritoPriorizado[] }) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, Region> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    fetch('/geo/nl-distritos-locales.json')
      .then((r) => {
        if (!r.ok) throw new Error('No se encontró la cartografía de distritos')
        return r.json()
      })
      .then((j) => vigente && setGeo(j))
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [])

  const datos = useMemo(() => {
    const mapa: Record<string, DatoRegion> = {}
    for (const d of distritos) {
      mapa[d.clave] = {
        valor: d.indice,
        detalle: [
          ['Secciones', cifra(d.secciones)],
          ['Padrón', cifra(d.lista_nominal)],
          ['Margen promedio', d.margen === null ? '—' : `${d.margen} pts`],
          ['Sin resolver', cifra(d.sin_resolver)],
          ['Secciones sin movilizador', cifra(d.sin_estructura)],
        ],
      }
    }
    return mapa
  }, [distritos])

  if (error) {
    return (
      <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        {error}
      </p>
    )
  }

  if (!geo) {
    return (
      <div className="flex h-[440px] items-center justify-center">
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Cargando cartografía…
        </p>
      </div>
    )
  }

  return (
    <Mapa
      geojson={geo}
      datos={datos}
      unidad="de prioridad"
      formato={(v) => v.toFixed(1)}
      activa={activa}
      onElegir={setActiva}
      altura={440}
    />
  )
}
