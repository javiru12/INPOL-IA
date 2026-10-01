import type { NombreIcono } from '@/components/iconos'

export type Entrada = {
  etiqueta: string
  ruta: string
  /** Nombre del icono: los componentes no cruzan a cliente como props. */
  icono: NombreIcono
  /** Prefijos del catálogo de funcionalidades que habilitan esta entrada. */
  permisos: string[]
}

export type Grupo = { titulo?: string; entradas: Entrada[] }

/**
 * La navegación está reorganizada a propósito. El documento original
 * agrupaba por pantalla ("Estadísticas" concentraba 136 funcionalidades
 * de seis módulos distintos); aquí se agrupa por el trabajo que hace
 * cada quien, que es como la gente lo busca.
 */
export const NAVEGACION: Grupo[] = [
  {
    entradas: [
      { etiqueta: 'Panel de inicio', ruta: '/', icono: 'tablero', permisos: ['panel_de_inicio'] },
    ],
  },
  {
    titulo: 'Operación',
    entradas: [
      { etiqueta: 'Peticiones', ruta: '/peticiones', icono: 'peticiones', permisos: ['creacion_de_peticion', 'estadisticas.peticiones', 'interpretacion'] },
      { etiqueta: 'Ciudadanos', ruta: '/ciudadanos', icono: 'ciudadanos', permisos: ['registros'] },
      { etiqueta: 'Actividades', ruta: '/actividades', icono: 'actividades', permisos: ['actividades', 'estadisticas.recorridos', 'estadisticas.eventos'] },
      { etiqueta: 'Estructura', ruta: '/estructura', icono: 'estructura', permisos: ['registros.movilizadores', 'registros.promotores'] },
      { etiqueta: 'Movilización', ruta: '/movilizacion', icono: 'ciudadanos', permisos: ['registros.movilizadores', 'registros.prospecto_movilizadores', 'registros.simpatizante', 'registros.prospeccion'] },
    ],
  },
  {
    titulo: 'Análisis',
    entradas: [
      { etiqueta: 'Estadísticas', ruta: '/estadisticas', icono: 'estadisticas', permisos: ['estadisticas'] },
      { etiqueta: 'Mapa', ruta: '/mapa', icono: 'mapa', permisos: ['estadisticas.problematicas'] },
      { etiqueta: 'Territorio', ruta: '/territorio', icono: 'estructura', permisos: ['estadisticas.problematicas'] },
    ],
  },
  {
    titulo: 'Comunicación',
    entradas: [
      { etiqueta: 'Mensajes', ruta: '/mensajes', icono: 'mensajes', permisos: ['mensajes'] },
      { etiqueta: 'Marketing', ruta: '/marketing', icono: 'mensajes', permisos: ['marketing'] },
    ],
  },
  {
    titulo: 'Jornada electoral',
    entradas: [
      { etiqueta: 'Día D', ruta: '/dia-d', icono: 'diaD', permisos: ['dia_d'] },
    ],
  },
  {
    titulo: 'Sistema',
    entradas: [
      { etiqueta: 'Configuración', ruta: '/configuracion', icono: 'ajustes', permisos: ['configuracion'] },
    ],
  },
]

export function filtrarNavegacion(permisos: Set<string>): Grupo[] {
  const alcanza = (prefijos: string[]) =>
    prefijos.some((p) => {
      for (const clave of permisos) if (clave === p || clave.startsWith(p + '.')) return true
      return false
    })

  return NAVEGACION
    .map((g) => ({ ...g, entradas: g.entradas.filter((e) => alcanza(e.permisos)) }))
    .filter((g) => g.entradas.length > 0)
}
