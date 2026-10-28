'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { mandarCodigo, confirmarCodigo, type EstadoVerificacion } from '../verificacion'

/**
 * Verificación del celular por SMS.
 *
 * Un teléfono mal capturado no se nota hasta que hay que avisarle a la
 * persona que su petición se resolvió, y para entonces pasaron meses.
 * Verificarlo con la persona enfrente lo descubre cuando todavía se
 * puede corregir.
 */
export function VerificarTelefono({
  ciudadanoId,
  telefono,
  verificadoEn,
}: {
  ciudadanoId: string
  telefono: string | null
  verificadoEn: string | null
}) {
  const [envio, mandar] = useActionState<EstadoVerificacion, FormData>(mandarCodigo, {})
  const [confirma, confirmar] = useActionState<EstadoVerificacion, FormData>(confirmarCodigo, {})

  if (verificadoEn || confirma.ok) {
    return (
      <p
        className="text-[var(--text-menuda)]"
        style={{ color: 'var(--color-exito)' }}
        role="status"
      >
        Celular verificado por SMS.
      </p>
    )
  }

  if (!telefono) {
    return (
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        Sin celular capturado no hay a dónde mandar el código.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {!envio.ok ? (
        <form action={mandar}>
          <input type="hidden" name="ciudadanoId" value={ciudadanoId} />
          <Boton etiqueta="Verificar por SMS" pendiente="Enviando…" />
        </form>
      ) : (
        <form action={confirmar} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="ciudadanoId" value={ciudadanoId} />
          <label className="block">
            <span className="mb-1 block text-[var(--text-micro)] text-[var(--color-tinta-2)]">
              Código recibido
            </span>
            <input
              name="codigo"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="campo !h-8 !w-28 tracking-[0.2em]"
            />
          </label>
          <Boton etiqueta="Confirmar" pendiente="Comprobando…" />
        </form>
      )}

      {envio.mensaje && (
        <p className="text-[var(--text-micro)] text-[var(--color-tinta-2)]">{envio.mensaje}</p>
      )}

      {/* Mientras no haya proveedor de SMS contratado, el código se le
          enseña a quien captura para poder probar el circuito completo.
          Con proveedor, esto desaparece solo. */}
      {envio.codigoDemostracion && (
        <p
          className="rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-micro)]"
          style={{ background: 'var(--color-aviso-suave)', color: 'var(--color-aviso)' }}
        >
          Sin proveedor de SMS contratado todavía · el código es{' '}
          <strong className="font-semibold tracking-[0.15em]">
            {envio.codigoDemostracion}
          </strong>
        </p>
      )}

      {(envio.error || confirma.error) && (
        <p className="text-[var(--text-micro)]" style={{ color: 'var(--color-alerta)' }}>
          {envio.error ?? confirma.error}
        </p>
      )}
    </div>
  )
}

function Boton({ etiqueta, pendiente }: { etiqueta: string; pendiente: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-neutro !h-8">
      {pending ? pendiente : etiqueta}
    </button>
  )
}
