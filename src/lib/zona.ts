/**
 * Zona horaria por estado.
 *
 * No es un detalle: el servidor corre en UTC, así que una petición
 * capturada a las 9 de la noche del 31 de octubre en Monterrey se
 * guarda como 1 de noviembre. Si la gráfica agrupa por mes en UTC y la
 * lista filtra en hora local (o al revés), la barra dice 45 y la lista
 * enseña 44 sin que nadie entienda por qué.
 *
 * Toda consulta que agrupe o filtre por día o por mes convierte con la
 * zona del estado del cliente, no con la del servidor.
 */

const CENTRO = 'America/Mexico_City'

/** Clave INE del estado → zona IANA. */
const POR_CLAVE: Record<string, string> = {
  '03': 'America/Mazatlan', // Baja California Sur
  '08': 'America/Chihuahua', // Chihuahua, salvo los municipios fronterizos
  '17': CENTRO, // Morelos
  '19': 'America/Monterrey', // Nuevo León
}

export function zonaDeEstado(clave: string | null | undefined) {
  return (clave && POR_CLAVE[clave]) || CENTRO
}

/**
 * Para las consultas que todavía no reciben el estado del cliente.
 * Los cuatro estados cargados salvo Baja California Sur caen en el
 * centro, así que es el menos malo de los supuestos.
 */
export const ZONA_PREDETERMINADA = CENTRO
