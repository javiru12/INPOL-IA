/**
 * Set de iconos propio. Trazo de 1.5, esquinas vivas, caja de 16.
 * Se dibujan a mano para que el sistema tenga una voz gráfica
 * consistente en lugar del aspecto de librería genérica.
 */
type Props = { className?: string; tamano?: number }

function Base({ children, className, tamano = 16 }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconoTablero = (p: Props) => (
  <Base {...p}><path d="M2 9.5 8 3l6 6.5" /><path d="M3.5 8.2V13h9V8.2" /><path d="M6.5 13v-3h3v3" /></Base>
)
export const IconoPeticiones = (p: Props) => (
  <Base {...p}><path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13z" /><path d="M9.5 2.5V6h3.5" /><path d="M5.5 8.5h5M5.5 11h3" /></Base>
)
export const IconoCiudadanos = (p: Props) => (
  <Base {...p}><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" /><path d="M10.5 3.6a2.4 2.4 0 0 1 0 4.6" /><path d="M11.8 9.9c1.6.5 2.7 1.9 2.7 3.6" /></Base>
)
export const IconoActividades = (p: Props) => (
  <Base {...p}><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" /><path d="M5 9.5h2M9 9.5h2M5 11.8h2" /></Base>
)
export const IconoEstructura = (p: Props) => (
  <Base {...p}><rect x="6" y="1.5" width="4" height="3" rx=".5" /><rect x="1.5" y="11.5" width="4" height="3" rx=".5" /><rect x="10.5" y="11.5" width="4" height="3" rx=".5" /><path d="M8 4.5v3.5M3.5 11.5V8h9v3.5" /></Base>
)
export const IconoMapa = (p: Props) => (
  <Base {...p}><path d="M1.5 4 5.5 2.5v9.5L1.5 13.5z" /><path d="M5.5 2.5 10.5 4v9.5L5.5 12z" /><path d="M10.5 4 14.5 2.5V12l-4 1.5z" /></Base>
)
export const IconoDiaD = (p: Props) => (
  <Base {...p}><path d="M3 1.5v13" /><path d="M3 2.5h8.5l-1.8 3 1.8 3H3" /></Base>
)
export const IconoMensajes = (p: Props) => (
  <Base {...p}><path d="M2 3.5h12v8H6.5L3.5 14v-2.5H2z" /><path d="M5 6.5h6M5 8.8h4" /></Base>
)
export const IconoAjustes = (p: Props) => (
  <Base {...p}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7 3.4 3.4" /></Base>
)
export const IconoBuscar = (p: Props) => (
  <Base {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></Base>
)
export const IconoCampana = (p: Props) => (
  <Base {...p}><path d="M4 7a4 4 0 0 1 8 0c0 2.5.8 3.7 1.3 4.2a.4.4 0 0 1-.3.7H3a.4.4 0 0 1-.3-.7C3.2 10.7 4 9.5 4 7Z" /><path d="M6.5 14a1.8 1.8 0 0 0 3 0" /></Base>
)
export const IconoFlechaAbajo = (p: Props) => (
  <Base {...p}><path d="m4 6 4 4 4-4" /></Base>
)
export const IconoMas = (p: Props) => (
  <Base {...p}><path d="M8 3.5v9M3.5 8h9" /></Base>
)
export const IconoSalir = (p: Props) => (
  <Base {...p}><path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" /><path d="M10 11l3-3-3-3" /><path d="M13 8H6" /></Base>
)
export const IconoFiltro = (p: Props) => (
  <Base {...p}><path d="M2 3.5h12l-4.5 5v4.5l-3 1.5V8.5z" /></Base>
)
export const IconoVer = (p: Props) => (
  <Base {...p}><path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></Base>
)

export const IconoEstadisticas = (p: Props) => (
  <Base {...p}><path d="M2.5 13.5h11" /><path d="M4.5 13.5V9M7.5 13.5V5.5M10.5 13.5v-6M13.5 13.5V3" /></Base>
)

/**
 * Mapa por nombre. Los componentes no pueden cruzar la frontera
 * servidor → cliente como props, así que la navegación viaja con el
 * nombre del icono y se resuelve aquí.
 */
export const ICONOS = {
  tablero: IconoTablero,
  estadisticas: IconoEstadisticas,
  peticiones: IconoPeticiones,
  ciudadanos: IconoCiudadanos,
  actividades: IconoActividades,
  estructura: IconoEstructura,
  mapa: IconoMapa,
  diaD: IconoDiaD,
  mensajes: IconoMensajes,
  ajustes: IconoAjustes,
} as const

export type NombreIcono = keyof typeof ICONOS
