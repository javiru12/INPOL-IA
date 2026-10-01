import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { permisosDelUsuario } from '@/lib/permisos'
import { Pagina } from '@/components/pagina'
import { PERMISOS, alcanza } from '../../catalogo'
import { perfilesActivos } from '../../consultas'
import { AltaUsuario } from '../forma'

export const metadata: Metadata = { title: 'Nuevo usuario' }

export default async function NuevoUsuario() {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  // `exigirAcceso` solo comprueba que se alcance la pantalla; dar de alta
  // a alguien es un permiso aparte, y hay perfiles que entran aquí sin
  // tenerlo.
  if (!alcanza(await permisosDelUsuario(), PERMISOS.usuariosAlta)) {
    redirect('/sin-acceso?ruta=/configuracion/usuarios/nuevo')
  }

  const perfiles = await perfilesActivos()

  return (
    <Pagina
      titulo="Nuevo usuario"
      descripcion={`Dale acceso a alguien más de ${tenant.nombre}. Entra con su correo y la contraseña que le pongas aquí.`}
      acciones={
        <Link href="/configuracion?seccion=usuarios" className="boton boton-neutro">
          Cancelar
        </Link>
      }
    >
      <AltaUsuario perfiles={perfiles} />
    </Pagina>
  )
}
