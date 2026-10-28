import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { puede } from '@/lib/permisos'
import { conTenant } from '@/lib/db'
import { Pagina, Vacio } from '@/components/pagina'
import { Tabla } from '@/components/tabla'
import { fechaHora } from '@/lib/formato'
import { FormaImportar } from './forma'
import { destinoPorClave } from './destinos'

export const metadata: Metadata = { title: 'Importar datos' }

export default async function Importar() {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  if (!(await puede('configuracion.importacion_de_datos'))) {
    return (
      <Pagina titulo="Importar datos" descripcion="Subir archivos al sistema">
        <Vacio
          titulo="Tu perfil no puede importar datos"
          descripcion="Traer datos de fuera es un permiso aparte. Pídeselo a un administrador."
        />
      </Pagina>
    )
  }

  const historial = await conTenant(tenant.id, (tx) =>
    tx<{
      id: string
      destino: string
      archivo: string
      fuente: string
      base_legal: string | null
      filas_cargadas: number
      filas_rechazadas: number
      creado_en: string
      quien: string | null
    }[]>`
      select i.id, i.destino, i.archivo, i.fuente, i.base_legal,
             i.filas_cargadas, i.filas_rechazadas,
             i.creado_en::text as creado_en,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as quien
      from importaciones i
      left join usuarios u on u.id = i.usuario_id
      order by i.creado_en desc
      limit 25`,
  )

  return (
    <Pagina
      titulo="Importar datos"
      descripcion="Sube un Excel o un CSV y dile a dónde va"
      acciones={
        <Link href="/configuracion" className="boton boton-neutro">
          Volver a Configuración
        </Link>
      }
    >
      <FormaImportar />

      <section className="panel mt-3 overflow-hidden">
        <div className="border-b border-[var(--color-borde)] px-4 py-3">
          <h2 className="text-[var(--text-base)] font-semibold">Qué se ha cargado</h2>
          <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Cada carga queda registrada con quién la hizo y con qué autorización.
          </p>
        </div>
        {historial.length === 0 ? (
          <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Todavía no se ha importado ningún archivo.
          </p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Archivo</th>
                <th>Fue a</th>
                <th>Fuente</th>
                <th className="hidden xl:table-cell">Autorización</th>
                <th>Quién</th>
                <th className="num">Cargadas</th>
                <th className="num">Fuera</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td className="clave whitespace-nowrap">{fechaHora(h.creado_en)}</td>
                  <td className="max-w-[12rem]">
                    <span className="block truncate" title={h.archivo}>
                      {h.archivo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {destinoPorClave(h.destino)?.etiqueta ?? h.destino}
                  </td>
                  {/* Fuente y autorización pueden ser largas: se
                      encogen con el texto completo en el título, en vez
                      de partirse en cuatro renglones. */}
                  <td className="w-full max-w-0 text-[var(--color-tinta-2)]">
                    <span className="block truncate" title={h.fuente}>
                      {h.fuente}
                    </span>
                  </td>
                  <td className="hidden max-w-[14rem] xl:table-cell text-[var(--color-tinta-2)]">
                    <span className="block truncate" title={h.base_legal ?? ''}>
                      {h.base_legal ?? <span className="text-[var(--color-tinta-3)]">No aplica</span>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {h.quien ?? '—'}
                  </td>
                  <td className="num font-medium">
                    {h.filas_cargadas.toLocaleString('es-MX')}
                  </td>
                  <td
                    className="num"
                    style={h.filas_rechazadas > 0 ? { color: 'var(--color-aviso)' } : undefined}
                  >
                    {h.filas_rechazadas || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </Pagina>
  )
}
