import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Distintivo } from '@/components/pagina'
import { fechaHora, cifra } from '@/lib/formato'
import { CANALES, describirSegmento } from '../catalogo'
import { detalleCampania } from '../consultas'

export const metadata: Metadata = { title: 'Campaña' }

const ETIQUETA_CANAL = Object.fromEntries(CANALES.map((c) => [c.valor, c.etiqueta]))

export default async function DetalleCampania({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirAcceso('/marketing')
  const { id } = await params
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const datos = await detalleCampania(tenant.id, id)
  if (!datos) notFound()

  const { campania, destinatarios } = datos
  const criterios = describirSegmento(campania.segmento)

  return (
    <Pagina
      titulo={campania.nombre}
      descripcion={`${ETIQUETA_CANAL[campania.canal] ?? campania.canal} · ${cifra(
        campania.destinatarios,
      )} destinatarios · preparada el ${fechaHora(campania.preparada_en)}`}
      acciones={
        <Link href="/marketing" className="boton boton-neutro">
          Volver
        </Link>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <section className="panel px-4 py-4">
          <h2 className="text-[var(--text-base)] font-semibold">Segmento</h2>
          <div className="mt-2.5 flex flex-wrap gap-1">
            {criterios.length === 0 ? (
              <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Todo el padrón, sin filtros.
              </span>
            ) : (
              criterios.map((t) => (
                <Distintivo key={t} tono="acento">
                  {t}
                </Distintivo>
              ))
            )}
          </div>

          <h2 className="mt-5 text-[var(--text-base)] font-semibold">Mensaje</h2>
          {campania.asunto && (
            <p className="mt-2 text-[var(--text-menuda)] font-medium">
              Asunto: {campania.asunto}
            </p>
          )}
          <p className="mt-1.5 whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-superficie-2)] px-3 py-2.5">
            {campania.cuerpo}
          </p>

          <p className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-aviso-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-aviso)]">
            Esta campaña está <strong className="font-semibold">preparada</strong>, no
            enviada. No hay proveedor conectado: nadie ha recibido nada todavía. La lista
            de abajo es exactamente lo que saldría el día que lo haya.
          </p>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">Destinatarios</h2>
            <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {destinatarios.length < campania.destinatarios
                ? `Primeros ${cifra(destinatarios.length)} de ${cifra(campania.destinatarios)}`
                : `${cifra(campania.destinatarios)} en total`}
            </span>
          </div>
          <div className="max-h-[32rem] overflow-auto border-t border-[var(--color-borde)]">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Ciudadano</th>
                  <th>Destino</th>
                  <th>Mensaje personalizado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {destinatarios.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap font-medium">
                      <Link
                        href={`/ciudadanos/${d.ciudadano_id}`}
                        className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                      >
                        {d.ciudadano ?? '—'}
                      </Link>
                    </td>
                    <td className="clave whitespace-nowrap">{d.destino ?? '—'}</td>
                    <td className="max-w-[18rem]">
                      <span className="block truncate" title={d.cuerpo ?? undefined}>
                        {d.cuerpo ?? '—'}
                      </span>
                    </td>
                    <td>
                      <Distintivo tono={d.estado === 'enviado' ? 'exito' : 'aviso'}>
                        {d.estado === 'preparado' ? 'Preparado' : d.estado}
                      </Distintivo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Pagina>
  )
}
