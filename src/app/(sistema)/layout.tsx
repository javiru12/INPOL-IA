import { redirect } from 'next/navigation'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { permisosDelUsuario } from '@/lib/permisos'
import { filtrarNavegacion } from '@/lib/navegacion'
import { conTenant } from '@/lib/db'
import { BarraLateral } from '@/components/barra-lateral'
import { Encabezado } from '@/components/encabezado'

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')

  const sesion = await leerSesion()
  if (!sesion) redirect('/entrar')

  // La sesión se emitió para otro cliente: no vale aquí.
  if (sesion.tenantId !== tenant.id) redirect('/entrar')

  const permisos = await permisosDelUsuario()
  const grupos = filtrarNavegacion(permisos)

  const [campania] = await conTenant(tenant.id, (tx) =>
    tx<{ nombre: string }[]>`
      select nombre from campanias where activo = true order by creado_en desc limit 1`,
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <BarraLateral grupos={grupos} tenant={tenant} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado
          nombre={sesion.nombre}
          perfil={sesion.perfil}
          campania={campania?.nombre ?? null}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
