import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  obtenerMovilizador,
  marchaDe,
  UMBRAL_REZAGO,
  ESTADOS,
  ETIQUETA_ESTADO,
  type EstadoProspeccion,
} from '../consultas'
import { FormaAsignarPromovido, SelectorEstado } from '../formas'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { cifra, porcentaje, fechaCorta, fechaLarga } from '@/lib/formato'
import { ESTADO } from '@/lib/paleta'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Ficha del movilizador' }

const TONO: Record<EstadoProspeccion, 'neutro' | 'dato' | 'aviso' | 'exito'> = {
  prospecto: 'neutro',
  contactado: 'dato',
  comprometido: 'aviso',
  confirmado: 'exito',
}

const AFINIDAD: Record<string, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  nula: 'Nula',
}

/** Par etiqueta/valor de la ficha. Lo que falta se dice con un guion. */
function Dato({
  etiqueta,
  valor,
  mono,
  ancho,
}: {
  etiqueta: string
  valor?: string | number | null
  mono?: boolean
  ancho?: boolean
}) {
  const texto = valor === null || valor === undefined || valor === '' ? null : String(valor)
  return (
    <div className={ancho ? 'col-span-2' : undefined}>
      <p className="rotulo">{etiqueta}</p>
      {texto === null ? (
        <p className="mt-0.5 text-[var(--color-tinta-3)]">—</p>
      ) : (
        <p className={mono ? 'clave mt-0.5 block' : 'mt-0.5'}>{texto}</p>
      )}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-[var(--color-borde)] pt-4">
      <h3 className="mb-3 text-[var(--text-menuda)] font-semibold text-[var(--color-tinta-2)]">
        {titulo}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
    </div>
  )
}

export default async function FichaMovilizador({ params }: { params: Promise<{ id: string }> }) {
  // La ficha cuelga de /movilizacion y se comprueba con su mismo permiso:
  // ocultar la entrada del menú no protege una URL que se puede escribir.
  await exigirAcceso('/movilizacion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { id } = await params
  const datos = await obtenerMovilizador(tenant.id, id)
  if (!datos) notFound()

  const { movilizador: m, promovidos, resumen } = datos

  const avance = m.meta ? resumen.promovidos / m.meta : 0
  const marcha = marchaDe(avance)
  const faltan = Math.max(m.meta - resumen.promovidos, 0)

  const porEstado = ESTADOS.map((estado) => ({
    estado,
    n: promovidos.filter((p) => p.estado === estado).length,
  }))

  const contexto = [
    m.tipo,
    m.municipio && (m.seccion ? `${m.municipio} · sección ${m.seccion}` : m.municipio),
    m.colonia,
  ].filter(Boolean)

  return (
    <Pagina
      titulo={m.nombre}
      descripcion={contexto.join(' · ') || 'Sin zona capturada'}
      acciones={
        <>
          <Link href={`/ciudadanos/${m.ciudadanoId}`} className="boton boton-neutro">
            Ver su ficha ciudadana
          </Link>
          <Link href="/movilizacion" className="boton boton-neutro">
            Volver a la red
          </Link>
        </>
      }
    >
      <div className="grid items-start gap-3 lg:grid-cols-[21rem_1fr]">
        <div className="space-y-3">
          <section className="panel px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[var(--text-base)] font-semibold">Su meta</h2>
              {marcha === 'cumplida' ? (
                <Distintivo tono="exito">Meta cumplida</Distintivo>
              ) : marcha === 'rezago' ? (
                <Distintivo tono="alerta">En rezago</Distintivo>
              ) : (
                <Distintivo tono="dato">En camino</Distintivo>
              )}
            </div>

            <p
              className="cifra mt-2 text-[length:var(--text-cifra)] font-semibold leading-none tracking-tight"
              style={{
                color:
                  marcha === 'cumplida'
                    ? ESTADO.exito
                    : marcha === 'rezago'
                      ? ESTADO.alerta
                      : 'var(--color-tinta)',
              }}
            >
              {Math.round(avance * 100)}%
            </p>
            <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {cifra(resumen.promovidos)} promovidos de una meta de {cifra(m.meta)}
              {faltan > 0 ? ` · faltan ${cifra(faltan)}` : ' · ya la rebasó'}
            </p>

            {/* La barra se recorta al 100%: lo que sobrepasa ya lo dice la
                cifra, y estirarla rompería la comparación entre fichas. */}
            <span
              aria-hidden="true"
              className="mt-2.5 block h-2 overflow-hidden rounded-full bg-[var(--color-borde)]"
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(avance, 1) * 100}%`,
                  background:
                    marcha === 'cumplida'
                      ? ESTADO.exito
                      : marcha === 'rezago'
                        ? ESTADO.alerta
                        : 'var(--color-acento)',
                }}
              />
            </span>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-[var(--color-borde)] pt-4">
              <Dato etiqueta="Comprometidos" valor={cifra(resumen.comprometidos)} />
              <Dato etiqueta="Confirmados" valor={cifra(resumen.confirmados)} />
              <Dato etiqueta="Simpatizantes" valor={cifra(resumen.simpatizantes)} />
              <Dato
                etiqueta="Secciones que toca"
                valor={resumen.secciones ? cifra(resumen.secciones) : null}
              />
            </div>
          </section>

          <section className="panel px-4 py-3.5">
            <h2 className="mb-3 text-[var(--text-base)] font-semibold">Quién es</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Dato etiqueta="Nombre" valor={m.nombre} ancho />
              <Dato etiqueta="Tipo" valor={m.tipo} />
              <Dato etiqueta="Responsable" valor={m.responsable} />
            </div>

            <Bloque titulo="Contacto">
              <Dato etiqueta="Teléfono móvil" valor={m.telefono} mono />
              <Dato etiqueta="Correo" valor={m.correo} />
            </Bloque>

            <Bloque titulo="Zona">
              <Dato etiqueta="Municipio" valor={m.municipio} />
              <Dato etiqueta="Sección electoral" valor={m.seccion} mono />
              <Dato etiqueta="Colonia" valor={m.colonia} ancho />
            </Bloque>

            <Bloque titulo="Alta en la red">
              <Dato etiqueta="Desde" valor={fechaLarga(m.alta)} ancho />
              <Dato etiqueta="Notas" valor={m.notas} ancho />
            </Bloque>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[var(--color-borde)] px-4 py-3">
              <h2 className="text-[var(--text-base)] font-semibold">Asignarle a alguien más</h2>
              <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                Solo aparece quien está en el padrón y todavía no lleva nadie
              </p>
            </div>
            <FormaAsignarPromovido movilizadorId={m.id} />
          </section>
        </div>

        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-3">
            <div>
              <h2 className="text-[var(--text-base)] font-semibold">A quién lleva</h2>
              <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                El estado se cambia aquí mismo y queda en la bitácora
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {porEstado.map((e) => (
                <span key={e.estado} className="text-[var(--text-menuda)]">
                  <span className="text-[var(--color-tinta-3)]">{ETIQUETA_ESTADO[e.estado]}</span>{' '}
                  <span className="cifra font-semibold">{cifra(e.n)}</span>
                </span>
              ))}
            </div>
          </div>

          {promovidos.length === 0 ? (
            <Vacio
              titulo="Todavía no ha registrado a nadie"
              descripcion="Este movilizador tiene su meta fijada pero no ha dado de alta a ningún promovido. Asígnale a alguien del padrón desde el panel de la izquierda."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th className="num">Edad</th>
                    <th>Zona</th>
                    <th>Estado</th>
                    <th>Señal</th>
                    <th className="num">Se comprometió</th>
                  </tr>
                </thead>
                <tbody>
                  {promovidos.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">
                        <Link
                          href={`/ciudadanos/${p.ciudadanoId}`}
                          className="font-medium hover:text-[var(--color-acento-fuerte)] hover:underline"
                        >
                          {p.nombre}
                        </Link>
                        <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                          {p.telefono ?? 'Sin teléfono'}
                        </span>
                      </td>
                      <td className="num">{cifra(p.edad)}</td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {p.colonia ?? '—'}
                        {p.seccion && <span className="clave ml-1.5">{p.seccion}</span>}
                      </td>
                      <td>
                        <SelectorEstado promovidoId={p.id} estado={p.estado} />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {p.simpatizante && <Distintivo tono="acento">Simpatizante</Distintivo>}
                          {p.afinidad && (
                            <span
                              className="text-[var(--text-micro)] text-[var(--color-tinta-3)]"
                              title="Afinidad declarada al proyecto"
                            >
                              Afinidad {AFINIDAD[p.afinidad] ?? p.afinidad}
                            </span>
                          )}
                          {!p.simpatizante && !p.afinidad && (
                            <span className="text-[var(--color-tinta-3)]">—</span>
                          )}
                        </span>
                      </td>
                      <td className="num clave whitespace-nowrap">
                        {p.fecha_compromiso ? fechaCorta(p.fecha_compromiso) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-2 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                {porcentaje(resumen.confirmados, resumen.promovidos)} de los que lleva ya confirmó
                su voto. Por debajo del {Math.round(UMBRAL_REZAGO * 100)}% de su meta, la campaña
                lo marca en rezago.
              </p>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  )
}
