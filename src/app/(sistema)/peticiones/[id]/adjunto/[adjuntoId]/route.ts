import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { leer } from '@/lib/almacen'

/**
 * Entrega un archivo adjunto.
 *
 * Los archivos no viven en `public/`: se sirven por aquí para poder
 * comprobar antes que quien los pide tiene sesión y pertenece al cliente
 * dueño de la petición. La evidencia de una gestión puede incluir rostros
 * y domicilios; una URL adivinable no es aceptable.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string; adjuntoId: string }> },
) {
  const { adjuntoId } = await params

  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return new Response('Sin sesión', { status: 401 })
  if (sesion.tenantId !== tenant.id) return new Response('Sin acceso', { status: 403 })

  if (!/^[0-9a-f-]{36}$/i.test(adjuntoId)) {
    return new Response('No encontrado', { status: 404 })
  }

  // Row Level Security se encarga de que un adjunto de otro cliente
  // sencillamente no aparezca.
  const adjunto = await conTenant(tenant.id, async (tx) => {
    const [a] = await tx<
      { ruta: string; tipo_mime: string; nombre_original: string }[]
    >`
      select ruta, tipo_mime, nombre_original
      from adjuntos
      where id = ${adjuntoId} and activo`
    return a ?? null
  })

  if (!adjunto) return new Response('No encontrado', { status: 404 })

  const contenido = await leer(adjunto.ruta)
  if (!contenido) return new Response('El archivo ya no está disponible', { status: 410 })

  return new Response(new Uint8Array(contenido), {
    headers: {
      'content-type': adjunto.tipo_mime,
      'content-disposition': `inline; filename="${encodeURIComponent(adjunto.nombre_original)}"`,
      // Se revalida siempre: con `max-age` el navegador seguiría
      // entregando el archivo aunque la persona ya hubiera perdido el
      // acceso o cambiado de cliente.
      'cache-control': 'private, no-cache, must-revalidate',
    },
  })
}
