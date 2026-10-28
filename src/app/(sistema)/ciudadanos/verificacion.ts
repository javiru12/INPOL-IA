'use server'

import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { enviarSms, telefonoValido } from '@/lib/sms'

export type EstadoVerificacion = {
  ok?: boolean
  error?: string
  mensaje?: string
  /** Solo mientras no haya proveedor de SMS contratado. */
  codigoDemostracion?: string
}

const VIGENCIA_MINUTOS = 10
const MAXIMO_INTENTOS = 5

export async function mandarCodigo(
  _previo: EstadoVerificacion,
  datos: FormData,
): Promise<EstadoVerificacion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró.' }

  const id = String(datos.get('ciudadanoId') ?? '')
  if (!id) return { error: 'No se pudo identificar a la persona.' }

  return conTenant(tenant.id, async (tx) => {
    const [c] = await tx<{ telefono_movil: string | null }[]>`
      select telefono_movil from ciudadanos where id = ${id}`
    if (!c) return { error: 'Esa persona ya no está.' }
    if (!telefonoValido(c.telefono_movil)) {
      return { error: 'Su celular no tiene diez dígitos; corrígelo antes de verificar.' }
    }

    // Seis dígitos. El código se guarda cifrado: en claro, cualquiera
    // con acceso a la tabla podría dar por verificado un teléfono ajeno.
    const codigo = String(Math.floor(100000 + Math.random() * 900000))
    const hash = await bcrypt.hash(codigo, 10)

    await tx`delete from verificaciones_telefono
             where ciudadano_id = ${id} and verificado_en is null`
    await tx`
      insert into verificaciones_telefono
        (tenant_id, ciudadano_id, telefono, codigo_hash, expira_en, creado_por)
      values (${tenant.id}, ${id}, ${c.telefono_movil}, ${hash},
              now() + ${`${VIGENCIA_MINUTOS} minutes`}::interval, ${sesion.usuarioId})`

    const envio = await enviarSms(
      c.telefono_movil!,
      `INPOL: tu código de verificación es ${codigo}. Vence en ${VIGENCIA_MINUTOS} minutos.`,
      codigo,
    )
    if (!envio.enviado) return { error: envio.motivo ?? 'No se pudo enviar el mensaje.' }

    return {
      ok: true,
      mensaje: `Código enviado al ${c.telefono_movil}. Vence en ${VIGENCIA_MINUTOS} minutos.`,
      codigoDemostracion: envio.codigoVisible,
    }
  })
}

export async function confirmarCodigo(
  _previo: EstadoVerificacion,
  datos: FormData,
): Promise<EstadoVerificacion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró.' }

  const id = String(datos.get('ciudadanoId') ?? '')
  const codigo = String(datos.get('codigo') ?? '').trim()
  if (!/^\d{6}$/.test(codigo)) return { error: 'El código son seis dígitos.' }

  const r = await conTenant(tenant.id, async (tx) => {
    const [v] = await tx<
      { id: string; codigo_hash: string; intentos: number; vencido: boolean }[]
    >`
      select id, codigo_hash, intentos, (expira_en < now()) as vencido
      from verificaciones_telefono
      where ciudadano_id = ${id} and verificado_en is null
      for update`
    if (!v) return { error: 'No hay ningún código pendiente. Manda uno nuevo.' }
    if (v.vencido) return { error: 'Ese código ya venció. Manda uno nuevo.' }
    if (v.intentos >= MAXIMO_INTENTOS) {
      return { error: 'Demasiados intentos fallidos. Manda un código nuevo.' }
    }

    if (!(await bcrypt.compare(codigo, v.codigo_hash))) {
      await tx`update verificaciones_telefono set intentos = intentos + 1 where id = ${v.id}`
      return { error: `Ese código no es. Te quedan ${MAXIMO_INTENTOS - v.intentos - 1} intentos.` }
    }

    await tx`update verificaciones_telefono set verificado_en = now() where id = ${v.id}`
    await tx`update ciudadanos set telefono_verificado_en = now() where id = ${id}`
    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'verificacion', 'ciudadanos', ${id},
              ${tx.json({ medio: 'sms' })})`

    return { ok: true, mensaje: 'Teléfono verificado.' }
  })

  if (r.ok) revalidatePath(`/ciudadanos/${id}`)
  return r
}
