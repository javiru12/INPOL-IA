import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { detalleDeActividad, tipoValido } from '../../consultas'
import { delDia } from '../../fechas'
import { cifra, fechaLarga } from '@/lib/formato'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'

export const metadata: Metadata = { title: 'Detalle de actividad' }

const TONO_ESTATUS: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

/** Etiqueta y valor. Lo que falta se marca con raya, nunca se deja en blanco. */
function Dato({
  etiqueta,
  children,
  ancho,
}: {
  etiqueta: string
  children?: React.ReactNode
  ancho?: boolean
}) {
  // `@/lib/formato` ya devuelve raya para lo que viene nulo: se trata igual
  // que un hueco para que se pinte atenuado.
  const vacio =
    children === null || children === undefined || children === '' || children === '—'
  return (
    <div className={ancho ? 'sm:col-span-2' : undefined}>
      <p className="rotulo">{etiqueta}</p>
      <p className={`mt-0.5 ${vacio ? 'text-[var(--color-tinta-3)]' : ''}`}>
        {vacio ? '—' : children}
      </p>
    </div>
  )
}

function SiNo({ valor }: { valor: boolean | null }) {
  if (valor === null) return <span className="text-[var(--color-tinta-3)]">—</span>
  return <Distintivo tono={valor ? 'exito' : 'neutro'}>{valor ? 'Sí' : 'No'}</Distintivo>
}

export default async function DetalleActividad({
  params,
}: {
  params: Promise<{ tipo: string; id: string }>
}) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { tipo: tipoCrudo, id } = await params
  const tipo = tipoValido(tipoCrudo)
  if (!tipo) notFound()

  const a = await detalleDeActividad(tenant.id, tipo, id)
  if (!a) notFound()

  const esRecorrido = tipo === 'recorrido'
  const horario =
    a.inicia && a.termina ? `${a.inicia} a ${a.termina} h` : a.inicia ? `${a.inicia} h` : null

  return (
    <Pagina
      titulo={a.titulo}
      descripcion={[esRecorrido ? 'Recorrido' : 'Evento', a.fecha && fechaLarga(delDia(a.fecha))]
        .filter(Boolean)
        .join(' · ')}
      acciones={
        <Link href="/actividades" className="boton boton-neutro">
          Volver a actividades
        </Link>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <section className="panel px-4 py-3.5">
          <h2 className="mb-3 text-[var(--text-base)] font-semibold">La actividad</h2>

          <p className="mb-4 text-[var(--color-tinta-2)]">
            {a.descripcion ?? <span className="text-[var(--color-tinta-3)]">Sin descripción</span>}
          </p>

          <div className="grid gap-x-6 gap-y-3.5 border-t border-[var(--color-borde)] pt-3.5 sm:grid-cols-2">
            <Dato etiqueta="Fecha">{fechaLarga(delDia(a.fecha))}</Dato>
            <Dato etiqueta="Horario">{horario}</Dato>
            <Dato etiqueta="Responsable">{a.responsable}</Dato>
            <Dato etiqueta="Colonia">{a.colonia}</Dato>

            {esRecorrido ? (
              <>
                <Dato etiqueta="Punto de partida">{a.partida}</Dato>
                <Dato etiqueta="Punto de llegada">{a.llegada}</Dato>
              </>
            ) : (
              <>
                <Dato etiqueta="Dirección">{a.direccion}</Dato>
                <Dato etiqueta="Entre calles">{a.entre}</Dato>
                <Dato etiqueta="Código postal">{a.cp}</Dato>
              </>
            )}
          </div>
        </section>

        <section className="panel px-4 py-3.5">
          <h2 className="mb-3 text-[var(--text-base)] font-semibold">Logística</h2>

          <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Dato etiqueta="Asistentes programados">{cifra(a.programados)}</Dato>
            <Dato etiqueta="Asistentes reales">{cifra(a.reales)}</Dato>
            <Dato etiqueta="Prensa">
              <SiNo valor={a.prensa} />
            </Dato>
            <Dato etiqueta="Montaje">
              <SiNo valor={a.montaje} />
            </Dato>
            <Dato etiqueta="Vestimenta">{a.vestimenta}</Dato>
            {/* El tipo de visita solo existe en eventos; los recorridos no lo tienen. */}
            {!esRecorrido && <Dato etiqueta="Tipo de visita">{a.visita}</Dato>}
            <Dato etiqueta="Detalle de logística" ancho>
              {a.logistica}
            </Dato>
            <Dato etiqueta="Notas adicionales" ancho>
              {a.notas}
            </Dato>
          </div>
        </section>
      </div>

      <section className="mt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[var(--text-base)] font-semibold">Peticiones levantadas</h2>
          {a.peticiones.length > 0 && (
            <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              {cifra(a.peticiones.length)} en esta actividad
            </span>
          )}
        </div>

        {a.peticiones.length === 0 ? (
          <Vacio
            titulo="No se levantaron peticiones aquí"
            descripcion={`Cuando el equipo capture solicitudes durante ${esRecorrido ? 'este recorrido' : 'este evento'} y las vincule a la actividad, aparecerán en esta lista.`}
            accion={
              <Link href="/peticiones" className="boton boton-neutro">
                Ver todas las peticiones
              </Link>
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Ciudadano</th>
                    <th>Problemática</th>
                    <th>Estatus</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {a.peticiones.map((p) => (
                    <tr key={p.id}>
                      <td className="clave">{p.folio}</td>
                      <td className="whitespace-nowrap font-medium">{p.ciudadano ?? '—'}</td>
                      <td className="text-[var(--color-tinta-2)]">{p.problematica ?? '—'}</td>
                      <td>
                        <Distintivo tono={TONO_ESTATUS[p.estatus ?? ''] ?? 'neutro'}>
                          {p.estatus ?? 'Sin estatus'}
                        </Distintivo>
                      </td>
                      <td className="w-10">
                        <Link
                          href={`/peticiones/${p.id}`}
                          className="boton boton-llano !h-7 text-[var(--text-menuda)]"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </Pagina>
  )
}
