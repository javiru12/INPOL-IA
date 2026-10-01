/** Encabezado de pantalla. Un solo patrón para todo el sistema. */
export function Pagina({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[var(--text-titulo)]">{titulo}</h1>
          {descripcion && (
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {descripcion}
            </p>
          )}
        </div>
        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  )
}

/** Indicador numérico. La cifra manda; la etiqueta la acompaña. */
export function Indicador({
  etiqueta,
  valor,
  pie,
  tono = 'neutro',
}: {
  etiqueta: string
  valor: number | string
  pie?: string
  tono?: 'neutro' | 'exito' | 'aviso' | 'alerta' | 'dato'
}) {
  const colores = {
    neutro: 'var(--color-tinta)',
    exito: 'var(--color-exito)',
    aviso: 'var(--color-aviso)',
    alerta: 'var(--color-alerta)',
    dato: 'var(--color-dato)',
  } as const

  return (
    <div className="panel px-4 py-3.5">
      <p className="rotulo">{etiqueta}</p>
      <p
        className="cifra mt-1.5 text-[length:var(--text-cifra)] font-semibold leading-none tracking-tight"
        style={{ color: colores[tono] }}
      >
        {typeof valor === 'number' ? valor.toLocaleString('es-MX') : valor}
      </p>
      {pie && (
        <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">{pie}</p>
      )}
    </div>
  )
}

export function Distintivo({
  children,
  tono = 'neutro',
}: {
  children: React.ReactNode
  tono?: 'neutro' | 'exito' | 'aviso' | 'alerta' | 'dato' | 'acento'
}) {
  const estilos = {
    neutro: { background: 'var(--color-superficie-2)', color: 'var(--color-tinta-2)', border: '1px solid var(--color-borde)' },
    exito: { background: 'var(--color-exito-suave)', color: 'var(--color-exito)' },
    aviso: { background: 'var(--color-aviso-suave)', color: 'var(--color-aviso)' },
    alerta: { background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' },
    dato: { background: 'var(--color-dato-suave)', color: 'var(--color-dato)' },
    acento: { background: 'var(--color-acento-suave)', color: 'var(--color-acento-fuerte)' },
  } as const
  return <span className="distintivo" style={estilos[tono]}>{children}</span>
}

/** Estado vacío. Dice qué falta y cómo resolverlo, no solo "sin datos". */
export function Vacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-14 text-center">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-tinta-3)" strokeWidth="1.25" aria-hidden="true">
        <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
      </svg>
      <p className="mt-3 font-medium">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-sm text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {descripcion}
        </p>
      )}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}
