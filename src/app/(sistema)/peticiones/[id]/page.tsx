import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { conTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { PanelSeguimiento } from './seguimiento'
import { Evidencia, type Adjunto } from './evidencia'
import { LineaDeEtapas } from './linea-etapas'
import { MensajesDePeticion } from '@/app/(sistema)/mensajes/de-peticion'
import { fechaLarga, fechaHora, fechaCorta } from '@/lib/formato'

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
        {
          id: string
          tipo: string
          detalle: string
          autor: string | null
          cuando: string
          estatus_nuevo: string | null
        }[]
      >`
        select s.id, s.tipo, s.detalle, s.estatus_nuevo,
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

  // La petición no guarda responsable: quien la está atendiendo es
  // quien la movió por última vez. Es el dato que falta arriba —abrir
  // una petición y no saber si alguien la tiene es lo peor que puede
  // pasar en esta pantalla—, y sale del propio seguimiento.
  const ultimoMovimiento = seguimientos.find((s) => s.autor)

  // --- La ruta de atención -------------------------------------------
  // Cancelada y «No interpretada» no son etapas del camino: son salirse
  // de él. Pintarlas en la línea haría creer que cancelar es avanzar.
  const RUTA = ['Abierta', 'En proceso', 'En gestión', 'Completada'] as const
  const enOrden = [...seguimientos].reverse()

  const etapas = RUTA.map((nombre) => {
    const llegada =
      nombre === 'Abierta'
        ? p.fecha_apertura
        : enOrden.find((s) => s.estatus_nuevo === nombre)?.cuando ?? null
    return { nombre, fecha: llegada ? fechaCorta(llegada) : null }
  })

  const indiceActual = RUTA.indexOf((p.estatus ?? '') as (typeof RUTA)[number])

  // Desde cuándo está en la etapa en la que está.
  const entroEnLaEtapa =
    indiceActual === 0
      ? p.fecha_apertura
      : enOrden.find((s) => s.estatus_nuevo === p.estatus)?.cuando ?? null
  // Sin tocar el espacio: Postgres manda '2026-09-30 16:30:00+00' y
  // cambiarlo por una T lo vuelve ISO mal formado —el huso pide
  // '+00:00'— y Date lo rechaza. Con el espacio, V8 sí lo parsea.
  const entroEl = entroEnLaEtapa ? new Date(entroEnLaEtapa) : null
  const diasEnLaEtapa =
    entroEl && !Number.isNaN(entroEl.getTime())
      ? Math.max(0, Math.floor((Date.now() - entroEl.getTime()) / 86400000))
      : null

  // Problemática y prioridad ya van en el encabezado: repetirlas aquí
  // hacía leer dos veces lo mismo antes de llegar a lo que no se sabe.
  const campos: [string, string | null][] = [
    ['Fuente', p.fuente],
    ['Dependencia responsable', p.dependencia],
    ['Levantada el', p.fecha_apertura ? fechaLarga(p.fecha_apertura) : null],
    ['Cerrada el', p.fecha_cierre ? fechaLarga(p.fecha_cierre) : null],
  ]

  return (
    <Pagina
      titulo={`Petición ${p.folio}`}
      insignias={
        <>
          <Distintivo tono={TONO[p.estatus ?? ''] ?? 'neutro'}>
            {p.estatus ?? 'Sin estatus'}
          </Distintivo>
          {p.prioridad === 'Urgente' && <Distintivo tono="alerta">Urgente</Distintivo>}
        </>
      }
      descripcion={
        [
          [p.problematica, p.subproblematica].filter(Boolean).join(' · ') || 'Sin clasificar',
          ultimoMovimiento
            ? `La movió ${ultimoMovimiento.autor} el ${fechaHora(ultimoMovimiento.cuando)}`
            : 'Nadie la ha movido todavía',
        ].join(' · ')
      }
      acciones={
        <Link href="/peticiones" className="boton boton-neutro">
          Volver al listado
        </Link>
      }
    >
      <LineaDeEtapas
        etapas={etapas}
        actual={indiceActual}
        diasEnLaEtapa={diasEnLaEtapa}
        desviada={indiceActual < 0 ? (p.estatus ?? 'Sin estatus') : null}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-4">
          <section className="panel px-5 py-5">
            <h2 className="rotulo mb-2">Lo que pidió</h2>
            <p className="text-[length:var(--text-titulo)] leading-relaxed">
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
              // Lo que pasó va en el cuerpo del texto, no en letra chica:
              // era lo mismo de tamaño y color que el «quién y cuándo»,
              // y había que leerlo dos veces para distinguirlos.
              <ol className="px-5 py-4">
                {seguimientos.map((s, i) => {
                  const cambio = s.tipo === 'cambio_estatus'
                  return (
                    <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          aria-hidden="true"
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            cambio ? '' : 'ring-1 ring-[var(--color-borde-fuerte)]'
                          }`}
                          style={{
                            background: cambio
                              ? 'var(--color-acento)'
                              : 'var(--color-superficie)',
                          }}
                        />
                        {i < seguimientos.length - 1 && (
                          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-[var(--color-borde)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span
                            className="distintivo"
                            style={
                              cambio
                                ? { background: 'var(--color-acento-suave)', color: 'var(--color-acento-fuerte)' }
                                : { background: 'var(--color-superficie-2)', color: 'var(--color-tinta-2)', border: '1px solid var(--color-borde)' }
                            }
                          >
                            {ETIQUETA_TIPO[s.tipo] ?? s.tipo}
                          </span>
                          <span className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                            {s.autor ?? 'Sistema'} · {fechaHora(s.cuando)}
                          </span>
                        </p>
                        <p className="mt-1.5 leading-relaxed">{s.detalle}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-4">
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
