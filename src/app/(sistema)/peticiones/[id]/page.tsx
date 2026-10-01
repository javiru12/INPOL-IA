import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { conTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { PanelSeguimiento } from './seguimiento'
import { Evidencia, type Adjunto } from './evidencia'
import { MensajesDePeticion } from '@/app/(sistema)/mensajes/de-peticion'
import { fechaLarga, fechaHora } from '@/lib/formato'

export const metadata: Metadata = { title: 'Detalle de petición' }

const TONO: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

const ETIQUETA_TIPO: Record<string, string> = {
  nota: 'Nota',
  llamada: 'Llamada',
  visita: 'Visita',
  cambio_estatus: 'Cambio de estatus',
  asignacion: 'Asignación',
  adjunto: 'Adjunto',
}

export default async function DetallePeticion({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const datos = await conTenant(tenant.id, async (tx) => {
    const [peticion] = await tx<
      {
        id: string
        folio: string
        descripcion: string | null
        notas: string | null
        fecha_apertura: string | null
        fecha_cierre: string | null
        ciudadano_id: string | null
        ciudadano: string | null
        telefono: string | null
        colonia: string | null
        seccion: string | null
        problematica: string | null
        subproblematica: string | null
        estatus: string | null
        estatus_id: string | null
        prioridad: string | null
        fuente: string | null
        dependencia: string | null
      }[]
    >`
      select p.id,
             upper(substr(p.id::text, 1, 6)) as folio,
             p.descripcion, p.notas,
             p.fecha_apertura::text as fecha_apertura,
             p.fecha_cierre::text as fecha_cierre,
             ci.id as ciudadano_id,
             nullif(trim(coalesce(ci.nombre_completo,
               concat_ws(' ', ci.nombre, ci.apellido_paterno))), '') as ciudadano,
             ci.telefono_movil as telefono,
             ci.colonia,
             s.clave as seccion,
             pr.titulo as problematica,
             sp.titulo as subproblematica,
             e.descripcion as estatus,
             e.id as estatus_id,
             pri.descripcion as prioridad,
             f.descripcion as fuente,
             d.descripcion as dependencia
      from peticiones p
      left join ciudadanos ci on ci.id = p.ciudadano_id
      left join secciones s on s.id = p.seccion_id
      left join problematicas pr on pr.id = p.problematica_id
      left join subproblematicas sp on sp.id = p.subproblematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      left join prioridades pri on pri.id = p.prioridad_id
      left join fuentes f on f.id = p.fuente_id
      left join dependencias d on d.id = p.dependencia_id
      where p.id = ${id}`

    if (!peticion) return null

    const [seguimientos, estatusPosibles, adjuntos] = await Promise.all([
      tx<
        { id: string; tipo: string; detalle: string; autor: string | null; cuando: string }[]
      >`
        select s.id, s.tipo, s.detalle,
               nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as autor,
               s.creado_en::text as cuando
        from peticion_seguimientos s
        left join usuarios u on u.id = s.usuario_id
        where s.peticion_id = ${id}
        order by s.creado_en desc`,

      tx<{ id: string; descripcion: string }[]>`
        select id, descripcion from estatus_peticiones order by id`,

      tx<Adjunto[]>`
        select a.id, a.clase, a.momento, a.nombre_original, a.descripcion, a.bytes,
               nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as autor,
               a.creado_en::text as cuando
        from adjuntos a
        left join usuarios u on u.id = a.usuario_id
        where a.peticion_id = ${id} and a.activo
        order by a.creado_en`,
    ])

    return { peticion, seguimientos, estatusPosibles, adjuntos }
  })

  if (!datos) notFound()
  const { peticion: p, seguimientos, estatusPosibles, adjuntos } = datos

  const campos: [string, string | null][] = [
    ['Problemática', [p.problematica, p.subproblematica].filter(Boolean).join(' · ') || null],
    ['Prioridad', p.prioridad],
    ['Fuente', p.fuente],
    ['Dependencia responsable', p.dependencia],
    ['Levantada el', p.fecha_apertura ? fechaLarga(p.fecha_apertura) : null],
    ['Cerrada el', p.fecha_cierre ? fechaLarga(p.fecha_cierre) : null],
  ]

  return (
    <Pagina
      titulo={`Petición ${p.folio}`}
      descripcion={p.problematica ?? 'Sin clasificar'}
      acciones={
        <Link href="/peticiones" className="boton boton-neutro">
          Volver al listado
        </Link>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Distintivo tono={TONO[p.estatus ?? ''] ?? 'neutro'}>
                {p.estatus ?? 'Sin estatus'}
              </Distintivo>
              {p.prioridad === 'Urgente' && <Distintivo tono="alerta">Urgente</Distintivo>}
              <span className="clave ml-auto">{p.folio}</span>
            </div>

            <p className="text-[var(--text-media)] leading-relaxed">
              {p.descripcion ?? 'Sin descripción capturada.'}
            </p>

            {p.notas && p.notas !== 'N/A' && (
              <p className="mt-3 border-l-2 border-[var(--color-borde-fuerte)] pl-3 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                {p.notas}
              </p>
            )}

            <dl className="mt-5 grid gap-x-6 gap-y-3.5 border-t border-[var(--color-borde)] pt-4 sm:grid-cols-2">
              {campos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="rotulo">{etiqueta}</dt>
                  <dd className="mt-0.5">{valor ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Evidencia peticionId={p.id} adjuntos={adjuntos} />

          <MensajesDePeticion peticionId={p.id} />

          <section className="panel overflow-hidden">
            <h2 className="border-b border-[var(--color-borde)] px-4 py-3 text-[var(--text-base)] font-semibold">
              Historial de seguimiento
            </h2>
            {seguimientos.length === 0 ? (
              <div className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Todavía no hay movimientos registrados.
              </div>
            ) : (
              <ol className="px-4 py-3">
                {seguimientos.map((s, i) => (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background:
                            s.tipo === 'cambio_estatus'
                              ? 'var(--color-acento)'
                              : 'var(--color-borde-fuerte)',
                        }}
                      />
                      {i < seguimientos.length - 1 && (
                        <span aria-hidden="true" className="mt-1 w-px flex-1 bg-[var(--color-borde)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[var(--text-menuda)] font-medium">
                          {ETIQUETA_TIPO[s.tipo] ?? s.tipo}
                        </span>
                        <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                          {s.autor ?? 'Sistema'} · {fechaHora(s.cuando)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                        {s.detalle}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <section className="panel px-4 py-4">
            <h2 className="mb-3 text-[var(--text-base)] font-semibold">Ciudadano</h2>
            {p.ciudadano ? (
              <>
                <p className="font-medium">{p.ciudadano}</p>
                <dl className="mt-3 space-y-2.5">
                  <div>
                    <dt className="rotulo">Teléfono</dt>
                    <dd className="mt-0.5">
                      {p.telefono ? (
                        <a href={`tel:${p.telefono}`} className="text-[var(--color-acento-fuerte)] hover:underline">
                          {p.telefono}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="rotulo">Colonia</dt>
                    <dd className="mt-0.5">{p.colonia ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="rotulo">Sección electoral</dt>
                    <dd className="clave mt-0.5">{p.seccion ?? '—'}</dd>
                  </div>
                </dl>
                {p.ciudadano_id && (
                  <Link
                    href={`/ciudadanos/${p.ciudadano_id}`}
                    className="boton boton-neutro mt-4 w-full"
                  >
                    Ver expediente
                  </Link>
                )}
              </>
            ) : (
              <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Esta petición no tiene ciudadano asociado.
              </p>
            )}
          </section>

          <PanelSeguimiento
            peticionId={p.id}
            estatusActual={p.estatus_id}
            estatusPosibles={estatusPosibles}
          />
        </div>
      </div>
    </Pagina>
  )
}
