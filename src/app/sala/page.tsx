import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { pulsoDeLaOperacion } from './consultas'
import { Tablero } from './tablero'
import { zonaDeEstado } from '@/lib/zona'

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

  // La hora del servidor, en el huso de la plaza: una sala de Chihuahua
  // no puede decir que sus datos son de una hora que allá no existe.
  const leidoEn = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zonaDeEstado(tenant.estado_clave),
  }).format(new Date())

  return (
    <Tablero
      cliente={tenant.nombre_corto ?? tenant.nombre}
      pulso={pulso}
      leidoEn={leidoEn}
    />
  )
}
