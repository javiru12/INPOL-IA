'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { GALLETA_BUSQUEDA } from '@/lib/busqueda-maestra'

export async function fijarBusquedaMaestra(termino: string) {
  const limpio = termino.trim()
  const galletas = await cookies()
  if (limpio.length >= 2) {
    galletas.set(GALLETA_BUSQUEDA, limpio, { httpOnly: false, sameSite: 'lax', path: '/' })
  } else {
    galletas.delete(GALLETA_BUSQUEDA)
  }
  revalidatePath('/', 'layout')
}

export async function limpiarBusquedaMaestra() {
  ;(await cookies()).delete(GALLETA_BUSQUEDA)
  revalidatePath('/', 'layout')
}
