'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { conTenant, sinTenant, type Sql } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { permisosDelUsuario } from '@/lib/permisos'
import {
  CATALOGOS,
  CLAVES_CATALOGO,
  ESTATUS_RESERVADOS,
  PERFILES_ADMIN,
  PERFIL_MAXIMO,
  PERMISOS,
  alcanza,
  columnaNombre,
  type ClaveCatalogo,
  type DefinicionCatalogo,
} from './catalogo'

export type EstadoAccion = { error?: string; ok?: boolean; mensaje?: string }

// --- Andamiaje compartido ----------------------------------------------

type Contexto = { tenantId: string; usuarioId: string; perfil: string }

/**
 * Quién hace el cambio, sobre qué cliente y si le alcanza el permiso.
 *
 * El `tenant_id` sale de aquí —del subdominio o la cookie de plaza,
 * cruzado contra la sesión— y nunca de un campo del formulario. Un campo
 * oculto con el id de otro cliente no tendría ningún efecto: ni siquiera
 * se lee.
 */
async function contexto(requeridos: readonly string[]) {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' } as const

  // La sesión se emitió para otro cliente: aquí no vale.
  if (sesion.tenantId !== tenant.id) {
    return { error: 'Tu sesión es de otro cliente. Vuelve a entrar.' } as const
  }

  if (!alcanza(await permisosDelUsuario(), requeridos)) {
    return { error: 'Tu perfil no puede hacer este cambio.' } as const
  }

  return {
    tenantId: tenant.id,
    usuarioId: sesion.usuarioId,
    perfil: sesion.perfil,
  } as const
}

function sinPaso(c: Contexto | { error: string }): c is { error: string } {
  return 'error' in c
}

/** Rastro en bitácora. Toda escritura deja uno, dentro de la misma transacción. */
function anotar(
  tx: Sql,
  ctx: Contexto,
  accion: 'alta' | 'cambio' | 'baja',
  entidad: string,
  entidadId: string | null,
  detalle?: Record<string, string | number | boolean | null>,
) {
  return tx`
    insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
    values (${ctx.tenantId}, ${ctx.usuarioId}, ${accion}, ${entidad}, ${entidadId},
            ${detalle ? tx.json(detalle) : null})`
}

const vacioANulo = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v

const opcional = (max = 120) => z.preprocess(vacioANulo, z.string().trim().max(max).optional())

/** Una columna `date` se guarda y se lee como texto: `new Date()` la correría un día. */
const fecha = z.preprocess(
  vacioANulo,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Revisa las fechas: van en formato año-mes-día')
    .optional(),
)

function duplicado(e: unknown) {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

function primerError(e: z.ZodError) {
  return e.issues[0]?.message ?? 'Revisa los datos del formulario'
}

// =======================================================================
// Usuarios
// =======================================================================

const CONTRASENA = z
  .string()
  // bcrypt solo mira los primeros 72 bytes: más allá, dos contraseñas
  // distintas serían la misma. Se corta aquí y se dice por qué.
  .max(72, 'La contraseña no puede pasar de 72 caracteres')
  .min(8, 'La contraseña necesita al menos 8 caracteres')

const DatosUsuario = {
  nombre: z.string().trim().min(2, 'Escribe el nombre'),
  apellidoPaterno: opcional(80),
  apellidoMaterno: opcional(80),
  perfil: z.string().trim().min(1, 'Elige un perfil'),
  telefono: opcional(30),
  puesto: opcional(120),
}

const NuevoUsuario = z.object({
  ...DatosUsuario,
  correo: z.string().trim().toLowerCase().email('El correo no es válido'),
  contrasena: CONTRASENA,
})

const CambioUsuario = z.object({ ...DatosUsuario, id: z.string().uuid() })

async function perfilExiste(clave: string) {
  const [p] = await sinTenant<{ clave: string }[]>`
    select clave from perfiles where clave = ${clave} and activo`
  return Boolean(p)
}

export async function crearUsuario(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.usuariosAlta)
  if (sinPaso(ctx)) return ctx

  const analisis = NuevoUsuario.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const d = analisis.data

  if (!(await perfilExiste(d.perfil))) return { error: 'Ese perfil no existe.' }

  // Nunca viaja ni se guarda en claro: lo que entra a la base es el hash.
  const hash = await bcrypt.hash(d.contrasena, 10)

  let nuevo: string
  try {
    nuevo = await conTenant(ctx.tenantId, async (tx) => {
      const [u] = await tx<{ id: string }[]>`
        insert into usuarios
          (tenant_id, perfil_clave, nombre, apellido_paterno, apellido_materno,
           correo, contrasena_hash, telefono_movil, puesto, creado_por)
        values (${ctx.tenantId}, ${d.perfil}, ${d.nombre}, ${d.apellidoPaterno ?? null},
                ${d.apellidoMaterno ?? null}, ${d.correo}, ${hash},
                ${d.telefono ?? null}, ${d.puesto ?? null}, ${ctx.usuarioId})
        returning id`

      await anotar(tx, ctx, 'alta', 'usuarios', u.id, {
        correo: d.correo,
        perfil: d.perfil,
      })
      return u.id
    })
  } catch (e) {
    // El índice único es por cliente: el mismo correo puede existir en
    // otra plaza y eso está bien.
    if (duplicado(e)) return { error: `Ya hay un usuario con el correo ${d.correo}.` }
    throw e
  }

  revalidatePath('/configuracion')
  redirect(`/configuracion/usuarios/${nuevo}`)
}

export async function actualizarUsuario(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.usuariosCambio)
  if (sinPaso(ctx)) return ctx

  const analisis = CambioUsuario.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const d = analisis.data

  if (!(await perfilExiste(d.perfil))) return { error: 'Ese perfil no existe.' }

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    // Las tres protecciones se comprueban dentro de la transacción y con
    // las filas bloqueadas: si dos administradores se degradan a la vez,
    // la segunda espera a ver el mundo que dejó la primera.
    const [antes] = await tx<{ perfil_clave: string; activo: boolean; correo: string }[]>`
      select perfil_clave, activo, correo from usuarios where id = ${d.id} for update`
    if (!antes) return { error: 'Ese usuario ya no está.' }

    const eraAdmin = PERFILES_ADMIN.includes(antes.perfil_clave)
    const seraAdmin = PERFILES_ADMIN.includes(d.perfil)

    if (d.id === ctx.usuarioId && eraAdmin && !seraAdmin) {
      return {
        error:
          'No puedes quitarte a ti mismo el perfil de administrador: ' +
          'perderías esta pantalla. Pídeselo a otro administrador.',
      }
    }

    if (antes.activo && antes.perfil_clave === PERFIL_MAXIMO && d.perfil !== PERFIL_MAXIMO) {
      const [{ otros }] = await tx<{ otros: number }[]>`
        select count(*)::int as otros
        from usuarios
        where perfil_clave = ${PERFIL_MAXIMO} and activo and id <> ${d.id}
        for update`
      if (otros === 0) {
        return {
          error:
            'Es el único Súper Administrador activo. Nombra a otro antes de ' +
            'cambiarle el perfil, o el cliente se queda sin quien administre.',
        }
      }
    }

    await tx`
      update usuarios
      set perfil_clave = ${d.perfil},
          nombre = ${d.nombre},
          apellido_paterno = ${d.apellidoPaterno ?? null},
          apellido_materno = ${d.apellidoMaterno ?? null},
          telefono_movil = ${d.telefono ?? null},
          puesto = ${d.puesto ?? null},
          actualizado_por = ${ctx.usuarioId}
      where id = ${d.id}`

    await anotar(tx, ctx, 'cambio', 'usuarios', d.id, {
      correo: antes.correo,
      perfil_antes: antes.perfil_clave,
      perfil_despues: d.perfil,
    })

    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  revalidatePath(`/configuracion/usuarios/${d.id}`)
  return { ok: true, mensaje: 'Datos guardados' }
}

const EstadoUsuario = z.object({
  id: z.string().uuid(),
  activo: z.enum(['true', 'false']),
})

export async function cambiarEstadoUsuario(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.usuariosBaja)
  if (sinPaso(ctx)) return ctx

  const analisis = EstadoUsuario.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: 'No se entendió qué hacer con el usuario.' }
  const { id } = analisis.data
  const activar = analisis.data.activo === 'true'

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    const [antes] = await tx<{ perfil_clave: string; activo: boolean; correo: string }[]>`
      select perfil_clave, activo, correo from usuarios where id = ${id} for update`
    if (!antes) return { error: 'Ese usuario ya no está.' }
    if (antes.activo === activar) return { ok: true as const, yaEstaba: true }

    if (!activar) {
      if (id === ctx.usuarioId) {
        return {
          error:
            'No puedes desactivar tu propio usuario: te quedarías fuera del ' +
            'sistema en el mismo clic. Pídeselo a otro administrador.',
        }
      }

      if (antes.perfil_clave === PERFIL_MAXIMO) {
        const [{ otros }] = await tx<{ otros: number }[]>`
          select count(*)::int as otros
          from usuarios
          where perfil_clave = ${PERFIL_MAXIMO} and activo and id <> ${id}
          for update`
        if (otros === 0) {
          return {
            error:
              'Es el único Súper Administrador activo. Si lo desactivas, el ' +
              'cliente se queda sin quien administre el sistema.',
          }
        }
      }
    }

    await tx`
      update usuarios
      set activo = ${activar}, actualizado_por = ${ctx.usuarioId}
      where id = ${id}`

    await anotar(tx, ctx, activar ? 'cambio' : 'baja', 'usuarios', id, {
      correo: antes.correo,
      activo: activar,
    })

    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  revalidatePath(`/configuracion/usuarios/${id}`)
  return {
    ok: true,
    mensaje: activar ? 'El usuario ya puede entrar' : 'El usuario ya no puede entrar',
  }
}

const Restablecer = z.object({ id: z.string().uuid(), contrasena: CONTRASENA })

export async function restablecerContrasena(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.usuariosCambio)
  if (sinPaso(ctx)) return ctx

  const analisis = Restablecer.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const { id, contrasena } = analisis.data

  const hash = await bcrypt.hash(contrasena, 10)

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    const [u] = await tx<{ correo: string }[]>`
      update usuarios
      set contrasena_hash = ${hash}, actualizado_por = ${ctx.usuarioId}
      where id = ${id}
      returning correo`
    if (!u) return { error: 'Ese usuario ya no está.' }

    // En el detalle NUNCA va la contraseña, ni cifrada: la bitácora la
    // lee gente, y el hash es material para romperla sin prisa.
    await anotar(tx, ctx, 'cambio', 'usuarios', id, {
      correo: u.correo,
      contrasena_restablecida: true,
    })
    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath(`/configuracion/usuarios/${id}`)
  return { ok: true, mensaje: 'Contraseña restablecida. Pásasela por un canal seguro.' }
}

// =======================================================================
// Campañas y candidatos
// =======================================================================

const CampaniaZ = z.object({
  id: z.preprocess(vacioANulo, z.string().uuid().optional()),
  nombre: z.string().trim().min(3, 'Ponle un nombre a la campaña'),
  tipo: opcional(60),
  descripcion: opcional(400),
  fechaInicia: fecha,
  fechaTermina: fecha,
  fechaJornada: fecha,
  responsableId: z.preprocess(vacioANulo, z.string().uuid().optional()),
})

export async function guardarCampania(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.campanias)
  if (sinPaso(ctx)) return ctx

  const analisis = CampaniaZ.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const d = analisis.data

  // Las fechas son texto ISO: se comparan como texto y el orden coincide
  // con el cronológico. Pasarlas por `new Date()` las correría un día.
  if (d.fechaInicia && d.fechaTermina && d.fechaInicia > d.fechaTermina) {
    return { error: 'La campaña no puede terminar antes de empezar.' }
  }
  if (d.fechaJornada && d.fechaInicia && d.fechaJornada < d.fechaInicia) {
    return { error: 'La jornada no puede caer antes de que arranque la campaña.' }
  }

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    if (d.responsableId) {
      // RLS acota la búsqueda a este cliente: un id de otro no aparece.
      const [r] = await tx<{ id: string }[]>`
        select id from usuarios where id = ${d.responsableId} and activo`
      if (!r) return { error: 'La persona responsable no está activa en este cliente.' }
    }

    if (d.id) {
      const [c] = await tx<{ id: string }[]>`
        update campanias
        set nombre = ${d.nombre}, tipo = ${d.tipo ?? null},
            descripcion = ${d.descripcion ?? null},
            fecha_inicia = ${d.fechaInicia ?? null},
            fecha_termina = ${d.fechaTermina ?? null},
            fecha_jornada = ${d.fechaJornada ?? null},
            responsable_id = ${d.responsableId ?? null},
            actualizado_por = ${ctx.usuarioId}
        where id = ${d.id}
        returning id`
      if (!c) return { error: 'Esa campaña ya no está.' }
      await anotar(tx, ctx, 'cambio', 'campanias', c.id, { nombre: d.nombre })
      return { ok: true as const, id: c.id }
    }

    const [c] = await tx<{ id: string }[]>`
      insert into campanias
        (tenant_id, nombre, tipo, descripcion, fecha_inicia, fecha_termina,
         fecha_jornada, responsable_id, creado_por)
      values (${ctx.tenantId}, ${d.nombre}, ${d.tipo ?? null}, ${d.descripcion ?? null},
              ${d.fechaInicia ?? null}, ${d.fechaTermina ?? null},
              ${d.fechaJornada ?? null}, ${d.responsableId ?? null}, ${ctx.usuarioId})
      returning id`
    await anotar(tx, ctx, 'alta', 'campanias', c.id, { nombre: d.nombre })
    return { ok: true as const, id: c.id }
  })

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  revalidatePath('/', 'layout')
  if (!d.id) redirect(`/configuracion/campanias/${resultado.id}`)
  return { ok: true, mensaje: 'Campaña guardada' }
}

const EstadoCampania = z.object({
  id: z.string().uuid(),
  activo: z.enum(['true', 'false']),
})

export async function cambiarEstadoCampania(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.campanias)
  if (sinPaso(ctx)) return ctx

  const analisis = EstadoCampania.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: 'No se entendió qué hacer con la campaña.' }
  const { id } = analisis.data
  const activar = analisis.data.activo === 'true'

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    const [c] = await tx<{ nombre: string }[]>`
      update campanias set activo = ${activar}, actualizado_por = ${ctx.usuarioId}
      where id = ${id} returning nombre`
    if (!c) return { error: 'Esa campaña ya no está.' }
    await anotar(tx, ctx, activar ? 'cambio' : 'baja', 'campanias', id, {
      nombre: c.nombre,
      activo: activar,
    })
    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  revalidatePath(`/configuracion/campanias/${id}`)
  revalidatePath('/', 'layout')
  return { ok: true, mensaje: activar ? 'Campaña reactivada' : 'Campaña archivada' }
}

const CandidatoZ = z.object({
  id: z.preprocess(vacioANulo, z.string().uuid().optional()),
  campaniaId: z.string().uuid(),
  nombre: z.string().trim().min(3, 'Escribe el nombre del candidato'),
  cargo: opcional(120),
  partido: opcional(80),
})

export async function guardarCandidato(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.candidatos)
  if (sinPaso(ctx)) return ctx

  const analisis = CandidatoZ.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const d = analisis.data

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    // La llave foránea de `candidatos` apunta al catálogo global de
    // campañas: sin esta comprobación se podría colgar un candidato de la
    // campaña de otro cliente. Bajo RLS, esa campaña sencillamente no
    // existe aquí.
    const [campania] = await tx<{ nombre: string }[]>`
      select nombre from campanias where id = ${d.campaniaId}`
    if (!campania) return { error: 'Esa campaña no es de este cliente.' }

    if (d.id) {
      const [k] = await tx<{ id: string }[]>`
        update candidatos
        set nombre = ${d.nombre}, cargo = ${d.cargo ?? null},
            partido = ${d.partido ?? null}, actualizado_por = ${ctx.usuarioId}
        where id = ${d.id} and campania_id = ${d.campaniaId}
        returning id`
      if (!k) return { error: 'Ese candidato ya no está.' }
      await anotar(tx, ctx, 'cambio', 'candidatos', k.id, { nombre: d.nombre })
      return { ok: true as const }
    }

    const [k] = await tx<{ id: string }[]>`
      insert into candidatos (tenant_id, campania_id, nombre, cargo, partido, creado_por)
      values (${ctx.tenantId}, ${d.campaniaId}, ${d.nombre}, ${d.cargo ?? null},
              ${d.partido ?? null}, ${ctx.usuarioId})
      returning id`
    await anotar(tx, ctx, 'alta', 'candidatos', k.id, {
      nombre: d.nombre,
      campania: campania.nombre,
    })
    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath(`/configuracion/campanias/${d.campaniaId}`)
  revalidatePath('/configuracion')
  return { ok: true, mensaje: d.id ? 'Candidato actualizado' : 'Candidato agregado' }
}

const EstadoCandidato = z.object({
  id: z.string().uuid(),
  campaniaId: z.string().uuid(),
  activo: z.enum(['true', 'false']),
})

export async function cambiarEstadoCandidato(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.candidatos)
  if (sinPaso(ctx)) return ctx

  const analisis = EstadoCandidato.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: 'No se entendió qué hacer con el candidato.' }
  const { id, campaniaId } = analisis.data
  const activar = analisis.data.activo === 'true'

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    const [k] = await tx<{ nombre: string }[]>`
      update candidatos set activo = ${activar}, actualizado_por = ${ctx.usuarioId}
      where id = ${id} and campania_id = ${campaniaId} returning nombre`
    if (!k) return { error: 'Ese candidato ya no está.' }
    await anotar(tx, ctx, activar ? 'cambio' : 'baja', 'candidatos', id, {
      nombre: k.nombre,
      activo: activar,
    })
    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath(`/configuracion/campanias/${campaniaId}`)
  return { ok: true, mensaje: activar ? 'Candidato reactivado' : 'Candidato retirado' }
}

// =======================================================================
// Catálogos de la operación
// =======================================================================

const ClaveCatalogoZ = z.enum(CLAVES_CATALOGO as [ClaveCatalogo, ...ClaveCatalogo[]])

/**
 * El esquema de validación se arma con la misma definición que dibuja el
 * formulario, así que un campo nuevo se valida sin tocar esta función.
 */
function esquemaDe(def: DefinicionCatalogo) {
  const forma: Record<string, z.ZodType> = {}
  for (const c of def.campos) {
    if (c.tipo === 'color') {
      forma[c.nombre] = z.preprocess(
        vacioANulo,
        z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, 'El color va en formato #rrggbb')
          .optional(),
      )
    } else if (c.tipo === 'correo') {
      forma[c.nombre] = z.preprocess(
        vacioANulo,
        z.string().trim().toLowerCase().email('El correo de contacto no es válido').optional(),
      )
    } else if (c.tipo === 'problematica') {
      forma[c.nombre] = z.string().uuid('Elige a qué problemática pertenece')
    } else if (c.requerido) {
      forma[c.nombre] = z
        .string()
        .trim()
        .min(2, `Escribe ${c.etiqueta.toLowerCase()}`)
        .max(160, `${c.etiqueta} se pasa de largo`)
    } else {
      forma[c.nombre] = opcional(160)
    }
  }
  return z.object(forma)
}

const CatalogoZ = z.object({
  catalogo: ClaveCatalogoZ,
  id: z.preprocess(vacioANulo, z.string().uuid().optional()),
})

export async function guardarCatalogo(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.catalogos)
  if (sinPaso(ctx)) return ctx

  const crudo = Object.fromEntries(datos)
  const cabecera = CatalogoZ.safeParse(crudo)
  if (!cabecera.success) return { error: 'No se entendió qué catálogo se está editando.' }

  const { catalogo, id } = cabecera.data
  const def = CATALOGOS[catalogo]

  const analisis = esquemaDe(def).safeParse(crudo)
  if (!analisis.success) return { error: primerError(analisis.error) }
  const valores = analisis.data as Record<string, string | undefined>

  const fila: Record<string, string | null> = {}
  for (const c of def.campos) fila[c.nombre] = valores[c.nombre] ?? null

  const nombre = fila[columnaNombre(def)] ?? ''

  let resultado: EstadoAccion & { creado?: boolean }
  try {
    resultado = await conTenant(ctx.tenantId, async (tx) => {
      if (catalogo === 'subproblematicas') {
        const [madre] = await tx<{ id: string }[]>`
          select id from problematicas where id = ${fila.problematica_id} and activo`
        if (!madre) return { error: 'Esa problemática no está disponible en este cliente.' }
      }

      if (id) {
        if (catalogo === 'estatus_peticiones') {
          const [antes] = await tx<{ descripcion: string }[]>`
            select descripcion from estatus_peticiones where id = ${id}`
          if (
            antes &&
            ESTATUS_RESERVADOS.includes(antes.descripcion) &&
            antes.descripcion !== nombre
          ) {
            return {
              error:
                `«${antes.descripcion}» la usa el sistema para abrir y cerrar ` +
                'peticiones. Puedes crear otros estatus, pero no renombrar este.',
            }
          }
        }

        // La tabla y las columnas salen de CATALOGOS, nunca de la URL;
        // postgres.js las escapa como identificadores.
        const [fil] = await tx<{ id: string }[]>`
          update ${tx(def.tabla)}
          set ${tx(fila)}, actualizado_por = ${ctx.usuarioId}
          where id = ${id}
          returning id`
        if (!fil) return { error: `Esa ${def.singular} ya no está.` }

        await anotar(tx, ctx, 'cambio', def.tabla, id, { nombre })
        return { ok: true as const, mensaje: `Se guardó «${nombre}»` }
      }

      const [fil] = await tx<{ id: string }[]>`
        insert into ${tx(def.tabla)} ${tx({
          ...fila,
          tenant_id: ctx.tenantId,
          creado_por: ctx.usuarioId,
        })}
        returning id`

      await anotar(tx, ctx, 'alta', def.tabla, fil.id, { nombre })
      return { ok: true as const, creado: true, mensaje: `Se agregó «${nombre}»` }
    })
  } catch (e) {
    if (duplicado(e)) {
      return { error: `Ya hay una ${def.singular} activa que se llama «${nombre}».` }
    }
    throw e
  }

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  return resultado
}

const EstadoCatalogo = z.object({
  catalogo: ClaveCatalogoZ,
  id: z.string().uuid(),
  activo: z.enum(['true', 'false']),
})

/**
 * Los catálogos no se borran: se desactivan.
 *
 * Hay peticiones apuntando a ellos, y un borrado real dejaría expedientes
 * sin problemática ni estatus. Desactivar los saca de los formularios y
 * deja el historial intacto — pero quien lo hace merece saber a cuántas
 * peticiones les está cambiando el paisaje, así que se le dice el número.
 */
export async function cambiarEstadoCatalogo(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.catalogos)
  if (sinPaso(ctx)) return ctx

  const analisis = EstadoCatalogo.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: 'No se entendió qué registro se está desactivando.' }
  const { catalogo, id } = analisis.data
  const activar = analisis.data.activo === 'true'
  const def = CATALOGOS[catalogo]
  const columna = columnaNombre(def)

  let resultado: EstadoAccion
  try {
    resultado = await conTenant(ctx.tenantId, async (tx) => {
      const [antes] = await tx<{ nombre: string }[]>`
        select ${tx(columna)} as nombre from ${tx(def.tabla)} where id = ${id}`
      if (!antes) return { error: `Esa ${def.singular} ya no está.` }

      if (
        !activar &&
        catalogo === 'estatus_peticiones' &&
        ESTATUS_RESERVADOS.includes(antes.nombre)
      ) {
        return {
          error:
            `«${antes.nombre}» la usa el sistema para abrir y cerrar peticiones. ` +
            'Si la desactivas, las peticiones nuevas se quedan sin estatus.',
        }
      }

      const [{ usos }] = await tx<{ usos: number }[]>`
        select count(*)::int as usos from peticiones where ${tx(def.columnaUso)} = ${id}`

      await tx`
        update ${tx(def.tabla)}
        set activo = ${activar}, actualizado_por = ${ctx.usuarioId}
        where id = ${id}`

      await anotar(tx, ctx, activar ? 'cambio' : 'baja', def.tabla, id, {
        nombre: antes.nombre,
        activo: activar,
        peticiones: usos,
      })

      if (activar) return { ok: true as const, mensaje: `«${antes.nombre}» vuelve a la lista` }

      return {
        ok: true as const,
        mensaje:
          usos === 0
            ? `«${antes.nombre}» ya no se ofrece. No había ninguna petición usándola.`
            : `«${antes.nombre}» ya no se ofrece. ${usos.toLocaleString('es-MX')} ` +
              `petición${usos === 1 ? '' : 'es'} la sigue${usos === 1 ? '' : 'n'} ` +
              'usando y conserva su historial.',
      }
    })
  } catch (e) {
    if (duplicado(e)) {
      return {
        error:
          `No se puede reactivar: ya hay otra ${def.singular} activa con ese ` +
          'mismo nombre. Renómbrala primero.',
      }
    }
    throw e
  }

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  return resultado
}

// =======================================================================
// Datos del cliente
// =======================================================================

const ClienteZ = z.object({
  nombre: z.string().trim().min(3, 'Escribe el nombre del cliente'),
  nombreCorto: opcional(60),
  colorAcento: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color de acento va en formato #rrggbb'),
  licenciaInicia: fecha,
  licenciaVence: fecha,
})

/**
 * La clave del cliente no se toca: es el subdominio por el que entra la
 * gente y la llave con la que se resuelve el tenant en cada petición.
 * Cambiarla desde aquí dejaría el sistema inalcanzable para todos.
 */
export async function guardarCliente(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const ctx = await contexto(PERMISOS.cliente)
  if (sinPaso(ctx)) return ctx

  const analisis = ClienteZ.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: primerError(analisis.error) }
  const d = analisis.data

  if (d.licenciaInicia && d.licenciaVence && d.licenciaVence < d.licenciaInicia) {
    return { error: 'La licencia no puede vencer antes de empezar.' }
  }

  const resultado = await conTenant(ctx.tenantId, async (tx) => {
    // `where id = ${ctx.tenantId}` y, debajo, la política de RLS de la
    // migración 13: dos candados para lo mismo, a propósito.
    const [t] = await tx<{ clave: string }[]>`
      update tenants
      set nombre = ${d.nombre},
          nombre_corto = ${d.nombreCorto ?? null},
          color_acento = ${d.colorAcento},
          licencia_inicia = ${d.licenciaInicia ?? null},
          licencia_vence = ${d.licenciaVence ?? null}
      where id = ${ctx.tenantId}
      returning clave`
    if (!t) return { error: 'No se pudo actualizar este cliente.' }

    await anotar(tx, ctx, 'cambio', 'tenants', ctx.tenantId, {
      nombre: d.nombre,
      licencia_vence: d.licenciaVence ?? null,
    })
    return { ok: true as const }
  })

  if (resultado.error) return resultado
  revalidatePath('/configuracion')
  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Datos del cliente guardados' }
}
