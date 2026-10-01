import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { permisosDelUsuario } from '@/lib/permisos'
import { Pagina, Distintivo } from '@/components/pagina'
import { fechaLarga } from '@/lib/formato'
import { PERMISOS, alcanza } from '../../catalogo'
import { campaniaPorId, responsablesPosibles, tiposCampania } from '../../consultas'
import { Candidatos, EstadoCampania, FormaCampania } from '../forma'

export const metadata: Metadata = { title: 'Campaña' }

export default async function Campania({ params }: { params: Promise<{ id: string }> }) {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { id } = await params
  const datos = await campaniaPorId(tenant.id, id)
  if (!datos) notFound()

  const permisos = await permisosDelUsuario()
  const [tipos, responsables] = await Promise.all([
    tiposCampania(tenant.id),
    responsablesPosibles(tenant.id),
  ])

  const puedeCampanias = alcanza(permisos, PERMISOS.campanias)

  return (
    <Pagina
      titulo={datos.campania.nombre}
      descripcion={
        datos.campania.fecha_jornada
          ? `Jornada el ${fechaLarga(datos.campania.fecha_jornada)}`
          : 'Sin fecha de jornada definida'
      }
      acciones={
        <>
          <Distintivo tono={datos.campania.activo ? 'exito' : 'neutro'}>
            {datos.campania.activo ? 'En curso' : 'Archivada'}
          </Distintivo>
          <Link href="/configuracion?seccion=campanias" className="boton boton-neutro">
            Volver
          </Link>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-3">
          <FormaCampania
            campania={datos.campania}
            tipos={tipos}
            responsables={responsables}
            puedeEditar={puedeCampanias}
          />
          <Candidatos
            campaniaId={datos.campania.id}
            candidatos={datos.candidatos}
            puedeEditar={alcanza(permisos, PERMISOS.candidatos)}
          />
        </div>

        {puedeCampanias && <EstadoCampania campania={datos.campania} />}
      </div>
    </Pagina>
  )
}
