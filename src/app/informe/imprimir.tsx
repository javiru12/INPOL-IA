'use client'

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="boton boton-primario !h-8 text-[var(--text-menuda)]"
    >
      Imprimir o guardar en PDF
    </button>
  )
}
