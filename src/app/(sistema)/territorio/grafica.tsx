'use client'

import { BarrasHorizontales } from '@/components/graficas'

/**
 * Una serie, un color. El envoltorio existe solo porque `formato` es una
 * función y las funciones no cruzan de servidor a cliente: sin él, la
 * participación se leería «58.7» en vez de «58.7%».
 */
export function ParticipacionPorDistrito({
  datos,
}: {
  datos: { etiqueta: string; valor: number }[]
}) {
  return (
    <BarrasHorizontales
      datos={datos}
      formato={(n) => `${n.toFixed(1)}%`}
      colorUnico="var(--color-dato)"
      participacion={false}
    />
  )
}
