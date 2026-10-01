import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { permisosDelUsuario } from '@/lib/permisos'
import { Pagina, Distintivo } from '@/components/pagina'
import { fechaHora, fechaLarga } from '@/lib/formato'
import { PERMISOS, alcanza } from '../../catalogo'
import { perfilesActivos, usuarioPorId } from '../../consultas'
import { EdicionUsuario } from '../forma'

export const metadata: Metadata = { title: 'Usuario' }

export default async function Usuario({ params }: { params: Promise<{ id: string }> }) {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) redirect('/entrar')

  const { id } = await params
  // RLS acota la búsqueda a este cliente: el usuario de otra plaza no
  // existe aquí, aunque se escriba su id en la barra de direcciones.
  const usuario = await usuarioPorId(tenant.id, id)
  if (!usuario) notFound()

  const permisos = await permisosDelUsuario()
  const perfiles = await perfilesActivos()

  const nombre =
    [usuario.nombre, usuario.apellido_paterno, usuario.apellido_materno]
      .filter(Boolean)
      .join(' ') || usuario.correo

  return (
    <Pagina
      titulo={nombre}
      descripcion={`${usuario.correo} · alta el ${fechaLarga(usuario.creado_en)} · último acceso ${
        usuario.ultimo_acceso ? fechaHora(usuario.ultimo_acceso) : 'nunca'
      }`}
      acciones={
        <>
          <Distintivo tono={usuario.activo ? 'exito' : 'neutro'}>
            {usuario.activo ? 'Activo' : 'Inactivo'}
          </Distintivo>
          <Link href="/configuracion?seccion=usuarios" className="boton boton-neutro">
            Volver
          </Link>
        </>
      }
    >
      <EdicionUsuario
        usuario={usuario}
        perfiles={perfiles}
        esUnoMismo={usuario.id === sesion.usuarioId}
        puedeCambiar={alcanza(permisos, PERMISOS.usuariosCambio)}
        puedeDarDeBaja={alcanza(permisos, PERMISOS.usuariosBaja)}
      />
    </Pagina>
  )
}
