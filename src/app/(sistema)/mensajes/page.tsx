import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { puede } from '@/lib/permisos'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { Paginador } from '@/components/filtros'
import { fechaHora } from '@/lib/formato'
import { PERFILES } from '@/lib/perfiles'
import {
  BANDEJAS,
  POR_PAGINA,
  companieros,
  esBandeja,
  listarHilos,
  peticionesCitables,
} from './consultas'
import { Redactar } from './redactar'

export const metadata: Metadata = { title: 'Mensajes' }

export default async function Mensajes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/mensajes')
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const bandeja = esBandeja(texto(sp.bandeja))
  const soloSinLeer = texto(sp.estado) === 'no-leidos'
  const peticionId = texto(sp.peticion)
  const puedeEscribir = await puede('mensajes.responder_mensajes')

  const [r, equipo, peticiones] = await Promise.all([
    listarHilos(tenant.id, sesion.usuarioId, {
      bandeja,
      soloSinLeer,
      peticionId,
      pagina: Number(texto(sp.pagina) ?? 1) || 1,
    }),
    puedeEscribir ? companieros(tenant.id, sesion.usuarioId) : Promise.resolve([]),
    puedeEscribir ? peticionesCitables(tenant.id, peticionId) : Promise.resolve([]),
  ])

  const enlace = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | undefined> = {
      bandeja: bandeja === 'recibidos' ? undefined : bandeja,
      estado: soloSinLeer ? 'no-leidos' : undefined,
      peticion: peticionId,
      ...cambios,
    }
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v)
    const q = p.toString()
    return q ? `/mensajes?${q}` : '/mensajes'
  }

  return (
    <Pagina
      titulo="Mensajes"
      descripcion="Recados del equipo sobre las peticiones, sin salirse del sistema"
    >
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-3">
          <div className="panel flex flex-wrap items-center gap-1.5 px-3 py-2.5">
            {BANDEJAS.map((b) => {
              const activa = b.valor === bandeja
              const cifra =
                b.valor === 'recibidos'
                  ? r.tableros.recibidos
                  : b.valor === 'enviados'
                    ? r.tableros.enviados
                    : r.tableros.archivados
              return (
                <Link
                  key={b.valor}
                  href={enlace({ bandeja: b.valor, pagina: undefined })}
                  className={`boton !h-8 text-[var(--text-menuda)] ${
                    activa ? 'boton-neutro' : 'boton-llano'
                  }`}
                  aria-current={activa ? 'page' : undefined}
                >
                  {b.etiqueta}
                  <span className="cifra text-[var(--color-tinta-3)]">{cifra}</span>
                </Link>
              )
            })}

            <span className="ml-auto flex items-center gap-1.5">
              {peticionId && (
                <Link
                  href={enlace({ peticion: undefined, pagina: undefined })}
                  className="boton boton-llano !h-8 text-[var(--text-menuda)]"
                >
                  Quitar filtro de petición
                </Link>
              )}
              <Link
                href={enlace({ estado: soloSinLeer ? undefined : 'no-leidos', pagina: undefined })}
                className={`boton !h-8 text-[var(--text-menuda)] ${
                  soloSinLeer ? 'boton-neutro' : 'boton-llano'
                }`}
              >
                Sin leer
                <span className="cifra text-[var(--color-tinta-3)]">{r.tableros.sin_leer}</span>
              </Link>
            </span>
          </div>

          {r.total === 0 ? (
            <Vacio
              titulo={
                soloSinLeer
                  ? 'No tienes mensajes sin leer'
                  : bandeja === 'enviados'
                    ? 'Todavía no has escrito a nadie'
                    : bandeja === 'archivados'
                      ? 'No hay conversaciones archivadas'
                      : 'Tu bandeja está vacía'
              }
              descripcion={
                puedeEscribir
                  ? 'Cuando necesites preguntar algo sobre una petición, escríbele a quien la trabaja: queda junto al expediente.'
                  : 'Aquí aparecerán los recados que te manden.'
              }
            />
          ) : (
            <div className="panel overflow-hidden">
              <ul>
                {r.filas.map((h) => (
                  <li key={h.id} className="border-b border-[var(--color-borde)] last:border-b-0">
                    <Link
                      href={`/mensajes/${h.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--color-acento-suave)]"
                      style={h.sin_leer > 0 ? { background: 'var(--color-superficie-2)' } : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background:
                            h.sin_leer > 0 ? 'var(--color-acento)' : 'var(--color-borde-fuerte)',
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className={`truncate ${h.sin_leer > 0 ? 'font-semibold' : 'font-medium'}`}
                          >
                            {h.asunto}
                          </span>
                          {h.folio && <span className="clave">{h.folio}</span>}
                          {h.sin_leer > 0 && (
                            <Distintivo tono="acento">
                              {h.sin_leer === 1 ? 'Nuevo' : `${h.sin_leer} nuevos`}
                            </Distintivo>
                          )}
                          {h.archivado && <Distintivo>Archivado</Distintivo>}
                        </span>
                        <span className="mt-0.5 block truncate text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                          {h.ultimo_mio ? 'Tú: ' : ''}
                          {h.ultimo_cuerpo ?? '—'}
                        </span>
                        <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                          {h.contraparte ?? 'Sin destinatario'}
                          {h.contraparte_perfil
                            ? ` · ${PERFILES[h.contraparte_perfil] ?? h.contraparte_perfil}`
                            : ''}
                          {` · ${h.mensajes} mensaje${h.mensajes === 1 ? '' : 's'}`}
                        </span>
                      </span>
                      <span className="clave shrink-0 whitespace-nowrap">
                        {fechaHora(h.ultimo_en)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Paginador pagina={r.pagina} porPagina={POR_PAGINA} total={r.total} />
            </div>
          )}
        </div>

        {puedeEscribir ? (
          <Redactar equipo={equipo} peticiones={peticiones} peticionId={peticionId ?? null} />
        ) : (
          <section className="panel px-4 py-4">
            <h2 className="mb-1.5 text-[var(--text-base)] font-semibold">Nuevo mensaje</h2>
            <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Tu perfil puede leer los mensajes, pero no escribirlos.
            </p>
          </section>
        )}
      </div>
    </Pagina>
  )
}
