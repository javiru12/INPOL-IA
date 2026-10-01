import 'server-only'
import { redirect } from 'next/navigation'
import { leerSesion } from './sesion'
import { permisosDelUsuario } from './permisos'
import { NAVEGACION } from './navegacion'

/**
 * Autorización del lado del servidor. Esta es la que manda.
 *
 * `src/proxy.ts` corta el paso antes de renderizar, pero se apoya en lo
 * que diga la cookie. Aquí se consultan los permisos reales del perfil
 * contra el catálogo, así que una cookie manipulada no sirve de nada.
 *
 * Toda pantalla dentro de (sistema) que no sea el panel de inicio debe
 * llamar a esto antes de consultar datos.
 */
export async function exigirAcceso(ruta: string) {
  const sesion = await leerSesion()
  if (!sesion) redirect('/entrar')

  const requeridos = NAVEGACION.flatMap((g) => g.entradas).find((e) => e.ruta === ruta)?.permisos

  // Una ruta que no está en la navegación no declara permisos: se permite,
  // porque son pantallas auxiliares (detalle, alta) colgadas de una que sí
  // los declara y ya fue comprobada por su propia ruta base.
  if (!requeridos?.length) return

  const permisos = await permisosDelUsuario()
  const alcanza = requeridos.some((prefijo) => {
    for (const clave of permisos) {
      if (clave === prefijo || clave.startsWith(prefijo + '.')) return true
    }
    return false
  })

  if (!alcanza) redirect(`/sin-acceso?ruta=${encodeURIComponent(ruta)}`)
}
