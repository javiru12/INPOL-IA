'use server'

import { conTenant, sinTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'

/**
 * Busca una dirección y la traduce a los campos del formulario.
 *
 * Se usa Nominatim, el buscador de OpenStreetMap: no cobra ni pide
 * tarjeta. Google Maps acierta más con números exteriores en México,
 * así que si algún día se paga por él solo cambia esta función —la
 * pantalla no se entera.
 *
 * La llamada va por el servidor y no por el navegador para poder mandar
 * el User-Agent que su política de uso exige, y para que la dirección
 * del servicio no quede expuesta en el cliente.
 */

export type Candidato = {
  etiqueta: string
  lat: number
  lon: number
  calle: string | null
  colonia: string | null
  codigoPostal: string | null
  municipio: string | null
}

type Resultado = {
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
}

export async function buscarDireccion(texto: string): Promise<Candidato[]> {
  const q = texto.trim()
  if (q.length < 4) return []

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'mx')
  url.searchParams.set('limit', '6')
  url.searchParams.set('accept-language', 'es')

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'INPOL/1.0 (gestion social; contacto via iTHINK)' },
      // El servicio es público y gratuito: si tarda, es preferible no
      // dejar el formulario colgado esperando.
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 },
    })
    if (!r.ok) return []
    const datos: Resultado[] = await r.json()

    return datos.map((d) => {
      const a = d.address ?? {}
      return {
        etiqueta: d.display_name,
        lat: Number(d.lat),
        lon: Number(d.lon),
        calle: a.road ?? null,
        colonia: a.neighbourhood ?? a.suburb ?? a.quarter ?? null,
        codigoPostal: a.postcode ?? null,
        municipio: a.city ?? a.town ?? a.municipality ?? a.village ?? null,
      }
    })
  } catch {
    return []
  }
}

/**
 * La sección electoral que corresponde a un punto.
 *
 * Se resuelve por cercanía al centro de cada sección y no por el
 * polígono exacto: la cartografía completa pesa decenas de megabytes y
 * no vive en la base, solo sus centroides. Para colocar una actividad en
 * su zona alcanza; para un domicilio en el límite de dos secciones
 * puede errar, y por eso el campo queda editable y se dice que es una
 * sugerencia.
 */
export async function seccionCercana(
  lat: number,
  lon: number,
): Promise<{ clave: string; municipio: string | null; aKm: number } | null> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant?.estado_id) return null

  const [s] = await sinTenant<{ clave: string; municipio: string | null; km: number }[]>`
    select s.clave,
           m.nombre as municipio,
           -- Distancia aproximada en kilómetros. No hace falta PostGIS
           -- para comparar cuál de dos centroides está más cerca.
           (111.32 * sqrt(
              power(s.latitud - ${lat}, 2) +
              power((s.longitud - ${lon}) * cos(radians(${lat})), 2)
           ))::float8 as km
    from secciones s
    left join municipios m on m.id = s.municipio_id
    where s.estado_id = ${tenant.estado_id}
      and s.latitud is not null
    order by km
    limit 1`

  if (!s) return null
  return { clave: s.clave, municipio: s.municipio, aKm: Math.round(s.km * 10) / 10 }
}

/** El municipio del catálogo que corresponde a un nombre de OSM. */
export async function municipioPorNombre(nombre: string): Promise<string | null> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant?.estado_id) return null

  const [m] = await conTenant(tenant.id, (tx) =>
    tx<{ id: string }[]>`
      select id from municipios
      where estado_id = ${tenant.estado_id}
        and unaccent(lower(nombre)) = unaccent(lower(${nombre}))
      limit 1`,
  )
  return m?.id ?? null
}
