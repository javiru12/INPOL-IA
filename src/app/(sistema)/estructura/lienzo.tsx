'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Geometry } from 'geojson'
import { Mapa, type Region, type DatoRegion } from '@/components/mapa'
import { RAMPA_SECUENCIAL, SIN_DATO } from '@/lib/escalas'
import { colorDeIndice } from '@/lib/paleta'
import { cifra } from '@/lib/formato'
import type { MunicipioCarga, Pinta } from './consultas'

const ARCHIVO = 'nl-municipios.json'

type Props = {
  municipios: MunicipioCarga[]
  pinta: Pinta
  /** Persona elegida: el mapa pasa a mostrar su territorio. */
  persona: { id: string; nombre: string } | null
}

/**
 * El territorio pintado por carga o por responsable.
 *
 * La cartografía se trae en el cliente, como en Mapa territorial: son
 * 51 polígonos y no tiene caso que viajen en el HTML de la página.
 */
export function LienzoEquipo({ municipios, pinta, persona }: Props) {
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

  // Un color por responsable, asignado entre quienes de verdad encabezan
  // alguna zona: así la leyenda no pasa de ocho entradas aunque el equipo
  // sea más grande.
  const colores = useMemo(() => {
    const cuenta = new Map<string, { nombre: string; zonas: number }>()
    for (const m of municipios) {
      if (!m.principal_id || !m.principal) continue
      const previo = cuenta.get(m.principal_id)
      cuenta.set(m.principal_id, {
        nombre: m.principal,
        zonas: (previo?.zonas ?? 0) + 1,
      })
    }
    const ordenados = [...cuenta.entries()].sort(
      (a, b) => b[1].zonas - a[1].zonas || a[1].nombre.localeCompare(b[1].nombre, 'es'),
    )
    return ordenados.map(([id, v], i) => ({ id, nombre: v.nombre, zonas: v.zonas, color: colorDeIndice(i) }))
  }, [municipios])

  // Con una sola zona pintada, los cuantiles degeneran: todos los cortes
  // valen lo mismo y la rampa devuelve su tono más claro, que se lee como
  // «sin dato». Ahí el color no ordena nada, así que se fija a mano.
  const unicaZona = municipios.filter((m) => m.peticiones > 0).length === 1

  const datos = useMemo(() => {
    const porPersona = new Map(colores.map((c) => [c.id, c.color]))
    const mapa: Record<string, DatoRegion> = {}

    for (const m of municipios) {
      const detalle: [string, string][] = []

      if (persona) {
        detalle.push(['Suyas en la zona', cifra(m.de_la_persona)])
        detalle.push(['Total de la zona', cifra(m.peticiones)])
        detalle.push(['Personas que atienden', cifra(m.personas)])
      } else if (pinta === 'responsable') {
        detalle.push(['Lleva más', m.principal ?? '—'])
        detalle.push(['Sus peticiones', cifra(m.principal_peticiones)])
        detalle.push(['Personas que atienden', cifra(m.personas)])
        detalle.push(['Peticiones', cifra(m.peticiones)])
      } else {
        detalle.push(['Peticiones', cifra(m.peticiones)])
        detalle.push([`En rezago`, cifra(m.rezagadas)])
        detalle.push(['Personas que atienden', cifra(m.personas)])
        detalle.push(['Lleva más', m.principal ?? '—'])
      }
      detalle.push(['Secciones', cifra(m.secciones)])

      const valor =
        persona
          ? m.abiertas_persona
          : pinta === 'responsable'
            ? m.participacion
            : m.abiertas

      mapa[m.clave] = {
        valor,
        detalle,
        color:
          !persona && pinta === 'responsable'
            ? (m.principal_id ? porPersona.get(m.principal_id) : undefined) ?? SIN_DATO
            : unicaZona && m.peticiones > 0
              ? RAMPA_SECUENCIAL[4]
              : undefined,
      }
    }
    return mapa
  }, [municipios, pinta, persona, colores, unicaZona])

  const porResponsable = !persona && pinta === 'responsable'

  const unidad = persona
    ? 'peticiones abiertas suyas'
    : porResponsable
      ? '% de la zona'
      : 'peticiones abiertas'

  const formato = useMemo(
    () =>
      porResponsable
        ? (v: number) => `${Math.round(v)}%`
        : (v: number) => v.toLocaleString('es-MX'),
    [porResponsable],
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
        leyenda={!porResponsable && !unicaZona}
        altura={450}
        enfocadoAlInicio
      />
      {porResponsable && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="rotulo">Lleva más peticiones</span>
          {colores.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-[var(--text-menuda)]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ background: c.color }}
              />
              {c.nombre}
              <span className="tabular-nums text-[var(--color-tinta-3)]">
                {c.zonas === 1 ? '1 municipio' : `${c.zonas} municipios`}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
