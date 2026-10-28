import Link from 'next/link'
/** Encabezado de pantalla. Un solo patrón para todo el sistema. */
export function Pagina({
  titulo,
  descripcion,
  cuenta,
  insignias,
  acciones,
  children,
}: {
  titulo: string
  descripcion?: string
  /** Cuántos registros hay detrás del título. Va pegado a él porque
      «Peticiones 1,179» se lee de un golpe y responde la primera
      pregunta de quien llega a la pantalla. */
  cuenta?: number | string
  /** Distintivos que van pegados al título —el estatus de una petición,
      por ejemplo—. En qué estado está algo es lo primero que se
      pregunta quien lo abre: no puede estar enterrado en un panel. */
  insignias?: React.ReactNode
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
            {insignias && <span className="flex items-center gap-2">{insignias}</span>}
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

/**
 * Cuánto cambió contra el periodo anterior.
 *
 * Va pegado a la cifra, no debajo: quien mira un tablero lee el número
 * y la dirección en el mismo golpe de vista, y si la flecha está a dos
 * renglones ya no son el mismo dato.
 */
function Variacion({
  porcentaje,
  contra,
  subirEsBueno = true,
}: {
  porcentaje: number
  contra: string
  subirEsBueno?: boolean
}) {
  // Un cambio por debajo de medio punto es ruido de redondeo, no una
  // tendencia: decir «↗ 0%» es peor que no decir nada.
  if (!Number.isFinite(porcentaje) || Math.abs(porcentaje) < 0.5) {
    return (
      <span className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        igual que {contra}
      </span>
    )
  }

  const subio = porcentaje > 0
  const bien = subio === subirEsBueno
  return (
    <span
      className="distintivo"
      style={{
        background: bien ? 'var(--color-exito-suave)' : 'var(--color-alerta-suave)',
        color: bien ? 'var(--color-exito)' : 'var(--color-alerta)',
      }}
      title={`Contra ${contra}`}
    >
      <span aria-hidden="true">{subio ? '↗' : '↘'}</span>
      {Math.abs(Math.round(porcentaje))}%
      <span className="sr-only">
        {subio ? 'más' : 'menos'} que {contra}
      </span>
    </span>
  )
}

/** Indicador numérico. La cifra manda; la etiqueta la acompaña. */
export function Indicador({
  etiqueta,
  valor,
  pie,
  tono = 'neutro',
  href,
  variacion,
}: {
  etiqueta: string
  valor: number | string
  pie?: string
  tono?: 'neutro' | 'exito' | 'aviso' | 'alerta' | 'dato'
  /** A dónde lleva esta cifra, si lleva a algún lado. */
  href?: string
  /**
   * Contra qué se compara. Una cifra sola no dice si vamos bien: 209
   * peticiones vivas puede ser un alivio o una alarma según cuántas
   * había el mes pasado.
   *
   * `subirEsBueno` existe porque no siempre lo es: más resueltas sí,
   * más días para resolver no, y pintar las dos de verde sería mentir.
   */
  variacion?: { porcentaje: number; contra: string; subirEsBueno?: boolean }
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
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <p
          className="cifra text-[length:var(--text-cifra)] leading-none"
          style={{ color: colores[tono] }}
        >
          {typeof valor === 'number' ? valor.toLocaleString('es-MX') : valor}
        </p>
        {variacion && <Variacion {...variacion} />}
      </div>
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
