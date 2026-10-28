import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puede } from '@/lib/permisos'
import { preguntarEnVivo, type Turno } from '@/lib/ia'

/**
 * El asistente, contando lo que hace mientras lo hace.
 *
 * Va por una ruta y no por una acción de servidor porque una acción
 * devuelve un valor al terminar, y lo que hace que esto no se sienta
 * colgado es justo lo contrario: que la respuesta vaya saliendo.
 *
 * Cada línea es un JSON. Es el formato más simple que un navegador
 * puede ir leyendo a pedazos sin librerías.
 */
export const maxDuration = 300

export async function POST(peticion: Request) {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return new Response('Sin sesión', { status: 401 })
  if (!(await puede('asistente.consultar'))) {
    return new Response('Sin permiso', { status: 403 })
  }

  const cuerpo = (await peticion.json()) as { pregunta?: string; historial?: Turno[] }
  const pregunta = (cuerpo.pregunta ?? '').trim()
  if (pregunta.length < 4 || pregunta.length > 2000) {
    return new Response('Pregunta fuera de rango', { status: 400 })
  }
  const historial = Array.isArray(cuerpo.historial) ? cuerpo.historial.slice(-6) : []

  let consultas = 0
  const codificador = new TextEncoder()

  const flujo = new ReadableStream({
    async start(control) {
      try {
        for await (const evento of preguntarEnVivo(
          pregunta,
          historial,
          {
            id: tenant.id,
            nombre: tenant.nombre,
            estado_nombre: tenant.estado_nombre,
            estado_clave: tenant.estado_clave,
          },
          { nombre: sesion.nombre, perfil: sesion.perfil },
        )) {
          if (evento.t === 'consulta') consultas++
          control.enqueue(codificador.encode(JSON.stringify(evento) + '\n'))
        }
      } catch (e) {
        control.enqueue(
          codificador.encode(
            JSON.stringify({
              t: 'error',
              mensaje: e instanceof Error ? e.message.slice(0, 300) : 'Se cortó la respuesta.',
            }) + '\n',
          ),
        )
      } finally {
        control.close()

        // La bitácora va al final y fuera del flujo: si falla, la
        // respuesta ya se entregó y no tiene por qué arrastrarla.
        try {
          await conTenant(tenant.id, (tx) =>
            tx`insert into bitacora (tenant_id, usuario_id, accion, entidad, detalle)
               values (${tenant.id}, ${sesion.usuarioId}, 'consulta_ia', 'asistente',
                       ${tx.json({ pregunta, consultas })})`,
          )
        } catch {
          /* no vale la pena romper la respuesta por la bitácora */
        }
      }
    },
  })

  return new Response(flujo, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Sin esto, un proxy intermedio junta todo y lo entrega al final,
      // que es exactamente lo que se quiere evitar.
      'x-accel-buffering': 'no',
    },
  })
}
