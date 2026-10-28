/**
 * Anillo de progreso.
 *
 * Una barra dice «cuánto llevas» y un anillo dice «cuánto falta para
 * cerrar», que es otra pregunta. Se usa donde hay una meta de verdad
 * —un porcentaje de atención, una meta de movilización—, no para
 * adornar un número que no va hacia ningún lado.
 */
export function Anillo({
  porcentaje,
  color = 'var(--color-acento)',
  tamano = 112,
  grosor = 9,
  children,
}: {
  porcentaje: number
  color?: string
  tamano?: number
  grosor?: number
  children?: React.ReactNode
}) {
  const parte = Math.max(0, Math.min(100, porcentaje))
  const radio = (tamano - grosor) / 2
  const vuelta = 2 * Math.PI * radio

  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90" aria-hidden="true">
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke="var(--color-borde)"
          strokeWidth={grosor}
        />
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={vuelta}
          strokeDashoffset={vuelta - (vuelta * parte) / 100}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.7,.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        {children}
      </div>
    </div>
  )
}
