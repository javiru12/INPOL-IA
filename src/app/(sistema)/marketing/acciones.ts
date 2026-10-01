'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import type { Alcance, Canal, Segmento } from './catalogo'
import {
  camposDestinatario,
  campoDestino,
  condicionCanal,
  condicionSegmento,
  medirAlcance,
} from './consultas'

export type EstadoAccion = { error?: string; ok?: boolean; mensaje?: string }

/**
 * Un `select` sin elegir manda '' y un campo ausente del formulario
 * llega como null desde `FormData.get`. Ninguno de los dos es «undefined»
 * para zod, así que sin este paso `.optional()` los rechazaría.
 */
const vacioANulo = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v
const textoOpcional = z.preprocess(vacioANulo, z.string().trim().max(160).optional())
const edadOpcional = z.preprocess(vacioANulo, z.coerce.number().int().min(0).max(120).optional())

const SegmentoZ = z.object({
  colonia: textoOpcional,
  municipio: textoOpcional,
  seccion: textoOpcional,
  problematica: textoOpcional,
  estatus: textoOpcional,
  sexo: z.preprocess(vacioANulo, z.enum(['F', 'M']).optional()),
  edadMin: edadOpcional,
  edadMax: edadOpcional,
})

const CanalZ = z.enum(['correo', 'sms', 'whatsapp'])

/** El segmento se guarda en jsonb sin las claves que nadie eligió. */
function segmentoAJson(s: Segmento): Record<string, string | number> {
  const salida: Record<string, string | number> = {}
  for (const [clave, valor] of Object.entries(s)) {
    if (valor !== undefined && valor !== '') salida[clave] = valor
  }
  return salida
}

/**
 * Contador en vivo del formulario de campaña.
 *
 * Se consulta en cada cambio del segmento, así que devuelve solo tres
 * cifras y un destinatario de ejemplo: nunca la lista completa.
 */
export async function medirSegmento(entrada: unknown): Promise<Alcance> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) return { personas: 0, alcanzables: 0, muestra: null }

  const analisis = z
    .object({ canal: CanalZ, segmento: SegmentoZ })
    .safeParse(entrada)
  if (!analisis.success) return { personas: 0, alcanzables: 0, muestra: null }

  return medirAlcance(
    tenant.id,
    analisis.data.segmento as Segmento,
    analisis.data.canal as Canal,
  )
}

// --- Aviso individual ---------------------------------------------------

const Aviso = z.object({
  peticionId: z.string().uuid(),
  via: z.enum(['correo', 'sms', 'whatsapp', 'llamada', 'presencial']),
  nota: z.preprocess(vacioANulo, z.string().trim().max(400).optional()),
})

/**
 * Deja constancia de que al ciudadano ya se le avisó cómo terminó su
 * petición.
 *
 * El sistema no manda el mensaje —no hay proveedor conectado—: quien
 * atiende llama o escribe por su cuenta y lo registra aquí. Por eso el
 * estado nace 'enviado' y no 'preparado': describe algo que sí pasó.
 */
export async function registrarAviso(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = Aviso.safeParse({
    peticionId: datos.get('peticionId'),
    via: datos.get('via'),
    nota: datos.get('nota'),
  })
  if (!analisis.success) return { error: 'Elige por dónde se le avisó.' }

  const { peticionId, via, nota } = analisis.data

  const resultado = await conTenant(tenant.id, async (tx) => {
    // RLS acota la petición a este cliente: si fuera de otro, no hay fila.
    const [p] = await tx<
      {
        ciudadano_id: string
        folio: string
        estatus: string | null
        problematica: string | null
        telefono: string | null
        correo: string | null
      }[]
    >`
      select p.ciudadano_id,
             upper(substr(p.id::text, 1, 6)) as folio,
             e.descripcion as estatus,
             pr.titulo as problematica,
             c.telefono_movil as telefono,
             c.correo
      from peticiones p
      join ciudadanos c on c.id = p.ciudadano_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join problematicas pr on pr.id = p.problematica_id
      where p.id = ${peticionId}`

    if (!p) return { error: 'Esa petición ya no está disponible.' }

    const destino = via === 'correo' ? p.correo : via === 'presencial' ? null : p.telefono
    const cuerpo =
      nota ??
      `Se informó al ciudadano que su petición ${p.folio}` +
        (p.problematica ? ` sobre ${p.problematica}` : '') +
        ` quedó ${(p.estatus ?? 'atendida').toLowerCase()}.`

    const [mensaje] = await tx<{ id: string }[]>`
      insert into mensajes_enviados
        (tenant_id, peticion_id, ciudadano_id, canal, destino, asunto, cuerpo,
         estado, enviado_en, creado_por)
      values (${tenant.id}, ${peticionId}, ${p.ciudadano_id}, ${via}, ${destino},
              ${`Seguimiento de su petición ${p.folio}`}, ${cuerpo},
              'enviado', now(), ${sesion.usuarioId})
      returning id`

    // El aviso también es parte de la historia de la petición: quien abra
    // el expediente tiene que ver que se le avisó, sin salir de ahí.
    await tx`
      insert into peticion_seguimientos (tenant_id, peticion_id, usuario_id, tipo, detalle)
      values (${tenant.id}, ${peticionId}, ${sesion.usuarioId}, 'nota', ${cuerpo})`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'cambio', 'mensajes_enviados',
              ${mensaje.id},
              ${tx.json({ via, peticion_id: peticionId, ciudadano_id: p.ciudadano_id, destino })})`

    return { ok: true as const }
  })

  if ('error' in resultado && resultado.error) return resultado

  revalidatePath('/marketing')
  revalidatePath(`/peticiones/${peticionId}`)
  return { ok: true, mensaje: 'Aviso registrado' }
}

// --- Campaña ------------------------------------------------------------

const NuevaCampania = z.object({
  nombre: z.string().trim().min(3, 'Ponle un nombre a la campaña'),
  canal: CanalZ,
  asunto: z.preprocess(vacioANulo, z.string().trim().max(160).optional()),
  cuerpo: z.string().trim().min(10, 'Escribe el mensaje que va a recibir la gente'),
  colonia: textoOpcional,
  municipio: textoOpcional,
  seccion: textoOpcional,
  problematica: textoOpcional,
  estatus: textoOpcional,
  sexo: z.preprocess(vacioANulo, z.enum(['F', 'M']).optional()),
  edadMin: edadOpcional,
  edadMax: edadOpcional,
})

/**
 * Registra la campaña y congela su lista de destinatarios.
 *
 * No envía nada: no hay proveedor conectado. La campaña queda
 * 'preparada' y cada destinatario 'preparado', con el mensaje ya
 * personalizado, para que se vea exactamente qué recibiría cada quien el
 * día que haya por dónde mandarlo.
 */
export async function crearCampania(
  _previo: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró. Vuelve a entrar.' }

  const analisis = NuevaCampania.safeParse(Object.fromEntries(datos))
  if (!analisis.success) return { error: analisis.error.issues[0].message }
  const d = analisis.data

  if (d.edadMin !== undefined && d.edadMax !== undefined && d.edadMin > d.edadMax) {
    return { error: 'El rango de edad está al revés.' }
  }

  const canal = d.canal as Canal
  const segmento: Segmento = {
    colonia: d.colonia,
    municipio: d.municipio,
    seccion: d.seccion,
    problematica: d.problematica,
    estatus: d.estatus,
    sexo: d.sexo,
    edadMin: d.edadMin,
    edadMax: d.edadMax,
  }

  let destino: string | null = null

  const resultado = await conTenant(tenant.id, async (tx) => {
    const donde = condicionSegmento(tx, segmento)
    const contactable = condicionCanal(tx, canal)

    const [{ alcanzables }] = await tx<{ alcanzables: number }[]>`
      select count(*)::int as alcanzables
      from ciudadanos c
      where ${donde} and ${contactable}`

    if (alcanzables === 0) {
      return {
        error:
          canal === 'correo'
            ? 'Nadie de ese segmento tiene correo registrado. Prueba con otro canal.'
            : 'Nadie de ese segmento tiene teléfono registrado.',
      }
    }

    const [campania] = await tx<{ id: string }[]>`
      insert into campanias_mensaje
        (tenant_id, nombre, canal, asunto, cuerpo, segmento, estado, creado_por)
      values (${tenant.id}, ${d.nombre}, ${canal}, ${d.asunto ?? null}, ${d.cuerpo},
              ${tx.json(segmentoAJson(segmento))}, 'preparada',
              ${sesion.usuarioId})
      returning id`

    // Los marcadores se sustituyen en la propia inserción: así no viajan
    // miles de filas a la aplicación solo para armar un texto.
    await tx`
      insert into mensajes_enviados
        (tenant_id, campania_mensaje_id, ciudadano_id, canal, destino, asunto,
         cuerpo, estado, creado_por)
      select ${tenant.id}, ${campania.id}, d.id, ${canal}, d.destino, ${d.asunto ?? null},
             replace(replace(replace(${d.cuerpo},
               '{nombre}', coalesce(d.nombre, '')),
               '{folio}', coalesce(d.folio, '')),
               '{problematica}', coalesce(d.problematica, '')),
             'preparado', ${sesion.usuarioId}
      from (
        select c.id, ${camposDestinatario(tx)}, ${campoDestino(tx, canal)} as destino
        from ciudadanos c
        where ${donde} and ${contactable}
      ) d`

    const [{ total }] = await tx<{ total: number }[]>`
      update campanias_mensaje
      set destinatarios = (select count(*)::int from mensajes_enviados
                           where campania_mensaje_id = ${campania.id})
      where id = ${campania.id}
      returning destinatarios as total`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'alta', 'campanias_mensaje',
              ${campania.id},
              ${tx.json({ canal, destinatarios: total, segmento: segmentoAJson(segmento) })})`

    destino = campania.id
    return { ok: true as const }
  })

  if ('error' in resultado && resultado.error) return resultado

  revalidatePath('/marketing')
  if (destino) redirect(`/marketing/${destino}`)
  return { ok: true }
}
