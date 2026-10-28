import 'server-only'
import { cookies } from 'next/headers'

/**
 * Búsqueda maestra: un término que se queda puesto al cambiar de
 * pantalla hasta que alguien lo quita.
 *
 * El buscador del encabezado salta a un resultado concreto, que sirve
 * cuando ya se sabe a quién se busca. Esto responde otra pregunta:
 * «enséñame TODO lo que haya de Treviño», y que al pasar de Peticiones
 * a Ciudadanos y a Actividades siga acotado a Treviño.
 *
 * Vive en una galleta y no en la dirección porque tiene que sobrevivir
 * a cualquier forma de navegar —el menú lateral, un enlace del panel,
 * el botón de atrás— y encadenarlo a mano en cada enlace del sistema
 * garantiza que alguno se quede sin él.
 *
 * El filtro de la propia pantalla manda: si la dirección trae `q`, ese
 * gana. Así una búsqueda puntual no se pelea con la maestra.
 */
export const GALLETA_BUSQUEDA = 'inpol_busqueda'

export async function busquedaMaestra(): Promise<string | undefined> {
  const v = (await cookies()).get(GALLETA_BUSQUEDA)?.value?.trim()
  return v && v.length >= 2 ? v : undefined
}

/** El término que debe aplicar una pantalla: el suyo, o el maestro. */
export async function terminoVigente(propio?: string): Promise<string | undefined> {
  return propio ?? (await busquedaMaestra())
}
