import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { municipiosDelCliente } from '../consultas'
import { FormaCiudadano } from '../forma'

export const metadata: Metadata = { title: 'Nuevo ciudadano' }

export default async function NuevoCiudadano() {
  await exigirAcceso('/ciudadanos')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const municipios = await municipiosDelCliente(tenant.estado_id)

  return (
    <Pagina
      titulo="Nuevo ciudadano"
      descripcion="Alta directa al padrón, sin tener que capturar una petición primero"
    >
      <FormaCiudadano municipios={municipios} />
    </Pagina>
  )
}
