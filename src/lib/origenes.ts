/**
 * De dónde salió la ficha de un ciudadano.
 *
 * Importa quién lo dio de alta: una ficha capturada por un gestor en
 * campo y una que llegó sola por la app de afiliación no valen lo
 * mismo, ni se verifican igual, y mezclarlas sin distinguirlas hace que
 * los conteos de afiliación no se puedan auditar.
 */
export const ORIGENES = [
  { clave: 'captura', etiqueta: 'Gestión territorial', ayuda: 'Capturado por el equipo en campo u oficina' },
  { clave: 'app', etiqueta: 'App de afiliación', ayuda: 'Se registró desde la app móvil' },
  { clave: 'portal', etiqueta: 'Portal ciudadano', ayuda: 'Llegó por el canal público de peticiones' },
  { clave: 'importado', etiqueta: 'Importado', ayuda: 'Vino en una carga masiva' },
] as const

export type ClaveOrigen = (typeof ORIGENES)[number]['clave']

export function etiquetaOrigen(clave: string | null | undefined) {
  return ORIGENES.find((o) => o.clave === clave)?.etiqueta ?? 'Sin registrar'
}

export function esOrigen(v: string | null | undefined): v is ClaveOrigen {
  return ORIGENES.some((o) => o.clave === v)
}

/** Tono del distintivo, para que se distingan de un vistazo. */
export const TONO_ORIGEN: Record<string, 'dato' | 'exito' | 'neutro' | 'aviso'> = {
  captura: 'dato',
  app: 'exito',
  portal: 'aviso',
  importado: 'neutro',
}
