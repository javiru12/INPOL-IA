'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { entrar, type EstadoEntrada } from './acciones'

export function Formulario() {
  const [estado, accion] = useActionState<EstadoEntrada, FormData>(entrar, {})

  return (
    <form action={accion} className="mt-7 space-y-4">
      <div>
        <label htmlFor="correo" className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="campo"
          placeholder="nombre@dominio.mx"
        />
      </div>

      <div>
        <label htmlFor="contrasena" className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
          Contraseña
        </label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
        />
      </div>

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-alerta)]"
        >
          <span aria-hidden="true" className="mt-px font-semibold">!</span>
          {estado.error}
        </p>
      )}

      <Boton />

      <p className="pt-1 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        ¿Olvidaste tu contraseña? Pídele a tu administrador que la restablezca.
      </p>
    </form>
  )
}

function Boton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario w-full">
      {pending ? 'Verificando…' : 'Entrar'}
    </button>
  )
}
