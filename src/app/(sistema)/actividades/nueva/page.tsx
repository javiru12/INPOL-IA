import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { catalogosDeActividad } from '../consultas'
import { FormaActividad } from '../forma'

export const metadata: Metadata = { title: 'Nueva actividad' }

export default async function NuevaActividad() {
  await exigirAcceso('/actividades')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { municipios, responsables } = await catalogosDeActividad(tenant.id, tenant.estado_id)

  return (
    <Pagina
      titulo="Nueva actividad"
      descripcion="Un evento o un recorrido, con su fecha, su lugar y quién responde"
    >
      <FormaActividad municipios={municipios} responsables={responsables} />
    </Pagina>
  )
}
