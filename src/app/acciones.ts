'use server'

import { redirect } from 'next/navigation'
import { cerrarSesion } from '@/lib/sesion'

export async function salir() {
  await cerrarSesion()
  redirect('/entrar')
}
