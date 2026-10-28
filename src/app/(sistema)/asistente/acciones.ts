'use server'

import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puede } from '@/lib/permisos'
import { preguntar, type Respuesta, type Turno } from '@/lib/ia'

export type Vuelta = {
  pregunta: string
  respuesta: string
  graficas: Respuesta['graficas']
  pasos: Respuesta['pasos']
}

/**
 * El hilo completo vuelve en cada respuesta.
 *
 * Lo arma el servidor y no el navegador para que la pantalla no tenga
 * que acumular estado en un efecto: el resultado de una acción no se
 * puede leer desde el manejador del formulario, así que acumularlo del
 * lado del cliente obliga a un `setState` dentro de un `useEffect`, que
 * es precisamente el patrón que dispara renderizados en cascada.
 */
export type EstadoAsistente = { hilo: Vuelta[]; error?: string }

export async function responder(
  _previo: EstadoAsistente,
  datos: FormData,
): Promise<EstadoAsistente> {
  const vacio = (h: Vuelta[] = []) => ({ hilo: h })
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  // El hilo viaja desde el navegador: el servidor no guarda estado entre
  // peticiones y así la conversación sobrevive a un recargado sin tener
  // que inventar una tabla de sesiones de chat.
  let hilo: Vuelta[] = []
  try {
    const leido = JSON.parse(String(datos.get('hilo') ?? '[]'))
    if (Array.isArray(leido)) hilo = leido
  } catch {
    hilo = []
  }

  if (!tenant || !sesion) return { ...vacio(hilo), error: 'La sesión expiró.' }
  if (!(await puede('asistente.consultar'))) {
    return { ...vacio(hilo), error: 'Tu perfil no tiene acceso al asistente.' }
  }

  const pregunta = String(datos.get('pregunta') ?? '').trim()
  if (pregunta.length < 4) return { ...vacio(hilo), error: 'Escribe una pregunta.' }
  if (pregunta.length > 2000) {
    return { ...vacio(hilo), error: 'Esa pregunta es larguísima; acórtala.' }
  }

  // Solo las últimas vueltas van al modelo: una conversación larga no
  // mejora la respuesta y sí encarece cada pregunta.
  const paraElModelo: Turno[] = hilo
    .slice(-6)
    .map((v) => ({ pregunta: v.pregunta, respuesta: v.respuesta }))

  const r = await preguntar(
    pregunta,
    paraElModelo,
    {
      id: tenant.id,
      nombre: tenant.nombre,
      estado_nombre: tenant.estado_nombre,
      estado_clave: tenant.estado_clave,
    },
    { nombre: sesion.nombre, perfil: sesion.perfil },
  )

  // Queda constancia de qué se preguntó y qué consultó el asistente. Es
  // acceso a datos personales como cualquier otro, y además es lo que
  // permite revisar después por qué contestó lo que contestó.
  await conTenant(tenant.id, (tx) =>
    tx`insert into bitacora (tenant_id, usuario_id, accion, entidad, detalle)
       values (${tenant.id}, ${sesion.usuarioId}, 'consulta_ia', 'asistente',
               ${tx.json({
                 pregunta,
                 consultas: r.pasos.filter((p) => p.tipo === 'consulta').length,
                 error: r.error ?? null,
               })})`,
  )

  if (r.error) return { hilo, error: r.error }

  return {
    hilo: [
      ...hilo,
      { pregunta, respuesta: r.texto, graficas: r.graficas, pasos: r.pasos },
    ],
  }
}
