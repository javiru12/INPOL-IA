import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { puede } from '@/lib/permisos'
import { Pagina, Distintivo } from '@/components/pagina'
import { fechaHora } from '@/lib/formato'
import { nombrePerfil } from '@/lib/perfiles'
import { leerHilo } from '../consultas'
import { MarcarVisto, Responder, ArchivarHilo } from './responder'

export const metadata: Metadata = { title: 'Conversación' }

export default async function DetalleHilo({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirAcceso('/mensajes')
  const { id } = await params
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) redirect('/entrar')

  const datos = await leerHilo(tenant.id, sesion.usuarioId, id)
  if (!datos) notFound()
  const { hilo, mensajes } = datos

  const pendientes = mensajes.some((m) => !m.mio && !m.leido_en)
  const puedeResponder = await puede('mensajes.responder_mensajes')

  return (
    <Pagina
      titulo={hilo.asunto}
      descripcion={`Conversación con ${hilo.contraparte ?? 'un compañero'} · ${nombrePerfil(
        hilo.contraparte_perfil,
      )}`}
      acciones={
        <Link href="/mensajes" className="boton boton-neutro">
          Volver a la bandeja
        </Link>
      }
    >
      {/* Abrir el hilo es haberlo leído: la marca y el contador de la
          campana se actualizan desde aquí. */}
      <MarcarVisto hiloId={hilo.id} pendientes={pendientes} />

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">Mensajes</h2>
            {hilo.archivado && <Distintivo>Archivado</Distintivo>}
            <span className="clave ml-auto">
              {mensajes.length} mensaje{mensajes.length === 1 ? '' : 's'}
            </span>
          </div>

          <ol className="space-y-3 px-4 py-4">
            {mensajes.map((m) => (
              <li
                key={m.id}
                className="rounded-[var(--radius-sm)] border px-3 py-2.5"
                style={{
                  background: m.mio ? 'var(--color-acento-suave)' : 'var(--color-superficie-2)',
                  borderColor: m.mio ? 'var(--color-acento-borde)' : 'var(--color-borde)',
                }}
              >
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[var(--text-menuda)] font-semibold">
                    {m.mio ? 'Tú' : (m.autor ?? 'Alguien del equipo')}
                  </span>
                  <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                    {nombrePerfil(m.autor_perfil)} · {fechaHora(m.creado_en)}
                  </span>
                  {m.mio && (
                    <span className="ml-auto text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                      {m.leido_en ? `Visto ${fechaHora(m.leido_en)}` : 'Sin leer'}
                    </span>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-line text-[var(--text-base)] leading-relaxed">
                  {m.cuerpo}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <h2 className="mb-3 text-[var(--text-base)] font-semibold">Sobre</h2>
            {hilo.peticion_id ? (
              <>
                <p className="flex items-center gap-2">
                  <span className="clave">{hilo.folio}</span>
                  {hilo.peticion_estatus && (
                    <Distintivo tono="dato">{hilo.peticion_estatus}</Distintivo>
                  )}
                </p>
                <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  {hilo.peticion_descripcion ?? 'Sin descripción capturada.'}
                </p>
                <Link
                  href={`/peticiones/${hilo.peticion_id}`}
                  className="boton boton-neutro mt-4 w-full"
                >
                  Abrir la petición
                </Link>
              </>
            ) : (
              <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Recado suelto: no está ligado a ninguna petición.
              </p>
            )}
          </section>

          {puedeResponder ? (
            <section className="panel px-4 py-4">
              <h2 className="mb-3 text-[var(--text-base)] font-semibold">Responder</h2>
              <Responder hiloId={hilo.id} />
            </section>
          ) : (
            <section className="panel px-4 py-4">
              <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Tu perfil puede leer la conversación, pero no responderla.
              </p>
            </section>
          )}

          <section className="panel px-4 py-4">
            <h2 className="mb-1.5 text-[var(--text-base)] font-semibold">
              {hilo.archivado ? 'Conversación archivada' : 'Archivar'}
            </h2>
            <p className="mb-3 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Un mensaje no se borra. Archivarlo lo saca de la bandeja y lo deja en el
              expediente.
            </p>
            <ArchivarHilo hiloId={hilo.id} archivado={hilo.archivado} />
          </section>
        </div>
      </div>
    </Pagina>
  )
}
