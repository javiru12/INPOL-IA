import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puede } from '@/lib/permisos'
import { aXlsx, respuestaXlsx, nombreConFechaXlsx } from '@/lib/xlsx'
import { zonaDeEstado } from '@/lib/zona'
import { filasParaExportar } from '../consultas'

/**
 * Exporta el listado de peticiones respetando los filtros de la pantalla.
 *
 * Sale en .xlsx y no en CSV: en CSV no hay forma de que los acentos y las
 * fechas se vean bien a la vez en cualquier Excel. El porqué está en
 * `src/lib/xlsx.ts`.
 *
 * La exportación de datos personales queda registrada en bitácora: un
 * archivo con nombres y teléfonos sale del sistema y tiene que saberse
 * quién se lo llevó, cuándo y con qué filtros.
 */
export async function GET(peticion: Request) {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return new Response('Sin sesión', { status: 401 })

  // Ver un listado en pantalla y descargarlo no son lo mismo: lo
  // descargado ya no está bajo control de nadie. Por eso es su propio
  // permiso y no se deduce de poder capturar peticiones.
  if (!(await puede('exportacion.peticiones'))) {
    return new Response('Tu perfil no tiene permiso para exportar.', { status: 403 })
  }

  const url = new URL(peticion.url)
  const texto = (n: string) => url.searchParams.get(n)?.trim() || undefined

  const filtros = {
    q: texto('q'),
    estatus: texto('estatus'),
    problematica: texto('problematica'),
    prioridad: texto('prioridad'),
    pendientes: url.searchParams.get('pendientes') === 'si',
    mes: texto('mes'),
    municipio: texto('municipio'),
  }

  const filas = await filasParaExportar(tenant.id, filtros, tenant.estado_clave)

  await conTenant(tenant.id, async (tx) => {
    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'exportacion', 'peticiones',
              ${tx.json({ filas: filas.length, filtros })})`
  })

  const libro = aXlsx(
    [
      { clave: 'folio', titulo: 'Folio' },
      { clave: 'fecha', titulo: 'Fecha de alta', tipo: 'fecha' },
      { clave: 'cierre', titulo: 'Fecha de cierre', tipo: 'fecha' },
      { clave: 'ciudadano', titulo: 'Ciudadano' },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'colonia', titulo: 'Colonia' },
      { clave: 'municipio', titulo: 'Municipio' },
      { clave: 'seccion', titulo: 'Sección' },
      { clave: 'problematica', titulo: 'Problemática' },
      { clave: 'subproblematica', titulo: 'Sub-problemática' },
      { clave: 'prioridad', titulo: 'Prioridad' },
      { clave: 'estatus', titulo: 'Estatus' },
      { clave: 'responsable', titulo: 'Responsable' },
      { clave: 'descripcion', titulo: 'Descripción' },
    ],
    filas,
    'Peticiones',
  )

  return respuestaXlsx(
    libro,
    nombreConFechaXlsx('peticiones', zonaDeEstado(tenant.estado_clave)),
  )
}
