/**
 * El embudo de prospección, aparte de las consultas. La pantalla de cliente
 * también lo necesita, y al tomarlo de `consultas.ts` —que es `server-only`—
 * arrastraba el driver de base de datos al navegador y rompía la compilación.
 */
export const ESTADOS = ['prospecto', 'contactado', 'comprometido', 'confirmado'] as const
export type EstadoProspeccion = (typeof ESTADOS)[number]

export function esEstado(v: string | undefined): v is EstadoProspeccion {
  return !!v && (ESTADOS as readonly string[]).includes(v)
}

export const ETIQUETA_ESTADO: Record<EstadoProspeccion, string> = {
  prospecto: 'Prospecto',
  contactado: 'Contactado',
  comprometido: 'Comprometido',
  confirmado: 'Confirmado',
}
