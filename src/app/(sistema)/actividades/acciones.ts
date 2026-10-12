'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'

export type EstadoAccion = { error?: string; ok?: boolean; id?: string; tipo?: string }

/**
 * Alta, edición y baja de actividades de campaña.
 *
 * Eventos y recorridos se guardan en tablas distintas porque el modelo
 * heredado así los separa, pero para quien captura son lo mismo con otro
 * nombre: una salida a territorio, con su fecha, su lugar y su gente. El
 * formulario es uno solo y el tipo decide a qué tabla va.
 *
 * La baja es lógica (`activo = false`): una actividad tiene peticiones
 * levantadas durante ella, y borrarla dejaría esas peticiones sin origen.
 */

/**
 * El formato se valida antes de llegar a Postgres. Un `::date` con basura
 * revienta la conexión con un 500 sin mensaje, y al usuario le queda una
 * pantalla muerta sin saber qué corregir.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}(:\d{2})?$/

const Actividad = z.object({
  tipo: z.enum(['evento', 'recorrido'], { message: 'Elige si es evento o recorrido' }),
  titulo: z.string().trim().min(3, 'El título es obligatorio'),
  descripcion: z.string().trim().optional(),
  fecha: z.string().trim().regex(FECHA, 'Captura una fecha válida'),
  horaInicia: z.string().trim().regex(HORA, 'La hora de inicio no es válida').or(z.literal('')).optional(),
  horaTermina: z.string().trim().regex(HORA, 'La hora de término no es válida').or(z.literal('')).optional(),
  lugar: z.string().trim().optional(),
  colonia: z.string().trim().optional(),
  municipioId: z.string().trim().optional(),
  seccionClave: z.string().trim().optional(),
  responsableId: z.string().trim().optional(),
  asistentesProgramados: z.string().trim().optional(),
  notas: z.string().trim().optional(),
})

const nulo = (v: string | undefined) => (v && v.length ? v : null)
const entero = (v: string | undefined) => {
  const n = Number(v)
  return v && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

/**
 * Fecha y hora juntas, en hora de México.
 *
 * Un texto casteado directo a `timestamptz` se interpreta como UTC y la
 * actividad aparece seis horas corrida. Hay que decir explícitamente en
 * qué zona se capturó.
 *
 * El `::text` antes del `::timestamp` no sobra: el driver infiere el tipo
 * del parámetro y manda la cadena como `timestamptz`, que Postgres ya
 * interpreta en la zona de la sesión. Entonces el `at time zone` convierte
 * por segunda vez y una captura de las 9:30 se guarda como las 21:30.
 * Forzándola a texto, el `::timestamp` la lee sin zona y la conversión
 * ocurre una sola vez.
 */

async function seccionDeClave(
  tx: Parameters<Parameters<typeof conTenant>[1]>[0],
  estadoId: string | null,
  clave: string | null,
) {
  if (!clave || !estadoId) return null
  const [s] = await tx<{ id: string }[]>`
    select id from secciones
    where clave = ${clave.padStart(4, '0')} and estado_id = ${estadoId}
    limit 1`
  return s?.id ?? null
}

export async function guardarActividad(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Actividad.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  const idExistente = datos.get('id')
  const editando = typeof idExistente === 'string' && z.string().uuid().safeParse(idExistente).success

  const id = await conTenant(tenant.id, async (tx) => {
    const seccionId = await seccionDeClave(tx, tenant.estado_id, nulo(d.seccionClave))

    const inicia = nulo(d.horaInicia)
      ? tx`(${d.fecha + ' ' + d.horaInicia}::text::timestamp at time zone 'America/Monterrey')`
      : tx`null`
    const termina = nulo(d.horaTermina)
      ? tx`(${d.fecha + ' ' + d.horaTermina}::text::timestamp at time zone 'America/Monterrey')`
      : tx`null`

    if (d.tipo === 'evento') {
      if (editando) {
        const filas = await tx<{ id: string }[]>`
          update eventos set
            titulo = ${d.titulo},
            descripcion = ${nulo(d.descripcion)},
            fecha_evento = ${d.fecha}::date,
            hora_inicia = ${inicia},
            hora_termina = ${termina},
            calle = ${nulo(d.lugar)},
            colonia = ${nulo(d.colonia)},
            municipio_id = ${nulo(d.municipioId)}::uuid,
            seccion_id = coalesce(${seccionId}::uuid, seccion_id),
            usuario_responsable_id = ${nulo(d.responsableId)}::uuid,
            asistentes_programados = ${entero(d.asistentesProgramados)},
            notas_adicionales = ${nulo(d.notas)},
            actualizado_en = now(),
            actualizado_por = ${sesion.usuarioId}
          where id = ${idExistente as string}
          returning id`
        return filas[0]?.id ?? null
      }
      const [nuevo] = await tx<{ id: string }[]>`
        insert into eventos
          (tenant_id, titulo, descripcion, fecha_evento, hora_inicia, hora_termina,
           calle, colonia, municipio_id, seccion_id, usuario_responsable_id,
           asistentes_programados, notas_adicionales, activo, creado_por)
        values (${tenant.id}, ${d.titulo}, ${nulo(d.descripcion)}, ${d.fecha}::date,
                ${inicia}, ${termina}, ${nulo(d.lugar)}, ${nulo(d.colonia)},
                ${nulo(d.municipioId)}::uuid, ${seccionId}::uuid,
                ${nulo(d.responsableId)}::uuid, ${entero(d.asistentesProgramados)},
                ${nulo(d.notas)}, true, ${sesion.usuarioId})
        returning id`
      return nuevo.id
    }

    if (editando) {
      const filas = await tx<{ id: string }[]>`
        update recorridos set
          titulo = ${d.titulo},
          descripcion = ${nulo(d.descripcion)},
          fecha_recorrido = ${d.fecha}::date,
          hora_inicia = ${inicia},
          hora_termina = ${termina},
          punto_inicia = ${nulo(d.lugar)},
          colonia = ${nulo(d.colonia)},
          municipio_id = ${nulo(d.municipioId)}::uuid,
          seccion_id = coalesce(${seccionId}::uuid, seccion_id),
          usuario_responsable_id = ${nulo(d.responsableId)}::uuid,
          asistentes_programados = ${entero(d.asistentesProgramados)},
          notas_adicionales = ${nulo(d.notas)},
          actualizado_en = now(),
          actualizado_por = ${sesion.usuarioId}
        where id = ${idExistente as string}
        returning id`
      return filas[0]?.id ?? null
    }

    const [nuevo] = await tx<{ id: string }[]>`
      insert into recorridos
        (tenant_id, titulo, descripcion, fecha_recorrido, hora_inicia, hora_termina,
         punto_inicia, colonia, municipio_id, seccion_id, usuario_responsable_id,
         asistentes_programados, notas_adicionales, activo, creado_por)
      values (${tenant.id}, ${d.titulo}, ${nulo(d.descripcion)}, ${d.fecha}::date,
              ${inicia}, ${termina}, ${nulo(d.lugar)}, ${nulo(d.colonia)},
              ${nulo(d.municipioId)}::uuid, ${seccionId}::uuid,
              ${nulo(d.responsableId)}::uuid, ${entero(d.asistentesProgramados)},
              ${nulo(d.notas)}, true, ${sesion.usuarioId})
      returning id`
    return nuevo.id
  })

  if (!id) return { error: 'No se encontró esa actividad' }

  await conTenant(tenant.id, (tx) =>
    tx`insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
       values (${tenant.id}, ${sesion.usuarioId}, ${editando ? 'cambio' : 'alta'},
               ${d.tipo === 'evento' ? 'eventos' : 'recorridos'}, ${id},
               ${tx.json({ titulo: d.titulo })})`,
  )

  revalidatePath('/actividades')
  revalidatePath(`/actividades/${d.tipo}/${id}`)
  return { ok: true, id, tipo: d.tipo }
}

export async function cambiarBajaActividad(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const id = datos.get('id')
  const tipo = datos.get('tipo')
  if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
    return { error: 'No se pudo identificar la actividad' }
  }
  if (tipo !== 'evento' && tipo !== 'recorrido') return { error: 'Tipo de actividad desconocido' }

  const alta = datos.get('alta') === 'si'

  const hecho = await conTenant(tenant.id, async (tx) => {
    const filas =
      tipo === 'evento'
        ? await tx`update eventos set activo = ${alta}, actualizado_en = now(),
                     actualizado_por = ${sesion.usuarioId} where id = ${id} returning id`
        : await tx`update recorridos set activo = ${alta}, actualizado_en = now(),
                     actualizado_por = ${sesion.usuarioId} where id = ${id} returning id`

    if (filas.length === 0) return false

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, ${alta ? 'alta' : 'baja'},
              ${tipo === 'evento' ? 'eventos' : 'recorridos'}, ${id}, ${tx.json({ alta })})`

    return true
  })

  if (!hecho) return { error: 'No se encontró esa actividad' }

  revalidatePath('/actividades')
  revalidatePath(`/actividades/${tipo}/${id}`)
  return { ok: true, id, tipo }
}
