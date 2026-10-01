'use client'

import { useEffect, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { Mapa, type Region } from '@/components/mapa'
import { cifra } from '@/lib/formato'

/**
 * Vista reducida del territorio para el panel de inicio. Entrar y ver de
 * inmediato dónde está la demanda vale más que otra tabla.
 */
export function MapaDelPanel({
  municipios,
}: {
  municipios: { clave: string; nombre: string; peticiones: number }[]
}) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, Region> | null>(null)

  useEffect(() => {
    let vigente = true
    fetch('/geo/nl-municipios.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => vigente && setGeo(j))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  if (!municipios.length) {
    return (
      <p className="py-14 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        Todavía no hay peticiones ubicadas en el territorio.
      </p>
    )
  }

  if (!geo) {
    return (
      <div className="flex h-[260px] items-center justify-center" role="status">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-acento)]" />
      </div>
    )
  }

  const datos = Object.fromEntries(
    municipios.map((m) => [
      m.clave,
      { valor: m.peticiones, detalle: [['Peticiones', cifra(m.peticiones)]] as [string, string][] },
    ]),
  )

  // En el panel el mapa es un resumen: arranca acercado donde hay
  // operación y sin el control de encuadre, que aquí no cabe.
  return (
    <Mapa
      geojson={geo}
      datos={datos}
      unidad="peticiones"
      altura={240}
      enfocadoAlInicio
      controlDeEnfoque={false}
    />
  )
}
