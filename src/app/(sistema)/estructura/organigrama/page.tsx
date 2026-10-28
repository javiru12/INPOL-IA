import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina } from '@/components/pagina'
import { organigrama, posiblesResponsables } from '../consultas'
import { Organigrama } from '../organigrama'

export const metadata: Metadata = { title: 'Organigrama' }

/**
 * El organigrama, en su propia pantalla.
 *
 * Vivía dentro de Estructura, que ya trae indicadores, el equipo, el
 * mapa y los municipios. Con cincuenta personas el árbol es lo más alto
 * de esa pantalla y empuja todo lo demás fuera de la vista. Aquí tiene
 * el ancho completo y no le quita lugar a nada.
 */
export default async function PantallaOrganigrama() {
  await exigirAcceso('/estructura')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const [arbol, responsables] = await Promise.all([
    organigrama(tenant.id),
    posiblesResponsables(tenant.id),
  ])

  return (
    <Pagina
      titulo="Organigrama"
      descripcion="De quién depende cada quien, tal como está capturado"
      acciones={
        <Link href="/estructura" className="boton boton-neutro">
          Volver a Estructura
        </Link>
      }
    >
      <Organigrama nodos={arbol} responsables={responsables} sinTitulo />
    </Pagina>
  )
}
