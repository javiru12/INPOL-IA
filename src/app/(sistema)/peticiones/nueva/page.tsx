import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { conTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { Pagina } from '@/components/pagina'
import { FormaPeticion } from './forma'

export const metadata: Metadata = { title: 'Nueva petición' }

export default async function NuevaPeticion() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const catalogos = await conTenant(tenant.id, async (tx) => {
    const [problematicas, subproblematicas, prioridades, fuentes, dependencias] =
      await Promise.all([
        tx<{ id: string; titulo: string }[]>`
          select id, titulo from problematicas where activo order by titulo`,
        tx<{ id: string; titulo: string; problematica_id: string }[]>`
          select id, titulo, problematica_id from subproblematicas where activo order by titulo`,
        tx<{ id: string; descripcion: string }[]>`
          select id, descripcion from prioridades order by id`,
        tx<{ id: string; descripcion: string }[]>`
          select id, descripcion from fuentes order by descripcion`,
        tx<{ id: string; descripcion: string }[]>`
          select id, descripcion from dependencias order by descripcion`,
      ])
    return { problematicas, subproblematicas, prioridades, fuentes, dependencias }
  })

  return (
    <Pagina
      titulo="Nueva petición"
      descripcion="Registra una solicitud ciudadana levantada en campo, evento, llamada u oficina"
      acciones={
        <Link href="/peticiones" className="boton boton-neutro">
          Cancelar
        </Link>
      }
    >
      <FormaPeticion {...catalogos} />
    </Pagina>
  )
}
