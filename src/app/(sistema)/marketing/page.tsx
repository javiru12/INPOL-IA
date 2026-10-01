import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { IconoVer } from '@/components/iconos'
import { fechaCorta, cifra } from '@/lib/formato'
import { CANALES, describirSegmento } from './catalogo'
import {
  POR_PAGINA,
  listarAvisosPendientes,
  listarCampanias,
  resumenComunicacion,
} from './consultas'
import { RegistrarAviso } from './avisos'

export const metadata: Metadata = { title: 'Comunicación' }

const ETIQUETA_CANAL = Object.fromEntries(CANALES.map((c) => [c.valor, c.etiqueta]))

/** El retraso del aviso es el dato que duele: se colorea, no se decora. */
function tonoDemora(dias: number) {
  if (dias >= 30) return 'alerta' as const
  if (dias >= 7) return 'aviso' as const
  return 'neutro' as const
}

export default async function Comunicacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/marketing')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const [resumen, avisos, campanias] = await Promise.all([
    resumenComunicacion(tenant.id),
    listarAvisosPendientes(tenant.id, {
      q: texto(sp.q),
      estatus: texto(sp.estatus),
      problematica: texto(sp.problematica),
      pagina: Number(texto(sp.pagina) ?? 1) || 1,
    }),
    listarCampanias(tenant.id),
  ])

  return (
    <Pagina
      titulo="Comunicación"
      descripcion="Avisarle al ciudadano qué pasó con su petición, y mandar campañas segmentadas"
      acciones={
        <Link href="/marketing/nueva" className="boton boton-primario">
          Nueva campaña
        </Link>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          etiqueta="Sin avisar"
          valor={resumen.pendientes}
          tono={resumen.pendientes > 0 ? 'alerta' : 'exito'}
          pie="Peticiones con desenlace que el ciudadano no conoce"
        />
        <Indicador
          etiqueta="Espera promedio"
          valor={`${cifra(resumen.dias_promedio)} d`}
          tono={resumen.dias_promedio >= 30 ? 'alerta' : 'aviso'}
          pie={`El caso más viejo lleva ${cifra(resumen.mas_antiguo)} días`}
        />
        <Indicador
          etiqueta="Avisados · 30 días"
          valor={resumen.avisados_30}
          tono="exito"
          pie="Avisos individuales registrados"
        />
        <Indicador
          etiqueta="Campañas"
          valor={resumen.campanias}
          pie={`${cifra(resumen.preparados)} destinatarios preparados`}
        />
      </div>

      {/* ---------- Avisos pendientes ---------- */}
      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-[var(--text-media)] font-semibold">Avisos pendientes</h2>
            <p className="mt-0.5 max-w-3xl text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Peticiones que ya se resolvieron o se cancelaron y cuyo ciudadano todavía
              no lo sabe. Mientras nadie le avise, para esa persona el gobierno no hizo
              nada.
            </p>
          </div>
        </div>

        <Filtros
          busqueda={{ nombre: 'q', marcador: 'Buscar por ciudadano, colonia o petición…' }}
          selectores={[
            {
              nombre: 'estatus',
              etiqueta: 'Desenlace',
              vacio: 'Desenlace: todos',
              opciones: [
                { valor: 'Completada', etiqueta: 'Completada' },
                { valor: 'Cancelada', etiqueta: 'Cancelada' },
              ],
            },
            {
              nombre: 'problematica',
              etiqueta: 'Problemática',
              opciones: avisos.problematicas,
            },
          ]}
        />

        {avisos.total === 0 ? (
          <Vacio
            titulo="Nadie está esperando una respuesta"
            descripcion="Toda petición con desenlace tiene su aviso registrado. Si acabas de filtrar, prueba quitando algún filtro."
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Ciudadano</th>
                    <th>Contacto</th>
                    <th>Qué pidió</th>
                    <th>Desenlace</th>
                    <th className="num">Se resolvió</th>
                    <th className="num">Sin avisar</th>
                    <th aria-label="Registrar aviso" />
                  </tr>
                </thead>
                <tbody>
                  {avisos.filas.map((a) => (
                    <tr key={a.id}>
                      <td className="clave">
                        <Link
                          href={`/peticiones/${a.id}`}
                          className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                        >
                          {a.folio}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap font-medium">
                        <Link
                          href={`/ciudadanos/${a.ciudadano_id}`}
                          className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                        >
                          {a.ciudadano ?? '—'}
                        </Link>
                        <span className="block text-[var(--text-micro)] font-normal text-[var(--color-tinta-3)]">
                          {a.colonia ?? 'Sin colonia'}
                        </span>
                      </td>
                      <td className="clave whitespace-nowrap">
                        {a.telefono ?? (
                          <span className="text-[var(--color-alerta)]">Sin teléfono</span>
                        )}
                      </td>
                      <td className="max-w-[24rem]">
                        <span className="block truncate" title={a.descripcion ?? undefined}>
                          {a.descripcion ?? '—'}
                        </span>
                        <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                          {a.problematica ?? 'Sin clasificar'}
                        </span>
                      </td>
                      <td>
                        <Distintivo tono={a.estatus === 'Completada' ? 'exito' : 'neutro'}>
                          {a.estatus}
                        </Distintivo>
                      </td>
                      <td className="num clave whitespace-nowrap">
                        {fechaCorta(a.resuelto_en)}
                      </td>
                      <td className="num whitespace-nowrap">
                        <Distintivo tono={tonoDemora(a.dias)}>
                          {cifra(a.dias)} {a.dias === 1 ? 'día' : 'días'}
                        </Distintivo>
                      </td>
                      <td className="w-[15rem]">
                        <RegistrarAviso
                          peticionId={a.id}
                          tieneTelefono={!!a.telefono}
                          tieneCorreo={!!a.correo}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginador pagina={avisos.pagina} porPagina={POR_PAGINA} total={avisos.total} />
          </div>
        )}
      </section>

      {/* ---------- Campañas ---------- */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-6">
          <div>
            <h2 className="text-[var(--text-media)] font-semibold">Campañas</h2>
            <p className="mt-0.5 max-w-3xl text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Mensajes masivos a un segmento del padrón. INPOL todavía no tiene
              conectado un proveedor de correo, SMS ni WhatsApp: las campañas se
              guardan <strong className="font-semibold">preparadas</strong>, con su
              lista de destinatarios congelada, y ninguna sale hasta que haya por
              dónde mandarla.
            </p>
          </div>
          <Link href="/marketing/nueva" className="boton boton-neutro shrink-0">
            Crear campaña
          </Link>
        </div>

        {campanias.length === 0 ? (
          <Vacio
            titulo="Todavía no hay campañas"
            descripcion="Una campaña define a quién se le escribe y qué dice el mensaje. Al guardarla se congela la lista de destinatarios."
            accion={
              <Link href="/marketing/nueva" className="boton boton-primario">
                Crear la primera
              </Link>
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th>Canal</th>
                    <th>Segmento</th>
                    <th className="num">Destinatarios</th>
                    <th>Estado</th>
                    <th>Preparó</th>
                    <th className="num">Fecha</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {campanias.map((c) => {
                    const criterios = describirSegmento(c.segmento)
                    return (
                      <tr key={c.id}>
                        <td className="max-w-[18rem] font-medium">
                          <span className="block truncate">{c.nombre}</span>
                          {c.asunto && (
                            <span className="block truncate text-[var(--text-micro)] font-normal text-[var(--color-tinta-3)]">
                              {c.asunto}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                          {ETIQUETA_CANAL[c.canal] ?? c.canal}
                        </td>
                        <td className="max-w-[20rem]">
                          {criterios.length === 0 ? (
                            <span className="text-[var(--color-tinta-2)]">
                              Todo el padrón
                            </span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {criterios.map((t) => (
                                <Distintivo key={t} tono="acento">
                                  {t}
                                </Distintivo>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="num font-medium tabular-nums">
                          {cifra(c.destinatarios)}
                        </td>
                        <td>
                          <Distintivo tono={c.estado === 'enviada' ? 'exito' : 'aviso'}>
                            {c.estado === 'preparada' ? 'Preparada · sin enviar' : c.estado}
                          </Distintivo>
                        </td>
                        <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                          {c.autor ?? '—'}
                        </td>
                        <td className="num clave whitespace-nowrap">
                          {fechaCorta(c.creado_en)}
                        </td>
                        <td className="w-10">
                          <Link
                            href={`/marketing/${c.id}`}
                            className="boton boton-llano !h-7 !w-7 !p-0"
                            aria-label={`Ver campaña ${c.nombre}`}
                          >
                            <IconoVer />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </Pagina>
  )
}
