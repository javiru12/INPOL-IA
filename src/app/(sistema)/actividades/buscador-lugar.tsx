'use client'

import { useState, useTransition } from 'react'
import { buscarDireccion, seccionCercana, type Candidato } from './ubicacion'

/**
 * Busca una dirección y llena los campos de «Dónde».
 *
 * Capturar a mano la calle, la colonia, el código postal, el municipio y
 * la sección electoral son cinco oportunidades de equivocarse, y la que
 * más se queda vacía es la sección: sin ella la actividad no cuenta en
 * ningún análisis por distrito.
 */
export function BuscadorDeLugar({
  municipios,
  alElegir,
}: {
  municipios: { id: string; nombre: string }[]
  alElegir: (datos: {
    lugar: string
    calle: string | null
    colonia: string | null
    codigoPostal: string | null
    municipioId: string | null
    seccion: string | null
  }) => void
}) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<Candidato[] | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [buscando, iniciar] = useTransition()

  function buscar() {
    if (texto.trim().length < 4) return
    iniciar(async () => {
      const r = await buscarDireccion(texto)
      setOpciones(r)
      setNota(r.length === 0 ? 'No encontré esa dirección. Prueba con la calle y el municipio.' : null)
    })
  }

  function elegir(c: Candidato) {
    iniciar(async () => {
      const s = await seccionCercana(c.lat, c.lon)
      const municipio =
        municipios.find(
          (m) =>
            c.municipio &&
            m.nombre.localeCompare(c.municipio, 'es', { sensitivity: 'base' }) === 0,
        ) ??
        municipios.find(
          (m) => s?.municipio && m.nombre.localeCompare(s.municipio, 'es', { sensitivity: 'base' }) === 0,
        )

      alElegir({
        lugar: c.etiqueta.split(',').slice(0, 2).join(',').trim(),
        calle: c.calle,
        colonia: c.colonia,
        codigoPostal: c.codigoPostal,
        municipioId: municipio?.id ?? null,
        seccion: s?.clave ?? null,
      })

      setOpciones(null)
      setTexto('')
      setNota(
        s
          ? `Sección ${s.clave} sugerida, a ${s.aKm} km del centro de esa sección. ` +
            'Revísala si el domicilio queda en un límite.'
          : 'No pude deducir la sección electoral; captúrala a mano.',
      )
    })
  }

  return (
    <div className="mb-3">
      <label className="block">
        <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
          Buscar la dirección en el mapa
        </span>
        <span className="flex gap-2">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Sin esto, Enter manda el formulario entero a medio llenar.
                e.preventDefault()
                buscar()
              }
            }}
            placeholder="Calle y número, colonia, municipio…"
            className="campo min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={buscar}
            disabled={buscando || texto.trim().length < 4}
            className="boton boton-neutro shrink-0"
          >
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </span>
      </label>

      {opciones && opciones.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)]">
          {opciones.map((c, i) => (
            <li key={`${c.lat}-${c.lon}-${i}`}>
              <button
                type="button"
                onClick={() => elegir(c)}
                className="block w-full px-3 py-2 text-left text-[var(--text-menuda)] hover:bg-[var(--color-acento-suave)]"
              >
                {c.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}

      {nota && (
        <p className="mt-1.5 text-[var(--text-micro)] text-[var(--color-tinta-3)]">{nota}</p>
      )}
    </div>
  )
}
