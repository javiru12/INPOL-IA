'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'

export type EstadoAccion = { error?: string; ok?: boolean }

/**
 * A quién responde cada quien.
 *
 * La base ya impide los círculos con un disparador, así que aquí no se
 * repite esa comprobación: se deja que falle y se traduce el error a algo
 * que una persona entienda. Duplicar la regla en dos sitios garantiza que
 * un día digan cosas distintas.
 */
export async function asignarResponsable(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const usuarioId = datos.get('usuarioId')
  const responsableCrudo = datos.get('responsableId')

  if (typeof usuarioId !== 'string' || !z.string().uuid().safeParse(usuarioId).success) {
    return { error: 'No se pudo identificar a la persona' }
  }

  const responsableId =
    typeof responsableCrudo === 'string' && z.string().uuid().safeParse(responsableCrudo).success
      ? responsableCrudo
      : null

  if (responsableId === usuarioId) {
    return { error: 'Nadie puede ser su propio responsable' }
  }

  try {
    const hecho = await conTenant(tenant.id, async (tx) => {
      const filas = await tx`
        update usuarios
           set usuario_responsable_id = ${responsableId},
               actualizado_en = now()
         where id = ${usuarioId}
        returning id`

      if (filas.length === 0) return false

      await tx`
        insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
        values (${tenant.id}, ${sesion.usuarioId}, 'cambio', 'usuarios', ${usuarioId},
                ${tx.json({ responsable: responsableId })})`

      return true
    })

    if (!hecho) return { error: 'No se encontró a esa persona' }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : ''
    if (mensaje.includes('círculo')) {
      return {
        error: 'No se puede: esa persona ya está por encima en la cadena de mando',
      }
    }
    return { error: 'No se pudo guardar el cambio' }
  }

  revalidatePath('/estructura')
  return { ok: true }
}
