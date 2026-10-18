'use client'

import { useRouter } from 'next/navigation'

/**
 * Renglón de tabla que se abre con doble clic.
 *
 * Un enlace dentro de una celda es fácil de no ver: quien usa el sistema
 * todo el día espera que el renglón entero responda. El enlace sigue ahí
 * —es lo que hace que funcione el teclado y el «abrir en pestaña nueva»—
 * y esto solo añade el atajo.
 *
 * El clic sencillo no navega a propósito: con selección múltiple en la
 * misma tabla, un clic suelto tiene que poder marcar sin abrir nada.
 */
export function FilaAbrible({
  href,
  children,
  estilo,
  titulo,
}: {
  href: string
  children: React.ReactNode
  estilo?: React.CSSProperties
  titulo?: string
}) {
  const router = useRouter()

  return (
    <tr
      onDoubleClick={(e) => {
        // Si el doble clic cayó sobre un enlace o un control, es suyo.
        if ((e.target as HTMLElement).closest('a, button, input, select')) return
        router.push(href)
      }}
      className="cursor-pointer"
      style={estilo}
      title={titulo ?? 'Doble clic para abrir'}
    >
      {children}
    </tr>
  )
}
