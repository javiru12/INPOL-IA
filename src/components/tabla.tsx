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
 *
 * El eje vertical va en `clip` y no en `visible` a propósito: por
 * especificación, si un eje es `auto` el otro deja de ser `visible` y se
 * vuelve `auto` también, lo que convierte este div en un contenedor con
 * scroll vertical. El encabezado pegajoso se quedaba pegado a ÉL —que
 * nunca se desplaza— en vez de a la pantalla, y se iba hacia arriba al
 * bajar por la tabla. `clip` recorta igual sin crear el contenedor.
 */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto overflow-y-clip">
      <table className="tabla">{children}</table>
    </div>
  )
}
