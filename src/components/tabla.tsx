import type { ReactNode } from 'react'

/**
 * Tabla con desplazamiento horizontal.
 *
 * Es un componente y no una clase de CSS porque el scroll necesita un
 * contenedor alrededor de la tabla, y cuando eso se deja a criterio de
 * cada pantalla unas lo traen y otras no: el grid de Movilización se
 * podía recorrer y los de Territorio y Comunicación no, sin ninguna
 * razón más que el descuido.
 *
 * Toda tabla del sistema pasa por aquí.
 */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla">{children}</table>
    </div>
  )
}
