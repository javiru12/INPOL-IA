import 'server-only'
import { cache } from 'react'
import { conTenant } from './db'
import { ESTATUS_TERMINALES } from './peticiones'
import { leerSesion, tenantDeLaPeticion } from './sesion'
import { permisosDelUsuario } from './permisos'
import { fuenteAvisos } from '@/app/(sistema)/marketing/consultas'

/**
 * Alertas del encabezado.
 *
 * Tres reglas las gobiernan:
 *
 *  · Cada alerta lleva a la pantalla donde se resuelve, con el filtro
 *    puesto. Una cifra que no se puede accionar es ruido.
 *  · El perfil que no tiene permiso sobre una alerta no la ve. El
 *    catálogo de funcionalidades es el que decide, no una lista de
 *    perfiles escrita a mano aquí.
 *  · Esto corre en cada carga de página de cada usuario: es una sola
 *    consulta con conteos, y cada conteo va guardado tras un booleano
 *    para que la base ni siquiera mire las tablas de las alertas que
 *    este perfil no puede ver.
 */

export type Alerta = {
  clave: string
  etiqueta: string
  apoyo: string
  cifra: number
  ruta: string
  tono: 'alerta' | 'aviso' | 'dato' | 'acento'
  /** Ya revisada: la cifra no ha subido desde la última vez que se miró. */
  vista: boolean
}

type Definicion = Omit<Alerta, 'cifra' | 'vista'> & {
  /** Prefijos del catálogo de funcionalidades que habilitan la alerta. */
  permisos: string[]
}

/**
 * El documento del cliente pide quince alertas. Estas cinco son las que
 * hoy tienen datos detrás; el resto cuelga de módulos que todavía no
 * existen (entrevistas, audio-notas, llamadas a movilizadores).
 *
 * Los permisos no se eligieron al gusto: son las claves con las que la
 * matriz del cliente le da a cada perfil justo ese trabajo.
 */
const CATALOGO: Definicion[] = [
  {
    clave: 'mensajes_sin_leer',
    etiqueta: 'Mensajes sin leer',
    apoyo: 'Recados del equipo esperando respuesta',
    ruta: '/mensajes?estado=no-leidos',
    tono: 'acento',
    permisos: ['mensajes'],
  },
  {
    clave: 'peticiones_urgentes',
    etiqueta: 'Peticiones urgentes sin resolver',
    apoyo: 'Prioridad urgente, todavía abiertas',
    // La alerta cuenta solo las que siguen abiertas, así que el enlace
    // tiene que llevar ese mismo recorte: sin él, la pantalla abría con
    // las 139 urgentes de siempre y las 17 pendientes se perdían entre
    // las ya completadas.
    ruta: '/peticiones?prioridad=Urgente&pendientes=si',
    tono: 'alerta',
    permisos: [
      'encabezado.alertas.peticiones_prioritarias',
      'panel_de_inicio.listados.peticiones_prioritarias',
      'estadisticas.peticiones.estadisticas_generales.estatus_peticiones_listado.prioritarias.listado',
    ],
  },
  {
    clave: 'mis_peticiones_estancadas',
    etiqueta: 'Mis peticiones con más de 30 días',
    apoyo: 'En proceso y sin cerrar desde hace un mes',
    ruta: '/peticiones?estatus=En%20proceso',
    tono: 'aviso',
    permisos: ['panel_de_inicio.listados.peticiones_en_proceso'],
  },
  {
    clave: 'peticiones_sin_interpretar',
    etiqueta: 'Peticiones sin interpretar',
    apoyo: 'Entraron y nadie las ha clasificado',
    ruta: '/peticiones?estatus=No%20interpretada',
    tono: 'dato',
    permisos: ['interpretacion'],
  },
  {
    clave: 'avisos_pendientes',
    etiqueta: 'Avisos pendientes al ciudadano',
    apoyo: 'Peticiones resueltas que nadie le ha comunicado',
    ruta: '/marketing',
    tono: 'aviso',
    permisos: ['marketing'],
  },
]

type Cifras = {
  mensajes_sin_leer: number
  peticiones_urgentes: number
  mis_peticiones_estancadas: number
  peticiones_sin_interpretar: number
  avisos_pendientes: number
}

/**
 * Las alertas con algo pendiente, ya filtradas por permiso. Memoizada
 * por petición: el encabezado la pide una vez por carga.
 */
export const alertasDelUsuario = cache(async (): Promise<Alerta[]> => {
  const sesion = await leerSesion()
  const tenant = await tenantDeLaPeticion()
  if (!sesion || !tenant || sesion.tenantId !== tenant.id) return []

  const permisos = await permisosDelUsuario()
  const alcanza = (prefijos: string[]) =>
    prefijos.some((p) => {
      for (const clave of permisos) if (clave === p || clave.startsWith(p + '.')) return true
      return false
    })

  const visibles = CATALOGO.filter((a) => alcanza(a.permisos))
  if (visibles.length === 0) return []

  const pide = (clave: string) => visibles.some((a) => a.clave === clave)
  const uid = sesion.usuarioId

  const [cifras] = await conTenant(tenant.id, (tx) =>
    tx<Cifras[]>`
      select
        (select count(*)::int
           from mensajes m
           join mensaje_hilos h on h.id = m.hilo_id
          where ${pide('mensajes_sin_leer')}::boolean
            and m.destinatario_id = ${uid} and m.leido_en is null
            and m.activo and h.archivado_en is null) as mensajes_sin_leer,

        (select count(*)::int
           from peticiones p
           join prioridades pri on pri.id = p.prioridad_id
           join estatus_peticiones e on e.id = p.estatus_id
          where ${pide('peticiones_urgentes')}::boolean
            and p.activo and pri.descripcion = 'Urgente'
            and coalesce(e.descripcion, '') not in ${tx(ESTATUS_TERMINALES)}) as peticiones_urgentes,

        -- «Asignada a mí» en este modelo es «yo la estoy trabajando»: la
        -- petición no guarda responsable, pero el seguimiento sí dice
        -- quién la ha movido.
        (select count(*)::int
           from peticiones p
           join estatus_peticiones e on e.id = p.estatus_id
          where ${pide('mis_peticiones_estancadas')}::boolean
            and p.activo and e.descripcion = 'En proceso'
            and p.fecha_apertura < now() - interval '30 days'
            and exists (select 1 from peticion_seguimientos s
                         where s.peticion_id = p.id
                           and s.usuario_id = ${uid})) as mis_peticiones_estancadas,

        (select count(*)::int
           from peticiones p
           join estatus_peticiones e on e.id = p.estatus_id
          where ${pide('peticiones_sin_interpretar')}::boolean
            and p.activo and e.descripcion = 'No interpretada') as peticiones_sin_interpretar,

        -- Misma definición de aviso pendiente que usa la pantalla de
        -- Comunicación: si cambia allá, cambia aquí.
        (select count(*)::int ${fuenteAvisos(tx)}
            and ${pide('avisos_pendientes')}::boolean) as avisos_pendientes`,
  )

  // Qué cifra ya revisó esta persona de cada alerta. Mientras el número
  // no suba, la alerta sigue ahí pero deja de reclamar atención: el
  // trabajo pendiente no desaparece por haberlo mirado, pero tampoco
  // tiene por qué volver a gritar cada vez que se abre el sistema.
  const revisadas = await conTenant(tenant.id, (tx) =>
    tx<{ clave: string; cifra_vista: number }[]>`
      select clave, cifra_vista from alertas_vistas where usuario_id = ${uid}`,
  )
  const yaVisto = new Map(revisadas.map((r) => [r.clave, r.cifra_vista]))

  // Se arma a mano y no con un `...a` para no mandarle al cliente la
  // lista de permisos de cada alerta.
  return visibles
    .map((a) => {
      const cifra = cifras?.[a.clave as keyof Cifras] ?? 0
      return {
        clave: a.clave,
        etiqueta: a.etiqueta,
        apoyo: a.apoyo,
        ruta: a.ruta,
        tono: a.tono,
        cifra,
        vista: cifra <= (yaVisto.get(a.clave) ?? -1),
      }
    })
    .filter((a) => a.cifra > 0)
})

/**
 * Deja constancia de que esta persona ya revisó lo que hay ahora. No
 * borra nada: si mañana hay una urgente más, la alerta vuelve a
 * destacarse sola.
 */
export async function marcarAlertasRevisadas() {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return

  const alertas = await alertasDelUsuario()
  if (alertas.length === 0) return

  await conTenant(tenant.id, async (tx) => {
    for (const a of alertas) {
      await tx`
        insert into alertas_vistas (tenant_id, usuario_id, clave, cifra_vista, visto_en)
        values (${tenant.id}, ${sesion.usuarioId}, ${a.clave}, ${a.cifra}, now())
        on conflict (tenant_id, usuario_id, clave)
        do update set cifra_vista = excluded.cifra_vista, visto_en = now()`
    }
  })
}
