import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { listarPeticiones, POR_PAGINA } from './consultas'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { IconoVer } from '@/components/iconos'
import { fechaCorta } from '@/lib/formato'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Peticiones' }

const TONO: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

export default async function Peticiones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/peticiones')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const r = await listarPeticiones(tenant.id, {
    q: texto(sp.q),
    estatus: texto(sp.estatus),
    problematica: texto(sp.problematica),
    prioridad: texto(sp.prioridad),
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  })

  return (
    <Pagina
      titulo="Peticiones"
      descripcion="Solicitudes ciudadanas levantadas en campo, eventos y oficina"
      acciones={
        <>
          <a
            href={`/peticiones/exportar?${new URLSearchParams(
              Object.entries(sp).flatMap(([k, v]) =>
                typeof v === 'string' && v.trim() && k !== 'pagina' ? [[k, v]] : [],
              ) as [string, string][],
            ).toString()}`}
            className="boton boton-neutro"
            download
          >
            Exportar
          </a>
          <Link href="/peticiones/nueva" className="boton boton-primario">
            Nueva petición
          </Link>
        </>
      }
    >
      <Filtros
        busqueda={{ nombre: 'q', marcador: 'Buscar por ciudadano, colonia o descripción…' }}
        selectores={[
          { nombre: 'estatus', etiqueta: 'Estatus', opciones: r.estatus },
          { nombre: 'problematica', etiqueta: 'Problemática', opciones: r.problematicas },
          { nombre: 'prioridad', etiqueta: 'Prioridad', opciones: r.prioridades },
        ]}
      />

      {r.total === 0 ? (
        <Vacio
          titulo="Ninguna petición coincide"
          descripcion="Prueba quitando algún filtro o buscando con otras palabras."
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Ciudadano</th>
                  <th>Petición</th>
                  <th>Colonia</th>
                  <th>Prioridad</th>
                  <th>Estatus</th>
                  <th className="num">Fecha</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {r.filas.map((p) => (
                  <tr key={p.id}>
                    <td className="clave">{p.folio}</td>
                    <td className="whitespace-nowrap font-medium">
                      <Link
                        href={`/ciudadanos/${p.ciudadano_id}`}
                        className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                      >
                        {p.ciudadano ?? '—'}
                      </Link>
                    </td>
                    <td className="max-w-[28rem]">
                      <span className="block truncate" title={p.descripcion ?? undefined}>
                        {p.descripcion ?? '—'}
                      </span>
                      <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                        {[p.problematica, p.subproblematica].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                      {p.colonia ?? '—'}
                    </td>
                    <td>
                      {p.prioridad === 'Urgente' ? (
                        <Distintivo tono="alerta">Urgente</Distintivo>
                      ) : (
                        <span className="text-[var(--color-tinta-2)]">{p.prioridad ?? '—'}</span>
                      )}
                    </td>
                    <td>
                      <Distintivo tono={TONO[p.estatus ?? ''] ?? 'neutro'}>
                        {p.estatus ?? 'Sin estatus'}
                      </Distintivo>
                    </td>
                    <td className="num clave whitespace-nowrap">{fechaCorta(p.fecha)}</td>
                    <td className="w-10">
                      <Link
                        href={`/peticiones/${p.id}`}
                        className="boton boton-llano !h-7 !w-7 !p-0"
                        aria-label={`Ver petición ${p.folio}`}
                      >
                        <IconoVer />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginador pagina={r.pagina} porPagina={POR_PAGINA} total={r.total} />
        </div>
      )}
    </Pagina>
  )
}
