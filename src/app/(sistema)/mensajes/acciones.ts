'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puede } from '@/lib/permisos'

export type EstadoAccion = { error?: string; ok?: boolean }

/**
 * El encabezado vive en el layout: si no se revalida la raíz, el
 * contador de la campana se queda con la cifra de hace un rato.
 */
function refrescarEncabezado() {
  revalidatePath('/', 'layout')
}

const Nuevo = z.object({
  destinatarioId: z.string().uuid({ message: 'Elige a quién le escribes' }),
  peticionId: z.string().uuid().optional().or(z.literal('')),
  asunto: z.string().trim().min(3, 'Ponle un asunto, aunque sea corto'),
  cuerpo: z.string().trim().min(3, 'Escribe el mensaje'),
})

export async function enviarMensaje(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }
  if (!(await puede('mensajes.responder_mensajes'))) {
    return { error: 'Tu perfil no puede enviar mensajes.' }
  }

  const analisis = Nuevo.safeParse({
    destinatarioId: datos.get('destinatarioId'),
    peticionId: datos.get('peticionId'),
    asunto: datos.get('asunto'),
    cuerpo: datos.get('cuerpo'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0].message }

  const { destinatarioId, peticionId, asunto, cuerpo } = analisis.data
  if (destinatarioId === sesion.usuarioId) {
    return { error: 'No puedes escribirte a ti mismo.' }
  }

  let destino: string | null = null

  const problema = await conTenant(tenant.id, async (tx) => {
    // RLS solo deja ver usuarios de este cliente: si la consulta no
    // encuentra a la persona, es de otra plaza o no existe. Sin esta
    // comprobación la llave foránea sí aceptaría un id ajeno.
    const [persona] = await tx<{ id: string }[]>`
      select id from usuarios where id = ${destinatarioId} and activo`
    if (!persona) return 'Esa persona no es de este cliente.'

    if (peticionId) {
      const [peticion] = await tx<{ id: string }[]>`
        select id from peticiones where id = ${peticionId} and activo`
      if (!peticion) return 'Esa petición no es de este cliente.'
    }

    const [hilo] = await tx<{ id: string }[]>`
      insert into mensaje_hilos
        (tenant_id, peticion_id, asunto, iniciador_id, receptor_id, ultimo_en, creado_por)
      values (${tenant.id}, ${peticionId || null}, ${asunto}, ${sesion.usuarioId},
              ${destinatarioId}, now(), ${sesion.usuarioId})
      returning id`

    await tx`
      insert into mensajes
        (tenant_id, hilo_id, autor_id, destinatario_id, cuerpo, creado_por)
      values (${tenant.id}, ${hilo.id}, ${sesion.usuarioId}, ${destinatarioId},
              ${cuerpo}, ${sesion.usuarioId})`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'mensajes', ${hilo.id},
              ${tx.json({ destinatarioId, peticionId: peticionId || null })})`

    destino = hilo.id
    return null
  })

  if (problema) return { error: problema }

  revalidatePath('/mensajes')
  if (peticionId) revalidatePath(`/peticiones/${peticionId}`)
  refrescarEncabezado()
  if (destino) redirect(`/mensajes/${destino}`)
  return { ok: true }
}

const Respuesta = z.object({
  hiloId: z.string().uuid(),
  cuerpo: z.string().trim().min(2, 'Escribe la respuesta'),
})

export async function responderHilo(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }
  if (!(await puede('mensajes.responder_mensajes'))) {
    return { error: 'Tu perfil no puede responder mensajes.' }
  }

  const analisis = Respuesta.safeParse({
    hiloId: datos.get('hiloId'),
    cuerpo: datos.get('cuerpo'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0].message }

  const { hiloId, cuerpo } = analisis.data

  const problema = await conTenant(tenant.id, async (tx) => {
    // Quien no es parte de la conversación no la contesta, aunque
    // conozca el identificador.
    const [hilo] = await tx<{ id: string; otro: string; peticion_id: string | null }[]>`
      select h.id,
             case when h.iniciador_id = ${sesion.usuarioId}
                  then h.receptor_id else h.iniciador_id end as otro,
             h.peticion_id
      from mensaje_hilos h
      where h.id = ${hiloId} and h.activo
        and (h.iniciador_id = ${sesion.usuarioId} or h.receptor_id = ${sesion.usuarioId})`
    if (!hilo) return 'Esa conversación no está disponible.'

    await tx`
      insert into mensajes
        (tenant_id, hilo_id, autor_id, destinatario_id, cuerpo, creado_por)
      values (${tenant.id}, ${hiloId}, ${sesion.usuarioId}, ${hilo.otro},
              ${cuerpo}, ${sesion.usuarioId})`

    // Contestar también es leer: lo que me habían mandado queda visto.
    await tx`
      update mensajes set leido_en = now()
      where hilo_id = ${hiloId} and destinatario_id = ${sesion.usuarioId}
        and leido_en is null`

    await tx`
      update mensaje_hilos
      set ultimo_en = now(), archivado_en = null, archivado_por = null
      where id = ${hiloId}`

    return null
  })

  if (problema) return { error: problema }

  revalidatePath(`/mensajes/${hiloId}`)
  revalidatePath('/mensajes')
  refrescarEncabezado()
  return { ok: true }
}

/** Al abrir el hilo, lo que me mandaron queda leído. */
export async function marcarLeido(hiloId: string): Promise<void> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return

  await conTenant(tenant.id, (tx) =>
    tx`
      update mensajes m set leido_en = now()
      from mensaje_hilos h
      where h.id = m.hilo_id and m.hilo_id = ${hiloId}
        and m.destinatario_id = ${sesion.usuarioId} and m.leido_en is null
        and (h.iniciador_id = ${sesion.usuarioId} or h.receptor_id = ${sesion.usuarioId})`,
  )

  revalidatePath(`/mensajes/${hiloId}`)
  revalidatePath('/mensajes')
  refrescarEncabezado()
}

const Archivar = z.object({
  hiloId: z.string().uuid(),
  archivar: z.enum(['si', 'no']),
})

/**
 * Archivar, nunca borrar. Es comunicación de trabajo sobre expedientes
 * ciudadanos: sale de la bandeja, se queda en el expediente.
 */
export async function archivarHilo(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Archivar.safeParse({
    hiloId: datos.get('hiloId'),
    archivar: datos.get('archivar'),
  })
  if (!analisis.success) return { error: 'No se pudo archivar la conversación.' }

  const { hiloId, archivar } = analisis.data

  await conTenant(tenant.id, (tx) =>
    tx`
      update mensaje_hilos
      set archivado_en = ${archivar === 'si' ? new Date() : null},
          archivado_por = ${archivar === 'si' ? sesion.usuarioId : null}
      where id = ${hiloId} and activo
        and (iniciador_id = ${sesion.usuarioId} or receptor_id = ${sesion.usuarioId})`,
  )

  revalidatePath(`/mensajes/${hiloId}`)
  revalidatePath('/mensajes')
  refrescarEncabezado()
  return { ok: true }
}
