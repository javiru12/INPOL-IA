/**
 * Qué archivo de cartografía le toca a cada estado.
 *
 * Los nombres de archivo estaban escritos a mano en cuatro pantallas,
 * todos apuntando a Nuevo León. Con un cliente en Chihuahua eso no es un
 * detalle: el mapa le dibujaba Monterrey.
 *
 * No importa nada del servidor a propósito —lo usan componentes de
 * cliente— y por eso vive en su propio archivo.
 */

/** Clave INE del estado → prefijo de sus archivos en `public/geo/`. */
const PREFIJO: Record<string, string> = {
  '03': 'bcs',
  '08': 'chih',
  '17': 'mrls',
  '19': 'nl',
}

export type CapaDeMapa = 'municipios' | 'distritos-locales'

/**
 * Devuelve `null` cuando el estado no tiene cartografía cargada. El
 * lienzo enseña entonces qué falta, en vez de dibujar territorio ajeno.
 */
export function archivoDeMapa(
  estadoClave: string | null | undefined,
  capa: CapaDeMapa = 'municipios',
): string | null {
  const p = estadoClave ? PREFIJO[estadoClave] : undefined
  return p ? `${p}-${capa}.json` : null
}

export function hayCartografia(estadoClave: string | null | undefined) {
  return Boolean(estadoClave && PREFIJO[estadoClave])
}
