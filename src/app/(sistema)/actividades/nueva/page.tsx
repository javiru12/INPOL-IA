import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { catalogosDeActividad } from '../consultas'
import { FormaActividad } from '../forma'

export const metadata: Metadata = { title: 'Nueva actividad' }

export default async function NuevaActividad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/actividades')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  // Al llegar desde un día del calendario, esa fecha viene puesta.
  const sp = await searchParams
  const crudo = typeof sp.fecha === 'string' ? sp.fecha : undefined
  const fecha = crudo && /^\d{4}-\d{2}-\d{2}$/.test(crudo) ? crudo : undefined

  const { municipios, responsables } = await catalogosDeActividad(tenant.id, tenant.estado_id)

  return (
    <Pagina
      titulo="Nueva actividad"
      descripcion="Un evento o un recorrido, con su fecha, su lugar y quién responde"
    >
      <FormaActividad municipios={municipios} responsables={responsables} fechaInicial={fecha} />
    </Pagina>
  )
}
