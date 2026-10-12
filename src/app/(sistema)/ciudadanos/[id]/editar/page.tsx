import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { municipiosDelCliente, ciudadanoParaEditar } from '../../consultas'
import { FormaCiudadano } from '../../forma'

export const metadata: Metadata = { title: 'Editar ciudadano' }

export default async function EditarCiudadano({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirAcceso('/ciudadanos')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { id } = await params
  const [ciudadano, municipios] = await Promise.all([
    ciudadanoParaEditar(tenant.id, id),
    municipiosDelCliente(tenant.estado_id),
  ])

  if (!ciudadano) notFound()

  return (
    <Pagina
      titulo={`Editar a ${ciudadano.nombre ?? 'esta persona'}`}
      descripcion="Los cambios quedan registrados en la bitácora"
    >
      <FormaCiudadano municipios={municipios} ciudadano={ciudadano} />
    </Pagina>
  )
}
