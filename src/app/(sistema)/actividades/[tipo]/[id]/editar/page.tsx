import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { catalogosDeActividad, actividadParaEditar } from '../../../consultas'
import { FormaActividad, type DatosActividad } from '../../../forma'

export const metadata: Metadata = { title: 'Editar actividad' }

export default async function EditarActividad({
  params,
}: {
  params: Promise<{ tipo: string; id: string }>
}) {
  await exigirAcceso('/actividades')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { tipo, id } = await params
  if (tipo !== 'evento' && tipo !== 'recorrido') notFound()

  const [actividad, catalogos] = await Promise.all([
    actividadParaEditar(tenant.id, tipo, id),
    catalogosDeActividad(tenant.id, tenant.estado_id),
  ])

  if (!actividad) notFound()

  return (
    <Pagina
      titulo={`Editar ${tipo === 'evento' ? 'evento' : 'recorrido'}`}
      descripcion={String(actividad.titulo ?? '')}
    >
      <FormaActividad
        municipios={catalogos.municipios}
        responsables={catalogos.responsables}
        actividad={actividad as unknown as DatosActividad}
      />
    </Pagina>
  )
}
