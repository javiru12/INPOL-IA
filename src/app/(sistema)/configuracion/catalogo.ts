/**
 * Metadatos de la pantalla de configuración.
 *
 * Vive aparte porque lo consultan los dos lados: las acciones de servidor
 * para saber qué tabla y qué columnas tocar, y los formularios de cliente
 * para saber qué campos dibujar. Aquí no hay consultas ni `server-only`.
 */

export type ClaveSeccion = 'usuarios' | 'campanias' | 'catalogos' | 'cliente'

export const SECCIONES: { clave: ClaveSeccion; etiqueta: string }[] = [
  { clave: 'usuarios', etiqueta: 'Usuarios' },
  { clave: 'campanias', etiqueta: 'Campañas' },
  { clave: 'catalogos', etiqueta: 'Catálogos' },
  { clave: 'cliente', etiqueta: 'Datos del cliente' },
]

export function seccionValida(v: string | undefined): ClaveSeccion {
  return SECCIONES.find((s) => s.clave === v)?.clave ?? 'usuarios'
}

// --- Permisos -----------------------------------------------------------
//
// El catálogo de funcionalidades ya distingue quién crea usuarios, quién
// los edita y quién da de alta problemáticas. Se respeta tal cual en vez
// de inventar un permiso nuevo o de comprobar el nombre del perfil, que
// es justo lo que el sistema evita en todas partes.
//
// «Datos del cliente» no existe en la matriz original —la pantalla no
// dejaba editarlos—, así que se cuelga de quien administra usuarios: el
// nombre comercial y la vigencia de la licencia son del mismo rango.

export const PERMISOS = {
  usuariosAlta: ['configuracion.creacion_de_usuarios'],
  usuariosCambio: ['configuracion.edicion_de_usuarios'],
  usuariosBaja: ['configuracion.eliminacion_de_usuarios'],
  campanias: ['configuracion.alta_de_campana'],
  candidatos: ['configuracion.alta_de_candidatos'],
  catalogos: ['configuracion.alta_de_problematicas', 'configuracion.alta_fuente_de_campana'],
  cliente: ['configuracion.edicion_de_usuarios'],
} as const

/** Mismo criterio de prefijos que `exigirAcceso`: `a.b` habilita `a.b.c`. */
export function alcanza(permisos: Set<string>, requeridos: readonly string[]) {
  return requeridos.some((prefijo) => {
    for (const clave of permisos) {
      if (clave === prefijo || clave.startsWith(prefijo + '.')) return true
    }
    return false
  })
}

/**
 * Perfiles con mando sobre el sistema. Quien tiene uno de estos no puede
 * quitárselo a sí mismo: si lo hiciera, perdería la pantalla desde la que
 * acaba de hacerlo y haría falta un técnico en la base de datos.
 */
export const PERFILES_ADMIN = ['super_admin', 'admin']

/** El sistema nunca puede quedarse sin ninguno de estos, activo. */
export const PERFIL_MAXIMO = 'super_admin'

// --- Catálogos de la operación -----------------------------------------

export type ClaveCatalogo =
  | 'problematicas'
  | 'subproblematicas'
  | 'dependencias'
  | 'fuentes'
  | 'estatus_peticiones'
  | 'prioridades'

export type TipoCampo = 'texto' | 'color' | 'correo' | 'telefono' | 'problematica'

export type CampoCatalogo = {
  /** Es a la vez el `name` del input y la columna de la tabla. */
  nombre: string
  etiqueta: string
  tipo?: TipoCampo
  requerido?: boolean
  /** Ancho de la columna en la tabla, en clases de rejilla. */
  ancho?: string
}

export type DefinicionCatalogo = {
  tabla: string
  etiqueta: string
  singular: string
  /** Para qué sirve, en una línea. Se muestra arriba de la tabla. */
  proposito: string
  /** Columna de `peticiones` que apunta aquí: con ella se cuenta el uso. */
  columnaUso: string
  campos: CampoCatalogo[]
}

export const CATALOGOS: Record<ClaveCatalogo, DefinicionCatalogo> = {
  problematicas: {
    tabla: 'problematicas',
    etiqueta: 'Problemáticas',
    singular: 'problemática',
    proposito: 'El primer corte de toda petición. Ordena las estadísticas y el mapa.',
    columnaUso: 'problematica_id',
    campos: [
      { nombre: 'titulo', etiqueta: 'Problemática', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción' },
      { nombre: 'color_rgb', etiqueta: 'Color', tipo: 'color', ancho: 'w-28' },
    ],
  },
  subproblematicas: {
    tabla: 'subproblematicas',
    etiqueta: 'Sub-problemáticas',
    singular: 'sub-problemática',
    proposito: 'El detalle dentro de una problemática: «fuga» dentro de «agua».',
    columnaUso: 'subproblematica_id',
    campos: [
      { nombre: 'problematica_id', etiqueta: 'Problemática', tipo: 'problematica', requerido: true },
      { nombre: 'titulo', etiqueta: 'Sub-problemática', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción' },
    ],
  },
  dependencias: {
    tabla: 'dependencias',
    etiqueta: 'Dependencias',
    singular: 'dependencia',
    proposito: 'A quién se le turna la petición, y con quién se habla ahí.',
    columnaUso: 'dependencia_id',
    campos: [
      { nombre: 'clave', etiqueta: 'Clave', ancho: 'w-24' },
      { nombre: 'descripcion', etiqueta: 'Dependencia', requerido: true },
      { nombre: 'contacto', etiqueta: 'Contacto' },
      { nombre: 'contacto_puesto', etiqueta: 'Puesto' },
      { nombre: 'telefono_movil', etiqueta: 'Teléfono', tipo: 'telefono', ancho: 'w-36' },
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'correo' },
    ],
  },
  fuentes: {
    tabla: 'fuentes',
    etiqueta: 'Fuentes',
    singular: 'fuente',
    proposito: 'Por dónde llegó la petición: llamada, recorrido, redes, oficina.',
    columnaUso: 'fuente_id',
    campos: [{ nombre: 'descripcion', etiqueta: 'Fuente', requerido: true }],
  },
  estatus_peticiones: {
    tabla: 'estatus_peticiones',
    etiqueta: 'Estatus de petición',
    singular: 'estatus',
    proposito: 'Las etapas por las que pasa una petición hasta cerrarse.',
    columnaUso: 'estatus_id',
    campos: [{ nombre: 'descripcion', etiqueta: 'Estatus', requerido: true }],
  },
  prioridades: {
    tabla: 'prioridades',
    etiqueta: 'Prioridades',
    singular: 'prioridad',
    proposito: 'Qué tan urgente es atenderla.',
    columnaUso: 'prioridad_id',
    campos: [{ nombre: 'descripcion', etiqueta: 'Prioridad', requerido: true }],
  },
}

export const CLAVES_CATALOGO = Object.keys(CATALOGOS) as ClaveCatalogo[]

export function catalogoValido(v: string | undefined): ClaveCatalogo {
  return CLAVES_CATALOGO.includes(v as ClaveCatalogo) ? (v as ClaveCatalogo) : 'problematicas'
}

/**
 * `estatus_peticiones` ya no admite nombres libres: el tablero de
 * peticiones pinta por estos cuatro y el alta entra siempre como
 * «Abierta». Quitarlos dejaría pantallas sin color y peticiones sin
 * estatus inicial.
 */
export const ESTATUS_RESERVADOS = ['Abierta', 'Completada']

export const TIPOS_CAMPANIA_SUGERIDOS = [
  'gestión',
  'gobernatura',
  'alcaldía',
  'diputación local',
  'diputación federal',
  'senaduría',
]

/** La columna que guarda el nombre visible: `titulo` o `descripcion`. */
export function columnaNombre(def: DefinicionCatalogo) {
  return def.campos.find((c) => c.requerido && c.tipo !== 'problematica')!.nombre
}
