/**
 * Logotipo. El símbolo es una red de secciones con una trayectoria
 * marcada: la idea de INPOL es leer el territorio, no adornarlo.
 */
export function Marca({
  className = '',
  tono = 'oscuro',
  compacto = false,
}: {
  className?: string
  tono?: 'oscuro' | 'claro'
  compacto?: boolean
}) {
  const claro = tono === 'claro'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <g stroke={claro ? 'rgba(255,255,255,.4)' : 'var(--color-borde-fuerte)'} strokeWidth="1">
          <path d="M4 8.5 9 5l6 3.5 7-2M4 8.5v8l5 4.5 6-3 7 2.5M9 5v7.5m0 0 6-4m-6 4 6 4.5m0-8.5v8.5m7-10.5v10.5" />
        </g>
        <g fill={claro ? '#fff' : 'var(--color-acento)'}>
          <circle cx="4" cy="8.5" r="1.8" />
          <circle cx="9" cy="12.5" r="1.8" />
          <circle cx="15" cy="8.5" r="1.8" />
          <circle cx="22" cy="19" r="1.8" />
        </g>
        <path
          d="M4 8.5 9 12.5 15 8.5 22 19"
          stroke={claro ? '#fff' : 'var(--color-acento)'}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {!compacto && (
        <span
          className={`text-[1.0625rem] font-semibold tracking-[0.14em] ${
            claro ? 'text-white' : 'text-[var(--color-tinta)]'
          }`}
        >
          INPOL
        </span>
      )}
    </div>
  )
}
