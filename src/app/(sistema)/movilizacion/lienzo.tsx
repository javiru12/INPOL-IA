'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { Mapa, type Region, type DatoRegion } from '@/components/mapa'
import { RAMPA_SECUENCIAL } from '@/lib/escalas'
import { cifra } from '@/lib/formato'
import type { MunicipioMovilizacion, Pinta } from './consultas'

const ARCHIVO = 'nl-municipios.json'

/**
 * El territorio de la red, pintado por volumen de promovidos o por qué
 * tan cerca está cada zona de la meta que ahí se comprometió.
 *
 * La cartografía se trae en el cliente, como en Mapa territorial: son 51
 * polígonos y no tiene caso que viajen en el HTML de la página.
 */
export function LienzoMovilizacion({
  municipios,
  pinta,
}: {
  municipios: MunicipioMovilizacion[]
  pinta: Pinta
}) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, Region> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    fetch(`/geo/${ARCHIVO}`)
      .then((r) => {
        if (!r.ok) throw new Error(`No se encontró ${ARCHIVO}`)
        return r.json()
      })
      .then((j) => vigente && setGeo(j))
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [])

  // Con una sola zona pintada los cuantiles degeneran: todos los cortes
  // valen lo mismo y la rampa devuelve su tono más claro, que se lee como
  // «sin dato». Ahí el color no ordena nada, así que se fija a mano.
  const unicaZona = municipios.filter((m) => m.promovidos > 0).length === 1

  const datos = useMemo(() => {
    const mapa: Record<string, DatoRegion> = {}

    for (const m of municipios) {
      const detalle: [string, string][] = [
        ['Movilizadores', cifra(m.movilizadores)],
        ['Meta comprometida', cifra(m.meta)],
        ['Promovidos', cifra(m.promovidos)],
        ['Confirmados', cifra(m.confirmados)],
        ['Avance', m.avance === null ? '—' : `${Math.round(m.avance * 100)}%`],
      ]

      // El avance viaja en fracción (0.84) y el mapa pinta y rotula en
      // puntos porcentuales: se convierte aquí, una sola vez.
      const valor = pinta === 'avance' ? (m.avance === null ? null : m.avance * 100) : m.promovidos

      mapa[m.clave] = {
        valor,
        detalle,
        color: unicaZona && m.promovidos > 0 ? RAMPA_SECUENCIAL[4] : undefined,
      }
    }
    return mapa
  }, [municipios, pinta, unicaZona])

  const unidad = pinta === 'avance' ? '% de la meta' : 'promovidos'

  const formato = useMemo(
    () =>
      pinta === 'avance'
        ? (v: number) => `${Math.round(v)}%`
        : (v: number) => v.toLocaleString('es-MX'),
    [pinta],
  )

  if (error) {
    return (
      <div className="panel flex h-[420px] flex-col items-center justify-center px-6 text-center">
        <p className="font-medium">No se pudo cargar la cartografía</p>
        <p className="mt-1 max-w-sm text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Falta el archivo <span className="clave">{ARCHIVO}</span> en{' '}
          <span className="clave">public/geo/</span>. El resto de la pantalla funciona sin él.
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
        leyenda={!unicaZona}
        altura={450}
        enfocadoAlInicio
      />
    </div>
  )
}
