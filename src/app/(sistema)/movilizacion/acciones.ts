'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { ESTADOS } from './consultas'

export type EstadoAccion = { error?: string; ok?: boolean; mensaje?: string }

const EXPIRO = { error: 'La sesión expiró. Vuelve a entrar.' }

// ------------------------------------------------------------------
// 1 · Marcar a un ciudadano como movilizador
// ------------------------------------------------------------------
const Alta = z.object({
  ciudadanoId: z.string().uuid({ message: 'Elige a la persona del padrón' }),
  meta: z.coerce
    .number()
    .int('La meta va en personas enteras')
    .min(1, 'La meta tiene que ser de al menos una persona')
    .max(500, 'Una meta de más de 500 personas no es creíble'),
  tipoId: z.string().uuid().optional().or(z.literal('')),
  responsableId: z.string().uuid().optional().or(z.literal('')),
})

/**
 * No da de alta a nadie nuevo: toma a alguien que ya está en el padrón y
 * lo marca como movilizador. El padrón no se duplica, que es justo lo
 * que hacía el modelo heredado.
 */
export async function marcarComoMovilizador(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return EXPIRO

  const analisis = Alta.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  const resultado = await conTenant(tenant.id, async (tx) => {
    // RLS ya impide ver ciudadanos de otro cliente; esta consulta sirve
    // para avisar con un mensaje claro en vez de fallar por la foránea.
    const [persona] = await tx<{ id: string; colonia: string | null }[]>`
      select id, colonia from ciudadanos where id = ${d.ciudadanoId} and activo = true`
    if (!persona) return { error: 'Esa persona no está en el padrón de esta plaza' }

    const [repetido] = await tx<{ id: string }[]>`
      select id from movilizadores where ciudadano_id = ${d.ciudadanoId} and activo = true`
    if (repetido) return { error: 'Esa persona ya está dada de alta como movilizador' }

    const [movilizador] = await tx<{ id: string }[]>`
      insert into movilizadores
        (tenant_id, ciudadano_id, meta, tipo_movilizador_id, responsable_id, colonia, creado_por)
      values (${tenant.id}, ${d.ciudadanoId}, ${d.meta}, ${d.tipoId || null},
              ${d.responsableId || null}, ${persona.colonia}, ${sesion.usuarioId})
      returning id`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'movilizadores', ${movilizador.id},
              ${tx.json({ ciudadanoId: d.ciudadanoId, meta: d.meta })})`

    return { ok: true as const, id: movilizador.id }
  })

  if ('error' in resultado) return resultado

  revalidatePath('/movilizacion')
  return { ok: true, mensaje: 'Movilizador dado de alta con su meta.' }
}

// ------------------------------------------------------------------
// 2 · Asignar un ciudadano a un movilizador
// ------------------------------------------------------------------
const Asignacion = z.object({
  movilizadorId: z.string().uuid(),
  ciudadanoId: z.string().uuid({ message: 'Elige a la persona del padrón' }),
})

export async function asignarPromovido(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return EXPIRO

  const analisis = Asignacion.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const { movilizadorId, ciudadanoId } = analisis.data

  const resultado = await conTenant(tenant.id, async (tx) => {
    const [movilizador] = await tx<{ id: string }[]>`
      select id from movilizadores where id = ${movilizadorId} and activo = true`
    if (!movilizador) return { error: 'Ese movilizador no existe en esta plaza' }

    // Un ciudadano responde a un solo movilizador: si lo registran dos, la
    // meta se cuenta dos veces y el avance de la campaña sale inflado.
    const [ocupado] = await tx<{ nombre: string | null }[]>`
      select coalesce(nullif(trim(c.nombre_completo), ''),
             concat_ws(' ', c.nombre, c.apellido_paterno)) as nombre
      from promovidos p
      join movilizadores m on m.id = p.movilizador_id
      join ciudadanos c on c.id = m.ciudadano_id
      where p.ciudadano_id = ${ciudadanoId}`
    if (ocupado) {
      return { error: `Esa persona ya la lleva ${ocupado.nombre ?? 'otro movilizador'}` }
    }

    const [promovido] = await tx<{ id: string }[]>`
      insert into promovidos
        (tenant_id, movilizador_id, ciudadano_id, estado, creado_por)
      values (${tenant.id}, ${movilizadorId}, ${ciudadanoId}, 'prospecto', ${sesion.usuarioId})
      returning id`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'promovidos', ${promovido.id},
              ${tx.json({ movilizadorId, ciudadanoId })})`

    return { ok: true as const }
  })

  if ('error' in resultado) return resultado

  revalidatePath(`/movilizacion/${movilizadorId}`)
  revalidatePath('/movilizacion')
  return { ok: true, mensaje: 'Persona asignada como prospecto.' }
}

// ------------------------------------------------------------------
// 3 · Mover a un promovido por el embudo
// ------------------------------------------------------------------
const Cambio = z.object({
  promovidoId: z.string().uuid(),
  estado: z.enum(ESTADOS),
})

export async function cambiarEstadoProspeccion(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return EXPIRO

  const analisis = Cambio.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: 'Elige un estado válido de prospección' }
  const { promovidoId, estado } = analisis.data

  const movilizadorId = await conTenant(tenant.id, async (tx) => {
    const [antes] = await tx<{ estado: string; movilizador_id: string }[]>`
      select estado, movilizador_id from promovidos where id = ${promovidoId}`
    if (!antes) return null

    // Las fechas del embudo se sellan al pasar por cada escalón y no se
    // borran al retroceder: el historial de cuándo se logró qué es parte
    // del expediente, no un reflejo del estado actual.
    await tx`
      update promovidos
      set estado = ${estado},
          fecha_contacto = case when ${estado} <> 'prospecto'
                                then coalesce(fecha_contacto, current_date) end,
          fecha_compromiso = case when ${estado} in ('comprometido','confirmado')
                                  then coalesce(fecha_compromiso, current_date)
                                  else fecha_compromiso end,
          fecha_confirmacion = case when ${estado} = 'confirmado'
                                    then coalesce(fecha_confirmacion, current_date)
                                    else fecha_confirmacion end,
          actualizado_por = ${sesion.usuarioId}
      where id = ${promovidoId}`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'cambio', 'promovidos', ${promovidoId},
              ${tx.json({ de: antes.estado, a: estado })})`

    return antes.movilizador_id
  })

  if (!movilizadorId) return { error: 'Ese registro ya no existe' }

  revalidatePath(`/movilizacion/${movilizadorId}`)
  revalidatePath('/movilizacion')
  return { ok: true }
}

// ------------------------------------------------------------------
// Autocompletado: a quién se puede marcar o asignar
// ------------------------------------------------------------------
export type Candidato = {
  id: string
  nombre: string
  colonia: string | null
  seccion: string | null
  telefono: string | null
}

/**
 * Busca en el padrón a quien todavía no está en la red: ni movilizador ni
 * promovido de nadie. Ofrecer a alguien que ya está asignado solo sirve
 * para que la acción falle después.
 */
export async function buscarDisponibles(termino: string): Promise<Candidato[]> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant || termino.trim().length < 2) return []
  const como = `%${termino.trim()}%`

  return conTenant(tenant.id, (tx) =>
    tx<Candidato[]>`
      select c.id,
             coalesce(
               nullif(trim(c.nombre_completo), ''),
               nullif(trim(concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)), ''),
               'Sin nombre') as nombre,
             c.colonia,
             s.clave as seccion,
             c.telefono_movil as telefono
      from ciudadanos c
      left join secciones s on s.id = c.seccion_id
      where c.activo = true
        and (coalesce(c.nombre_completo,
               concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)) ilike ${como}
             or c.telefono_movil ilike ${como})
        and not exists (
          select 1 from movilizadores m
          where m.ciudadano_id = c.id and m.activo = true)
        and not exists (
          select 1 from promovidos p where p.ciudadano_id = c.id)
      order by nombre
      limit 8`,
  )
}
