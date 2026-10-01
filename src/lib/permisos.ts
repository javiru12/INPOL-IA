import 'server-only'
import { cache } from 'react'
import { sinTenant } from './db'
import { leerSesion } from './sesion'

/**
 * Claves de funcionalidad a las que el perfil del usuario tiene acceso.
 * El catálogo es global; lo que cambia entre clientes es quién ocupa
 * cada perfil, no qué puede hacer cada perfil.
 */
export const permisosDelUsuario = cache(async (): Promise<Set<string>> => {
  const sesion = await leerSesion()
  if (!sesion) return new Set()

  const filas = await sinTenant<{ funcionalidad_clave: string }[]>`
    select funcionalidad_clave
    from perfil_funcionalidades
    where perfil_clave = ${sesion.perfil}`

  return new Set(filas.map((f) => f.funcionalidad_clave))
})

export async function puede(clave: string): Promise<boolean> {
  return (await permisosDelUsuario()).has(clave)
}

/** ¿Tiene acceso a algo dentro de esta rama del árbol de funcionalidades? */
export async function puedeAlgoDe(prefijo: string): Promise<boolean> {
  const permisos = await permisosDelUsuario()
  for (const p of permisos) if (p === prefijo || p.startsWith(prefijo + '.')) return true
  return false
}
