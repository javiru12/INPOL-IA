import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { permisosDelUsuario } from '@/lib/permisos'
import { Pagina } from '@/components/pagina'
import { PERMISOS, alcanza } from '../../catalogo'
import { responsablesPosibles, tiposCampania } from '../../consultas'
import { FormaCampania } from '../forma'

export const metadata: Metadata = { title: 'Nueva campaña' }

export default async function NuevaCampania() {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  if (!alcanza(await permisosDelUsuario(), PERMISOS.campanias)) {
    redirect('/sin-acceso?ruta=/configuracion/campanias/nueva')
  }

  const [tipos, responsables] = await Promise.all([
    tiposCampania(tenant.id),
    responsablesPosibles(tenant.id),
  ])

  return (
    <Pagina
      titulo="Nueva campaña"
      descripcion="La campaña ordena el calendario operativo y cuelga de ella a sus candidatos."
      acciones={
        <Link href="/configuracion?seccion=campanias" className="boton boton-neutro">
          Cancelar
        </Link>
      }
    >
      <div className="max-w-3xl">
        <FormaCampania campania={null} tipos={tipos} responsables={responsables} puedeEditar />
      </div>
    </Pagina>
  )
}
