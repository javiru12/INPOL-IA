'use server'

import { revalidatePath } from 'next/cache'
import { marcarAlertasRevisadas } from '@/lib/alertas'

/**
 * «Ya las vi todas.» No borra el trabajo pendiente —las peticiones
 * urgentes siguen ahí— sino que guarda la cifra actual para que la
 * campana deje de reclamar hasta que el número suba.
 */
export async function marcarTodoRevisado() {
  await marcarAlertasRevisadas()
  revalidatePath('/', 'layout')
}
