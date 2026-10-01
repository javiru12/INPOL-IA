import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { catalogosSegmento } from '../consultas'
import { FormaCampania } from './forma'

export const metadata: Metadata = { title: 'Nueva campaña' }

export default async function NuevaCampania() {
  await exigirAcceso('/marketing')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  // Los catálogos salen de lo que de verdad hay capturado: ofrecer una
  // colonia sin nadie dentro solo sirve para que el contador dé cero.
  const catalogos = await catalogosSegmento(tenant.id)

  return (
    <Pagina
      titulo="Nueva campaña"
      descripcion="Define a quién se le escribe y qué dice el mensaje. Al guardar se congela la lista de destinatarios."
      acciones={
        <Link href="/marketing" className="boton boton-neutro">
          Cancelar
        </Link>
      }
    >
      <FormaCampania {...catalogos} />
    </Pagina>
  )
}
