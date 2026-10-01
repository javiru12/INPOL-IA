import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { pulsoDeLaOperacion } from './consultas'
import { Tablero } from './tablero'

export const metadata: Metadata = { title: 'Sala de mando' }

/** Se refresca solo: esta pantalla vive proyectada en una pared. */
export const revalidate = 60

export default async function Sala() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')
  const sesion = await leerSesion()
  if (!sesion) redirect('/entrar')
  if (sesion.tenantId !== tenant.id) redirect('/entrar')

  const pulso = await pulsoDeLaOperacion(tenant.id)

  return (
    <Tablero
      cliente={tenant.nombre_corto ?? tenant.nombre}
      pulso={pulso}
    />
  )
}
