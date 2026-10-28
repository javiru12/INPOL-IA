import Link from 'next/link'
/** Encabezado de pantalla. Un solo patrón para todo el sistema. */
export function Pagina({
  titulo,
  descripcion,
  cuenta,
  acciones,
  children,
}: {
  titulo: string
  descripcion?: string
  /** Cuántos registros hay detrás del título. Va pegado a él porque
      «Peticiones 1,179» se lee de un golpe y responde la primera
      pregunta de quien llega a la pantalla. */
  cuenta?: number | string
  acciones?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-7">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[length:var(--text-pagina)] font-semibold leading-tight tracking-[-0.02em]">
              {titulo}
            </h1>
            {cuenta !== undefined && (
              <span className="cifra text-[var(--text-media)] font-medium text-[var(--color-tinta-3)]">
                {typeof cuenta === 'number' ? cuenta.toLocaleString('es-MX') : cuenta}
              </span>
            )}
          </div>
          {descripcion && (
            <p className="mt-1 text-[var(--color-tinta-2)]">{descripcion}</p>
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
  href,
}: {
  etiqueta: string
  valor: number | string
  pie?: string
  tono?: 'neutro' | 'exito' | 'aviso' | 'alerta' | 'dato'
  /** A dónde lleva esta cifra, si lleva a algún lado. */
  href?: string
}) {
  const colores = {
    neutro: 'var(--color-tinta)',
    exito: 'var(--color-exito)',
    aviso: 'var(--color-aviso)',
    alerta: 'var(--color-alerta)',
    dato: 'var(--color-dato)',
  } as const

  const cuerpo = (
    <>
      <p className="rotulo">{etiqueta}</p>
      <p
        className="cifra mt-1.5 text-[length:var(--text-cifra)] leading-none"
        style={{ color: colores[tono] }}
      >
        {typeof valor === 'number' ? valor.toLocaleString('es-MX') : valor}
      </p>
      {pie && (
        <p className="mt-1.5 text-[var(--text-menuda)] leading-snug text-[var(--color-tinta-3)]">
          {pie}
        </p>
      )}
    </>
  )

  // El indicador ya no trae superficie propia: la pone la franja que lo
  // contiene. Solo reacciona al cursor si de verdad lleva a algún lado.
  if (!href) return <div>{cuerpo}</div>

  return (
    <Link href={href} className="panel-vivo block">
      {cuerpo}
    </Link>
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
