'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { guardar } from '@/lib/almacen'

const Seguimiento = z.object({
  peticionId: z.string().uuid(),
  tipo: z.enum(['nota', 'llamada', 'visita']),
  detalle: z.string().trim().min(3, 'Escribe al menos unas palabras'),
})

export type EstadoAccion = { error?: string; ok?: boolean }

export async function agregarSeguimiento(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Seguimiento.safeParse({
    peticionId: datos.get('peticionId'),
    tipo: datos.get('tipo'),
    detalle: datos.get('detalle'),
  })
  if (!analisis.success) return { error: analisis.error.issues[0].message }

  const { peticionId, tipo, detalle } = analisis.data

  await conTenant(tenant.id, async (tx) => {
    // RLS garantiza que la petición sea de este cliente: si no lo fuera,
    // la inserción no encontraría la fila a la que referirse.
    await tx`
      insert into peticion_seguimientos (tenant_id, peticion_id, usuario_id, tipo, detalle)
      values (${tenant.id}, ${peticionId}, ${sesion.usuarioId}, ${tipo}, ${detalle})`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'cambio', 'peticiones', ${peticionId},
              ${tx.json({ tipo })})`
  })

  revalidatePath(`/peticiones/${peticionId}`)
  return { ok: true }
}

const CambioEstatus = z.object({
  peticionId: z.string().uuid(),
  estatusId: z.string().uuid(),
})

export async function cambiarEstatus(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = CambioEstatus.safeParse({
    peticionId: datos.get('peticionId'),
    estatusId: datos.get('estatusId'),
  })
  if (!analisis.success) return { error: 'Selecciona un estatus válido' }

  const { peticionId, estatusId } = analisis.data

  await conTenant(tenant.id, async (tx) => {
    const [antes] = await tx<{ estatus: string | null }[]>`
      select e.descripcion as estatus
      from peticiones p
      left join estatus_peticiones e on e.id = p.estatus_id
      where p.id = ${peticionId}`

    const [despues] = await tx<{ descripcion: string }[]>`
      select descripcion from estatus_peticiones where id = ${estatusId}`

    if (!despues) return

    await tx`
      update peticiones
      set estatus_id = ${estatusId},
          fecha_cierre = case when ${despues.descripcion} = 'Completada'
                              then coalesce(fecha_cierre, now()) else null end
      where id = ${peticionId}`

    await tx`
      insert into peticion_seguimientos
        (tenant_id, peticion_id, usuario_id, tipo, detalle, estatus_anterior, estatus_nuevo)
      values (${tenant.id}, ${peticionId}, ${sesion.usuarioId}, 'cambio_estatus',
              ${`Cambió el estatus a «${despues.descripcion}»`},
              ${antes?.estatus ?? null}, ${despues.descripcion})`
  })

  revalidatePath(`/peticiones/${peticionId}`)
  revalidatePath('/peticiones')
  return { ok: true }
}

const NuevaPeticion = z.object({
  ciudadanoId: z.string().uuid().optional().or(z.literal('')),
  nombre: z.string().trim().optional(),
  apellidoPaterno: z.string().trim().optional(),
  apellidoMaterno: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  colonia: z.string().trim().optional(),
  problematicaId: z.string().uuid({ message: 'Elige una problemática' }),
  subproblematicaId: z.string().uuid().optional().or(z.literal('')),
  prioridadId: z.string().uuid({ message: 'Elige una prioridad' }),
  fuenteId: z.string().uuid().optional().or(z.literal('')),
  dependenciaId: z.string().uuid().optional().or(z.literal('')),
  descripcion: z.string().trim().min(10, 'Describe la petición con un poco más de detalle'),
})

export async function crearPeticion(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = NuevaPeticion.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  if (!d.ciudadanoId && !d.nombre) {
    return { error: 'Busca al ciudadano o captura su nombre' }
  }

  let destino: string | null = null

  await conTenant(tenant.id, async (tx) => {
    let ciudadanoId = d.ciudadanoId || null

    if (!ciudadanoId) {
      const completo = [d.nombre, d.apellidoPaterno, d.apellidoMaterno]
        .filter(Boolean)
        .join(' ')
      const [nuevo] = await tx<{ id: string }[]>`
        insert into ciudadanos
          (tenant_id, nombre, apellido_paterno, apellido_materno, nombre_completo,
           telefono_movil, colonia, creado_por)
        values (${tenant.id}, ${d.nombre ?? ''}, ${d.apellidoPaterno || null},
                ${d.apellidoMaterno || null}, ${completo}, ${d.telefono || null},
                ${d.colonia || null}, ${sesion.usuarioId})
        returning id`
      ciudadanoId = nuevo.id
    }

    // Toda petición nueva entra como «Abierta»: el estatus lo mueve quien
    // la trabaja, no quien la captura.
    const [abierta] = await tx<{ id: string }[]>`
      select id from estatus_peticiones where descripcion = 'Abierta' limit 1`

    const [peticion] = await tx<{ id: string }[]>`
      insert into peticiones
        (tenant_id, ciudadano_id, problematica_id, subproblematica_id, descripcion,
         fecha_apertura, fuente_id, dependencia_id, estatus_id, prioridad_id,
         seccion_id, creado_por)
      values (${tenant.id}, ${ciudadanoId}, ${d.problematicaId},
              ${d.subproblematicaId || null}, ${d.descripcion}, now(),
              ${d.fuenteId || null}, ${d.dependenciaId || null},
              ${abierta?.id ?? null}, ${d.prioridadId},
              (select seccion_id from ciudadanos where id = ${ciudadanoId}),
              ${sesion.usuarioId})
      returning id`

    await tx`
      insert into peticion_seguimientos (tenant_id, peticion_id, usuario_id, tipo, detalle)
      values (${tenant.id}, ${peticion.id}, ${sesion.usuarioId}, 'nota',
              'Petición capturada en el sistema')`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'peticiones', ${peticion.id})`

    destino = peticion.id
  })

  revalidatePath('/peticiones')
  if (destino) redirect(`/peticiones/${destino}`)
  return { ok: true }
}

/** Autocompletado del buscador de ciudadanos al capturar una petición. */
export async function buscarCiudadanos(termino: string) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant || termino.trim().length < 2) return []

  return conTenant(tenant.id, (tx) =>
    tx<{ id: string; nombre: string; colonia: string | null; telefono: string | null }[]>`
      select id,
             coalesce(nombre_completo, concat_ws(' ', nombre, apellido_paterno)) as nombre,
             colonia,
             telefono_movil as telefono
      from ciudadanos
      where coalesce(nombre_completo, concat_ws(' ', nombre, apellido_paterno))
              ilike ${'%' + termino.trim() + '%'}
         or telefono_movil ilike ${'%' + termino.trim() + '%'}
      order by nombre
      limit 8`,
  )
}

const Adjunto = z.object({
  peticionId: z.string().uuid(),
  momento: z.enum(['reporte', 'evidencia', 'resultado']),
  descripcion: z.string().trim().max(300).optional(),
})

export async function subirAdjunto(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Adjunto.safeParse({
    peticionId: datos.get('peticionId'),
    momento: datos.get('momento'),
    descripcion: datos.get('descripcion') || undefined,
  })
  if (!analisis.success) return { error: analisis.error.issues[0].message }

  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Elige un archivo' }
  }

  const { peticionId, momento, descripcion } = analisis.data

  // La petición tiene que ser de este cliente: RLS lo garantiza, pero se
  // comprueba antes para no dejar un archivo huérfano en el disco.
  const existe = await conTenant(tenant.id, async (tx) => {
    const [p] = await tx<{ id: string }[]>`select id from peticiones where id = ${peticionId}`
    return Boolean(p)
  })
  if (!existe) return { error: 'Esa petición no existe' }

  const guardado = await guardar(tenant.clave, peticionId, archivo)
  if (!guardado.ok) return { error: guardado.error }

  await conTenant(tenant.id, async (tx) => {
    await tx`
      insert into adjuntos
        (tenant_id, peticion_id, usuario_id, clase, momento,
         nombre_original, tipo_mime, bytes, ruta, descripcion, creado_por)
      values (${tenant.id}, ${peticionId}, ${sesion.usuarioId}, ${guardado.clase},
              ${momento}, ${archivo.name}, ${guardado.tipoMime}, ${guardado.bytes},
              ${guardado.ruta}, ${descripcion ?? null}, ${sesion.usuarioId})`

    await tx`
      insert into peticion_seguimientos (tenant_id, peticion_id, usuario_id, tipo, detalle)
      values (${tenant.id}, ${peticionId}, ${sesion.usuarioId}, 'adjunto',
              ${`Adjuntó ${guardado.clase === 'foto' ? 'una foto' : `un ${guardado.clase}`}${descripcion ? `: ${descripcion}` : ''}`})`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'adjuntos', ${peticionId},
              ${tx.json({ clase: guardado.clase, bytes: guardado.bytes, momento })})`
  })

  revalidatePath(`/peticiones/${peticionId}`)
  return { ok: true }
}

export async function quitarAdjunto(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const id = String(datos.get('adjuntoId') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Adjunto no válido' }

  const peticionId = await conTenant(tenant.id, async (tx) => {
    // Baja lógica: el archivo se conserva. Es evidencia de una gestión
    // pública y borrarlo del disco deja la bitácora apuntando al vacío.
    const [a] = await tx<{ peticion_id: string }[]>`
      update adjuntos set activo = false
      where id = ${id} and activo
      returning peticion_id`

    if (a) {
      await tx`
        insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id)
        values (${tenant.id}, ${sesion.usuarioId}, 'baja', 'adjuntos', ${id}::uuid)`
    }
    return a?.peticion_id ?? null
  })

  if (!peticionId) return { error: 'No encontramos ese adjunto' }
  revalidatePath(`/peticiones/${peticionId}`)
  return { ok: true }
}
