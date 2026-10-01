import Link from 'next/link'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puedeAlgoDe } from '@/lib/permisos'
import { Distintivo } from '@/components/pagina'
import { fechaHora } from '@/lib/formato'
import { hilosDePeticion } from './consultas'

/**
 * Los mensajes que el equipo ha cruzado sobre una petición, para
 * enseñarlos dentro de su expediente.
 *
 * Se dibuja sola: pregunta por el tenant y la sesión, y no devuelve nada
 * si el perfil no tiene el módulo de mensajes. Así el detalle de la
 * petición la incluye con una línea y sin condicionales.
 */
export async function MensajesDePeticion({ peticionId }: { peticionId: string }) {
  if (!(await puedeAlgoDe('mensajes'))) return null

  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return null

  const hilos = await hilosDePeticion(tenant.id, sesion.usuarioId, peticionId)

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--color-borde)] px-4 py-3">
        <h2 className="text-[var(--text-base)] font-semibold">Mensajes del equipo</h2>
        <Link
          href={`/mensajes?peticion=${peticionId}`}
          className="boton boton-llano !h-7 ml-auto text-[var(--text-menuda)]"
        >
          Escribir sobre esta petición
        </Link>
      </div>

      {hilos.length === 0 ? (
        <p className="px-4 py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Nadie ha preguntado nada sobre esta petición.
        </p>
      ) : (
        <ul>
          {hilos.map((h) => (
            <li key={h.id} className="border-b border-[var(--color-borde)] last:border-b-0">
              {h.mio ? (
                <Link
                  href={`/mensajes/${h.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--color-acento-suave)]"
                >
                  <Resumen hilo={h} />
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <Resumen hilo={h} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Resumen({
  hilo,
}: {
  hilo: { asunto: string; entre: string; mensajes: number; ultimo_en: string; mio: boolean }
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{hilo.asunto}</span>
          {!hilo.mio && <Distintivo>Ajena</Distintivo>}
        </span>
        <span className="mt-0.5 block truncate text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {hilo.entre} · {hilo.mensajes} mensaje{hilo.mensajes === 1 ? '' : 's'}
        </span>
      </span>
      <span className="clave shrink-0 whitespace-nowrap">{fechaHora(hilo.ultimo_en)}</span>
    </>
  )
}
