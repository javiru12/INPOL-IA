import 'server-only'

/**
 * Envío de SMS.
 *
 * No hay proveedor contratado todavía, así que por ahora el código se
 * escribe en el registro del servidor y se le devuelve a quien captura,
 * que es lo que permite probar el circuito completo con la persona
 * enfrente.
 *
 * Para mandarlos de verdad hace falta un proveedor —Twilio, AWS SNS o
 * el que contrate el cliente— y sus credenciales en el entorno. Cuando
 * las haya, se implementa `enviarPorProveedor` y se quita el modo de
 * demostración: nada más de la aplicación se entera.
 */

export type ResultadoEnvio = {
  enviado: boolean
  /** Solo en modo demostración: el código, para poder continuar. */
  codigoVisible?: string
  motivo?: string
}

const HAY_PROVEEDOR = Boolean(process.env.SMS_PROVEEDOR_URL && process.env.SMS_PROVEEDOR_TOKEN)

export async function enviarSms(
  telefono: string,
  mensaje: string,
  codigo: string,
): Promise<ResultadoEnvio> {
  if (!HAY_PROVEEDOR) {
    console.log(`[sms · demostración] ${telefono}: ${mensaje}`)
    return { enviado: true, codigoVisible: codigo }
  }

  try {
    const r = await fetch(process.env.SMS_PROVEEDOR_URL!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.SMS_PROVEEDOR_TOKEN}`,
      },
      body: JSON.stringify({ to: telefono, message: mensaje }),
      signal: AbortSignal.timeout(8000),
    })
    return r.ok
      ? { enviado: true }
      : { enviado: false, motivo: `El proveedor respondió ${r.status}` }
  } catch {
    return { enviado: false, motivo: 'No se pudo contactar al proveedor de SMS' }
  }
}

/** Un número mexicano a diez dígitos, sin lada internacional ni adornos. */
export function telefonoValido(t: string | null | undefined) {
  return Boolean(t && /^\d{10}$/.test(t.replace(/\D/g, '').replace(/^52/, '')))
}
