import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { permisosDelUsuario } from '@/lib/permisos'
import { aCsv, respuestaCsv, nombreConFecha } from '@/lib/csv'

/**
 * Exporta el listado de peticiones respetando los filtros de la pantalla.
 *
 * La exportación de datos personales queda registrada en bitácora: un
 * archivo con nombres y teléfonos sale del sistema y tiene que saberse
 * quién se lo llevó, cuándo y con qué filtros.
 */
export async function GET(peticion: Request) {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return new Response('Sin sesión', { status: 401 })

  const permisos = await permisosDelUsuario()
  const puede = [...permisos].some((p) => p.startsWith('creacion_de_peticion') || p.startsWith('estadisticas.peticiones'))
  if (!puede) return new Response('Sin permiso', { status: 403 })

  const url = new URL(peticion.url)
  const texto = (n: string) => url.searchParams.get(n)?.trim() || null

  const q = texto('q')
  const estatus = texto('estatus')
  const problematica = texto('problematica')
  const prioridad = texto('prioridad')

  const filas = await conTenant(tenant.id, async (tx) => {
    const datos = await tx<Record<string, unknown>[]>`
      select upper(substr(p.id::text, 1, 6)) as folio,
             to_char(p.fecha_apertura, 'DD/MM/YYYY') as fecha,
             to_char(p.fecha_cierre, 'DD/MM/YYYY') as cierre,
             coalesce(ci.nombre_completo, concat_ws(' ', ci.nombre, ci.apellido_paterno)) as ciudadano,
             ci.telefono_movil as telefono,
             ci.colonia,
             s.clave as seccion,
             pr.titulo as problematica,
             sp.titulo as subproblematica,
             pri.descripcion as prioridad,
             e.descripcion as estatus,
             f.descripcion as fuente,
             d.descripcion as dependencia,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
             p.descripcion
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join secciones s on s.id = p.seccion_id
      left join problematicas pr on pr.id = p.problematica_id
      left join subproblematicas sp on sp.id = p.subproblematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join prioridades pri on pri.id = p.prioridad_id
      left join fuentes f on f.id = p.fuente_id
      left join dependencias d on d.id = p.dependencia_id
      left join operadores o on o.id = p.operador_id
      left join usuarios u on u.id = o.usuario_id
      where (${q}::text is null or (
              ci.nombre_completo ilike ${'%' + (q ?? '') + '%'}
              or ci.colonia ilike ${'%' + (q ?? '') + '%'}
              or p.descripcion ilike ${'%' + (q ?? '') + '%'}))
        and (${estatus}::text is null or e.descripcion = ${estatus})
        and (${problematica}::text is null or pr.titulo = ${problematica})
        and (${prioridad}::text is null or pri.descripcion = ${prioridad})
      order by p.fecha_apertura desc nulls last`

    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, detalle)
      values (${tenant.id}, ${sesion.usuarioId}, 'exportacion', 'peticiones',
              ${tx.json({ filas: datos.length, filtros: { q, estatus, problematica, prioridad } })})`

    return datos
  })

  const csv = aCsv(
    [
      { clave: 'folio', titulo: 'Folio' },
      { clave: 'fecha', titulo: 'Fecha de alta' },
      { clave: 'cierre', titulo: 'Fecha de cierre' },
      { clave: 'ciudadano', titulo: 'Ciudadano' },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'colonia', titulo: 'Colonia' },
      { clave: 'seccion', titulo: 'Sección' },
      { clave: 'problematica', titulo: 'Problemática' },
      { clave: 'subproblematica', titulo: 'Sub-problemática' },
      { clave: 'prioridad', titulo: 'Prioridad' },
      { clave: 'estatus', titulo: 'Estatus' },
      { clave: 'fuente', titulo: 'Fuente' },
      { clave: 'dependencia', titulo: 'Dependencia' },
      { clave: 'responsable', titulo: 'Responsable' },
      { clave: 'descripcion', titulo: 'Descripción' },
    ],
    filas,
  )

  return respuestaCsv(csv, nombreConFecha('peticiones'))
}
