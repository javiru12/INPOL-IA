'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'

export type EstadoAccion = { error?: string; ok?: boolean; id?: string }

/**
 * Alta, edición y baja de ciudadanos.
 *
 * Hasta ahora solo se podía dar de alta a alguien de paso, al capturar una
 * petición. Quien ya estaba en el padrón no se podía corregir: un teléfono
 * mal tecleado se quedaba mal para siempre.
 *
 * La baja es lógica (`activo = false`), nunca un borrado: un ciudadano
 * tiene peticiones colgando y borrarlo se llevaría su historial. Dejar de
 * aparecer en el padrón y desaparecer del expediente no son lo mismo.
 */

/**
 * Una fecha con basura llega a `::date` y revienta la conexión con un 500
 * sin mensaje: hay que cortarla antes, con un error que diga qué pasó.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/

const Persona = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio'),
  apellidoPaterno: z.string().trim().optional(),
  apellidoMaterno: z.string().trim().optional(),
  sexo: z.enum(['H', 'M', '']).optional(),
  fechaNacimiento: z
    .string()
    .trim()
    .regex(FECHA, 'La fecha de nacimiento no es válida')
    .or(z.literal(''))
    .optional(),
  telefonoMovil: z.string().trim().optional(),
  telefonoFijo: z.string().trim().optional(),
  correo: z.string().trim().email('El correo no tiene un formato válido').or(z.literal('')).optional(),
  calle: z.string().trim().optional(),
  numeroExt: z.string().trim().optional(),
  numeroInt: z.string().trim().optional(),
  colonia: z.string().trim().optional(),
  codigoPostal: z.string().trim().optional(),
  municipioId: z.string().trim().optional(),
  seccionClave: z.string().trim().optional(),
  // La CURP se valida con su estructura, no solo por largo: una cadena
  // de 18 caracteres cualesquiera no cruza contra nada y el error se
  // descubriría hasta que alguien busque a esa persona y no aparezca.
  curp: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/, 'La CURP no tiene la estructura correcta')
    .or(z.literal(''))
    .optional(),
  discapacidad: z.literal('si').optional(),
  tipoDiscapacidad: z.string().trim().optional(),
})

const vacioANulo = (v: string | undefined) => (v && v.length ? v : null)

/**
 * La sección se captura por su clave (cuatro dígitos), no por un selector
 * de 2,602 opciones. Se resuelve contra el catálogo del estado del cliente:
 * una clave de otro estado no debe poder asignarse.
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

export async function crearCiudadano(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Persona.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  const completo = [d.nombre, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ')

  const id = await conTenant(tenant.id, async (tx) => {
    const seccionId = await seccionDeClave(tx, tenant.estado_id, vacioANulo(d.seccionClave))

    const [nuevo] = await tx<{ id: string }[]>`
      insert into ciudadanos
        (tenant_id, nombre, apellido_paterno, apellido_materno, nombre_completo,
         sexo, fecha_nacimiento, telefono_movil, telefono_fijo, correo,
         calle, numero_ext, numero_int, colonia, codigo_postal,
         municipio_id, seccion_id, estado_id, origen, creado_por,
         curp, discapacidad, tipo_discapacidad, adulto_mayor)
      values (${tenant.id}, ${d.nombre}, ${vacioANulo(d.apellidoPaterno)},
              ${vacioANulo(d.apellidoMaterno)}, ${completo},
              ${vacioANulo(d.sexo)}, ${vacioANulo(d.fechaNacimiento)}::date,
              ${vacioANulo(d.telefonoMovil)}, ${vacioANulo(d.telefonoFijo)},
              ${vacioANulo(d.correo)}, ${vacioANulo(d.calle)},
              ${vacioANulo(d.numeroExt)}, ${vacioANulo(d.numeroInt)},
              ${vacioANulo(d.colonia)}, ${vacioANulo(d.codigoPostal)},
              ${vacioANulo(d.municipioId)}::uuid, ${seccionId}::uuid,
              ${tenant.estado_id}::uuid, 'captura', ${sesion.usuarioId},
              ${vacioANulo(d.curp)}, ${d.discapacidad === 'si'},
              ${vacioANulo(d.tipoDiscapacidad)},
              -- Adulto mayor se deduce, no se captura: dos verdades
              -- sobre lo mismo acaban por no coincidir.
              coalesce(${vacioANulo(d.fechaNacimiento)}::date
                       <= current_date - interval '65 years', false))
      returning id`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'ciudadanos', ${nuevo.id},
              ${tx.json({ nombre: completo })})`

    return nuevo.id
  })

  revalidatePath('/ciudadanos')
  return { ok: true, id }
}

export async function editarCiudadano(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const id = datos.get('id')
  if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
    return { error: 'No se pudo identificar a la persona' }
  }

  const analisis = Persona.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  const completo = [d.nombre, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ')

  const cambio = await conTenant(tenant.id, async (tx) => {
    const seccionId = await seccionDeClave(tx, tenant.estado_id, vacioANulo(d.seccionClave))

    // RLS se encarga de que no se pueda tocar a alguien de otro cliente:
    // la fila sencillamente no existe para esta conexión.
    const filas = await tx`
      update ciudadanos set
        nombre = ${d.nombre},
        apellido_paterno = ${vacioANulo(d.apellidoPaterno)},
        apellido_materno = ${vacioANulo(d.apellidoMaterno)},
        nombre_completo = ${completo},
        sexo = ${vacioANulo(d.sexo)},
        fecha_nacimiento = ${vacioANulo(d.fechaNacimiento)}::date,
        telefono_movil = ${vacioANulo(d.telefonoMovil)},
        telefono_fijo = ${vacioANulo(d.telefonoFijo)},
        correo = ${vacioANulo(d.correo)},
        calle = ${vacioANulo(d.calle)},
        numero_ext = ${vacioANulo(d.numeroExt)},
        numero_int = ${vacioANulo(d.numeroInt)},
        colonia = ${vacioANulo(d.colonia)},
        codigo_postal = ${vacioANulo(d.codigoPostal)},
        municipio_id = ${vacioANulo(d.municipioId)}::uuid,
        seccion_id = coalesce(${seccionId}::uuid, seccion_id),
        curp = ${vacioANulo(d.curp)},
        discapacidad = ${d.discapacidad === 'si'},
        tipo_discapacidad = ${vacioANulo(d.tipoDiscapacidad)},
        adulto_mayor = coalesce(${vacioANulo(d.fechaNacimiento)}::date
                                <= current_date - interval '65 years', false),
        actualizado_en = now(),
        actualizado_por = ${sesion.usuarioId}
      where id = ${id}
      returning id`

    if (filas.length === 0) return false

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'cambio', 'ciudadanos', ${id},
              ${tx.json({ nombre: completo })})`

    return true
  })

  if (!cambio) return { error: 'No se encontró a esa persona' }

  revalidatePath('/ciudadanos')
  revalidatePath(`/ciudadanos/${id}`)
  return { ok: true, id }
}

export async function cambiarBajaCiudadano(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const id = datos.get('id')
  if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
    return { error: 'No se pudo identificar a la persona' }
  }
  const alta = datos.get('alta') === 'si'

  const hecho = await conTenant(tenant.id, async (tx) => {
    const filas = await tx<{ nombre_completo: string | null }[]>`
      update ciudadanos
         set activo = ${alta}, actualizado_en = now(), actualizado_por = ${sesion.usuarioId}
       where id = ${id}
      returning nombre_completo`

    if (filas.length === 0) return false

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, ${alta ? 'alta' : 'baja'}, 'ciudadanos',
              ${id}, ${tx.json({ nombre: filas[0].nombre_completo })})`

    return true
  })

  if (!hecho) return { error: 'No se encontró a esa persona' }

  revalidatePath('/ciudadanos')
  revalidatePath(`/ciudadanos/${id}`)
  return { ok: true, id }
}
