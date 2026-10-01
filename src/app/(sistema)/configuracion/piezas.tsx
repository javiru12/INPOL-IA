'use client'

import { useFormStatus } from 'react-dom'
import type { EstadoAccion } from './acciones'

/**
 * Piezas de formulario de la pantalla de configuración.
 *
 * Son las mismas que usa la captura de peticiones, extraídas aquí porque
 * esta pantalla tiene una docena de formularios y repetirlas en cada uno
 * acabaría en una docena de campos ligeramente distintos.
 */

export function Campo({
  nombre,
  etiqueta,
  tipo = 'text',
  valor,
  requerido,
  marcador,
  ayuda,
  autoComplete,
}: {
  nombre: string
  etiqueta: string
  tipo?: string
  valor?: string | null
  requerido?: boolean
  marcador?: string
  ayuda?: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <Rotulo etiqueta={etiqueta} requerido={requerido} />
      <input
        type={tipo}
        name={nombre}
        defaultValue={valor ?? ''}
        required={requerido}
        placeholder={marcador}
        autoComplete={autoComplete}
        className="campo"
      />
      {ayuda && (
        <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {ayuda}
        </span>
      )}
    </label>
  )
}

export function Area({
  nombre,
  etiqueta,
  valor,
  filas = 3,
  marcador,
}: {
  nombre: string
  etiqueta: string
  valor?: string | null
  filas?: number
  marcador?: string
}) {
  return (
    <label className="block">
      <Rotulo etiqueta={etiqueta} />
      <textarea
        name={nombre}
        rows={filas}
        defaultValue={valor ?? ''}
        placeholder={marcador}
        className="campo !h-auto resize-y py-2"
      />
    </label>
  )
}

export function Selector({
  nombre,
  etiqueta,
  opciones,
  valor,
  requerido,
  vacio = 'Selecciona…',
  ayuda,
}: {
  nombre: string
  etiqueta: string
  opciones: { valor: string; texto: string }[]
  valor?: string | null
  requerido?: boolean
  vacio?: string
  ayuda?: string
}) {
  return (
    <label className="block">
      <Rotulo etiqueta={etiqueta} requerido={requerido} />
      <select name={nombre} defaultValue={valor ?? ''} required={requerido} className="campo">
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {ayuda && (
        <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {ayuda}
        </span>
      )}
    </label>
  )
}

/** Campo de color: la muestra y el valor en hexadecimal, uno al lado del otro. */
export function CampoColor({
  nombre,
  etiqueta,
  valor,
}: {
  nombre: string
  etiqueta: string
  valor?: string | null
}) {
  const inicial = /^#[0-9a-fA-F]{6}$/.test(valor ?? '') ? valor! : '#714a85'
  return (
    <label className="block">
      <Rotulo etiqueta={etiqueta} />
      <span className="flex items-center gap-2">
        <input
          type="color"
          defaultValue={inicial}
          aria-label={`${etiqueta}, muestra`}
          onChange={(e) => {
            const texto = e.currentTarget.parentElement?.querySelector('input[type=text]')
            if (texto instanceof HTMLInputElement) texto.value = e.currentTarget.value
          }}
          className="h-[2.125rem] w-10 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0.5"
        />
        <input
          type="text"
          name={nombre}
          defaultValue={inicial}
          pattern="#[0-9a-fA-F]{6}"
          className="campo clave !text-[var(--color-tinta)]"
        />
      </span>
    </label>
  )
}

function Rotulo({ etiqueta, requerido }: { etiqueta: string; requerido?: boolean }) {
  return (
    <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
      {etiqueta} {requerido && <span className="text-[var(--color-alerta)]">*</span>}
    </span>
  )
}

/**
 * Lo que salió del servidor, dicho en una línea.
 *
 * El mensaje de éxito lo manda la acción cuando tiene algo que contar
 * —cuántas peticiones quedaron apuntando al catálogo que acabas de
 * desactivar, por ejemplo—; si no, se usa el de respaldo.
 */
export function Aviso({ estado, exito }: { estado: EstadoAccion; exito?: string }) {
  if (estado.error) {
    return (
      <p
        role="alert"
        className="rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-alerta)]"
      >
        {estado.error}
      </p>
    )
  }
  if (estado.ok && (estado.mensaje || exito)) {
    return (
      <p
        role="status"
        className="rounded-[var(--radius-sm)] bg-[var(--color-exito-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-exito)]"
      >
        {estado.mensaje ?? exito}
      </p>
    )
  }
  return null
}

/**
 * Botón de envío.
 *
 * Lleva `data-accion` porque el encabezado del sistema ya tiene un
 * `button[type=submit]` —el de cerrar sesión— y es el primero del
 * documento: sin una marca propia, cualquier automatismo que busque «el
 * botón de enviar» cierra la sesión en vez de guardar.
 */
export function Enviar({
  etiqueta,
  pendiente = 'Guardando…',
  variante = 'primario',
  accion,
  ancho,
}: {
  etiqueta: string
  pendiente?: string
  variante?: 'primario' | 'neutro' | 'peligro'
  accion: string
  ancho?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      data-accion={accion}
      className={`boton boton-${variante} ${ancho ? 'w-full' : ''}`}
    >
      {pending ? pendiente : etiqueta}
    </button>
  )
}

/** Variante compacta, para las filas de una tabla. */
export function EnviarChico({
  etiqueta,
  pendiente = '…',
  variante = 'neutro',
  accion,
}: {
  etiqueta: string
  pendiente?: string
  variante?: 'primario' | 'neutro' | 'peligro' | 'llano'
  accion: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      data-accion={accion}
      className={`boton boton-${variante} !h-7 text-[var(--text-menuda)]`}
    >
      {pending ? pendiente : etiqueta}
    </button>
  )
}
