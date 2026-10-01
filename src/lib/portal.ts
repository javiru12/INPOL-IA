'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { VERSION_AVISO } from '@/lib/aviso-privacidad'

/** Sin caracteres que se confundan al dictar un folio por teléfono. */
const ALFABETO = 'ACDEFGHJKLMNPQRTUVWXY34679'

/** Cuántas veces puede alguien usar el formulario antes de que se le frene. */
const LIMITES = {
  reporte: { veces: 3, ventana: '1 hour' },
  consulta: { veces: 20, ventana: '1 hour' },
} as const

async function huellaDeQuienPide() {
  const cabeceras = await headers()
  // Detrás de un balanceador la IP real llega en estas cabeceras.
  return (
    cabeceras.get('x-forwarded-for')?.split(',')[0].trim() ||
    cabeceras.get('x-real-ip') ||
    'desconocida'
  )
}

/**
 * Frena el uso repetido del formulario público.
 *
 * No es protección contra un ataque decidido —para eso haría falta algo
 * delante de la aplicación—, pero evita que un formulario abierto a
 * internet se llene de basura en una tarde.
 */
async function dentroDelLimite(
  tenantId: string,
  accion: keyof typeof LIMITES,
  extra?: string,
): Promise<boolean> {
  const huella = [await huellaDeQuienPide(), extra].filter(Boolean).join('|')
  const { veces, ventana } = LIMITES[accion]

  return conTenant(tenantId, async (tx) => {
    const [{ recientes }] = await tx<{ recientes: number }[]>`
      select count(*)::int as recientes
      from intentos_publicos
      where huella = ${huella}
        and accion = ${accion}
        and creado_en > now() - ${ventana}::interval`

    if (recientes >= veces) return false

    await tx`
      insert into intentos_publicos (tenant_id, huella, accion)
      values (${tenantId}, ${huella}, ${accion})`

    // Limpieza oportunista: lo de ayer ya no sirve para nada.
    await tx`delete from intentos_publicos where creado_en < now() - interval '1 day'`
    return true
  })
}

const Reporte = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre completo').max(120),
  telefono: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos, sin espacios'),
  colonia: z.string().trim().min(2, 'Dinos en qué colonia').max(120),
  calle: z.string().trim().max(160).optional(),
  problematicaId: z.string().uuid({ message: 'Elige de qué se trata' }),
  descripcion: z
    .string()
    .trim()
    .min(20, 'Cuéntanos con un poco más de detalle qué está pasando')
    .max(1500),
  aviso: z.literal('si', { message: 'Necesitamos que aceptes el aviso de privacidad' }),
})

export type EstadoReporte = { error?: string; folio?: string }

export async function levantarReporte(
  _previo: EstadoReporte,
  datos: FormData,
): Promise<EstadoReporte> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) return { error: 'No pudimos identificar el municipio. Revisa la dirección.' }

  const analisis = Reporte.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  if (!(await dentroDelLimite(tenant.id, 'reporte', d.telefono))) {
    return {
      error:
        'Ya recibimos varios reportes desde este teléfono. Espera un rato o llama al módulo de atención.',
    }
  }

  const prefijo = tenant.clave.slice(0, 3).toUpperCase()

  return conTenant(tenant.id, async (tx) => {
    // Si ya reportó antes con el mismo teléfono, se reutiliza su registro
    // en vez de duplicar a la persona en el padrón.
    const [existente] = await tx<{ id: string }[]>`
      select id from ciudadanos where telefono_movil = ${d.telefono} limit 1`

    let ciudadanoId = existente?.id
    if (ciudadanoId) {
      await tx`
        update ciudadanos
        set colonia = coalesce(nullif(${d.colonia}, ''), colonia),
            acepto_aviso_en = now(),
            acepto_aviso_version = ${VERSION_AVISO}
        where id = ${ciudadanoId}`
    } else {
      const partes = d.nombre.split(/\s+/)
      const [nuevo] = await tx<{ id: string }[]>`
        insert into ciudadanos
          (tenant_id, nombre, apellido_paterno, nombre_completo, telefono_movil,
           colonia, calle, origen, acepto_aviso_en, acepto_aviso_version)
        values (${tenant.id}, ${partes[0]}, ${partes.slice(1).join(' ') || null},
                ${d.nombre}, ${d.telefono}, ${d.colonia}, ${d.calle || null},
                'portal', now(), ${VERSION_AVISO})
        returning id`
      ciudadanoId = nuevo.id
    }

    const [abierta] = await tx<{ id: string }[]>`
      select id from estatus_peticiones where descripcion = 'Abierta' limit 1`
    const [normal] = await tx<{ id: string }[]>`
      select id from prioridades where descripcion = 'Normal' limit 1`
    const [fuente] = await tx<{ id: string }[]>`
      select id from fuentes where descripcion = 'Portal ciudadano' limit 1`

    // Folio único: se reintenta si choca, que con 26^6 combinaciones
    // es improbable pero no imposible.
    let folio = ''
    for (let intento = 0; intento < 8; intento++) {
      const azar = Array.from(
        { length: 6 },
        () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)],
      ).join('')
      const candidato = `${prefijo}-${azar}`
      const [choca] = await tx<{ id: string }[]>`
        select id from peticiones where folio = ${candidato} limit 1`
      if (!choca) {
        folio = candidato
        break
      }
    }
    if (!folio) return { error: 'No pudimos generar tu folio. Inténtalo de nuevo.' }

    const [peticion] = await tx<{ id: string }[]>`
      insert into peticiones
        (tenant_id, ciudadano_id, problematica_id, descripcion, fecha_apertura,
         estatus_id, prioridad_id, fuente_id, folio, origen_portal,
         seccion_id, notas)
      values (${tenant.id}, ${ciudadanoId}, ${d.problematicaId}, ${d.descripcion}, now(),
              ${abierta?.id ?? null}, ${normal?.id ?? null}, ${fuente?.id ?? null},
              ${folio}, true,
              (select seccion_id from ciudadanos where id = ${ciudadanoId}),
              ${d.calle ? `Referencia: ${d.calle}` : null})
      returning id`

    await tx`
      insert into peticion_seguimientos (tenant_id, peticion_id, tipo, detalle)
      values (${tenant.id}, ${peticion.id}, 'nota',
              'Levantada por el ciudadano desde el portal público')`

    await tx`
      insert into bitacora (tenant_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, 'alta', 'peticiones', ${peticion.id},
              ${tx.json({ origen: 'portal', folio })})`

    return { folio }
  })
}

export type Consulta = {
  error?: string
  resultado?: {
    folio: string
    descripcion: string | null
    problematica: string | null
    estatus: string | null
    fecha: string
    cierre: string | null
    movimientos: { detalle: string; cuando: string }[]
  }
}

/**
 * Consulta de estado.
 *
 * Pide folio **y** los últimos cuatro dígitos del teléfono. Solo con el
 * folio bastaría para que alguien recorriera folios ajenos y leyera el
 * nombre y el domicilio de otras personas.
 */
export async function consultarFolio(_previo: Consulta, datos: FormData): Promise<Consulta> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) return { error: 'No pudimos identificar el municipio.' }

  const esquema = z.object({
    folio: z.string().trim().min(4).max(20),
    ultimos: z.string().trim().regex(/^\d{4}$/, 'Escribe los últimos 4 dígitos de tu teléfono'),
  })

  const analisis = esquema.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }

  if (!(await dentroDelLimite(tenant.id, 'consulta'))) {
    return { error: 'Demasiadas consultas seguidas. Espera un momento.' }
  }

  const folio = analisis.data.folio.toUpperCase().replace(/\s/g, '')

  return conTenant(tenant.id, async (tx) => {
    const [p] = await tx<
      {
        id: string
        folio: string
        descripcion: string | null
        problematica: string | null
        estatus: string | null
        fecha: string
        cierre: string | null
      }[]
    >`
      select p.id, p.folio, p.descripcion,
             pr.titulo as problematica,
             e.descripcion as estatus,
             p.fecha_apertura::text as fecha,
             p.fecha_cierre::text as cierre
      from peticiones p
      left join ciudadanos c on c.id = p.ciudadano_id
      left join problematicas pr on pr.id = p.problematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      where p.folio = ${folio}
        and right(regexp_replace(coalesce(c.telefono_movil, ''), '\\D', '', 'g'), 4)
            = ${analisis.data.ultimos}`

    // Mismo mensaje si el folio no existe o si el teléfono no coincide:
    // distinguirlos permitiría averiguar qué folios son reales.
    if (!p) {
      return {
        error:
          'No encontramos ninguna petición con ese folio y ese teléfono. Revisa los datos.',
      }
    }

    const movimientos = await tx<{ detalle: string; cuando: string }[]>`
      select detalle, creado_en::text as cuando
      from peticion_seguimientos
      where peticion_id = ${p.id} and tipo in ('nota', 'cambio_estatus')
      order by creado_en`

    return { resultado: { ...p, movimientos } }
  })
}

/** Problemáticas que el portal ofrece elegir. */
export async function problematicasPublicas() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) return []
  return conTenant(tenant.id, (tx) =>
    tx<{ id: string; titulo: string }[]>`
      select id, titulo from problematicas where activo order by titulo`,
  )
}
