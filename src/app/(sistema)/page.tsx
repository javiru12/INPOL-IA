import { redirect } from 'next/navigation'
import Link from 'next/link'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { resumenDelPanel, focoElectoral } from './consultas'
import { agruparCola, ESTADO } from '@/lib/paleta'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { BarrasHorizontales, BarrasTemporales } from '@/components/graficas'
import { MapaDelPanel } from './mapa-panel'
import { Anillo } from '@/components/anillo'
import { mesCorto, fechaCorta, cifra } from '@/lib/formato'
import { Tabla } from '@/components/tabla'
import { archivoDeMapa } from '@/lib/mapas'

const TONO_ESTATUS: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

export default async function Panel() {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) redirect('/entrar')

  const [r, foco] = await Promise.all([
    resumenDelPanel(tenant.id, tenant.estado_clave),
    focoElectoral(tenant.id, tenant.estado_id),
  ])
  const problematicas = agruparCola(r.porProblematica)
  const hayDatos = r.totales.total > 0

  const avance = r.totales.total
    ? Math.round((r.totales.completadas / r.totales.total) * 100)
    : 0

  return (
    <Pagina
      vidrio
      titulo={`Buen día, ${sesion.nombre.split(' ')[0]}`}
      descripcion={`Panorama de ${tenant.nombre_corto ?? tenant.nombre} al día de hoy`}
      acciones={
        <Link href="/peticiones/nueva" className="boton boton-primario">
          Nueva petición
        </Link>
      }
    >
      {!hayDatos ? (
        <Vacio
          titulo="Todavía no hay peticiones capturadas"
          descripcion="En cuanto el equipo de campo levante las primeras solicitudes, aquí aparecerá el panorama completo."
          accion={
            <Link href="/peticiones/nueva" className="boton boton-primario">
              Capturar la primera
            </Link>
          }
        />
      ) : (
        <>
          <div className="franja">
            {/* Cada cifra lleva a la lista que la produjo. Un número
                que no se puede abrir obliga a reconstruir a mano el
                filtro que lo generó, y casi siempre sale distinto. */}
            {/* La única de las cuatro que admite comparación honesta:
                las demás son acumuladas o una foto de hoy, y no hay
                registro de cuántas estaban abiertas hace un mes. */}
            <Indicador
              etiqueta="Entraron en 30 días"
              valor={r.entradas.recientes}
              variacion={{
                porcentaje: r.entradas.previas
                  ? ((r.entradas.recientes - r.entradas.previas) / r.entradas.previas) * 100
                  : 0,
                contra: 'los 30 días anteriores',
              }}
              pie={`${cifra(r.totales.total)} desde el inicio de la campaña`}
              href="/peticiones"
            />
            <Indicador
              etiqueta="En atención"
              valor={r.totales.abiertas}
              tono="dato"
              pie="Abiertas, en proceso o en gestión"
              href="/peticiones?pendientes=si"
            />
            <Indicador
              etiqueta="Completadas"
              valor={r.totales.completadas}
              tono="exito"
              pie={`${avance}% del total`}
              href="/peticiones?estatus=Completada"
            />
            <Indicador
              etiqueta="Urgentes sin resolver"
              valor={r.totales.urgentes}
              tono={r.totales.urgentes > 0 ? 'alerta' : 'neutro'}
              pie="Requieren atención inmediata"
              href="/peticiones?prioridad=Urgente&pendientes=si"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <section className="panel px-4 py-3.5">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-[var(--text-base)] font-semibold">Peticiones por mes</h2>
                <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                  Últimos 12 meses · doble clic para ver el mes
                </span>
              </div>
              <BarrasTemporales
                datos={r.porMes.map((m) => ({
                  valor: m.valor,
                  etiqueta: mesCorto(m.etiqueta),
                  // El 'AAAA-MM' crudo es lo que entiende el filtro; la
                  // barra solo enseña el mes abreviado.
                  href: `/peticiones?mes=${m.etiqueta}`,
                }))}
              />
            </section>

            <section className="panel px-4 py-3.5">
              <h2 className="mb-4 text-[var(--text-base)] font-semibold">Estatus</h2>
              <ul className="space-y-1.5">
                {r.porEstatus.map((e) => (
                  <li key={e.etiqueta} className="flex items-center justify-between gap-3">
                    <Distintivo tono={TONO_ESTATUS[e.etiqueta] ?? 'neutro'}>
                      {e.etiqueta}
                    </Distintivo>
                    <span className="cifra text-[var(--text-base)] font-medium tabular-nums">
                      {e.valor.toLocaleString('es-MX')}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Una barra dice «cuánto llevas»; el anillo dice «cuánto
                  falta para cerrar», que es la pregunta de verdad cuando
                  hay una meta. */}
              <div className="mt-5 flex items-center gap-5 border-t border-[var(--color-borde)] pt-5">
                <Anillo porcentaje={avance} color={ESTADO.exito}>
                  <span>
                    <span
                      className="cifra block text-[length:var(--text-cifra)] leading-none"
                      style={{ color: ESTADO.exito }}
                    >
                      {avance}%
                    </span>
                  </span>
                </Anillo>
                <div className="min-w-0">
                  <p className="font-medium">Avance de atención</p>
                  <p className="mt-1 text-[var(--text-menuda)] leading-snug text-[var(--color-tinta-2)]">
                    {cifra(r.totales.completadas)} de {cifra(r.totales.total)} peticiones ya
                    tienen desenlace.
                  </p>
                  <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                    Faltan {cifra(r.totales.total - r.totales.completadas)} por cerrar.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="panel px-4 py-3.5">
              <h2 className="mb-4 text-[var(--text-base)] font-semibold">
                Problemáticas principales
              </h2>
              <BarrasHorizontales datos={problematicas} />
            </section>

            <section className="panel px-4 py-3.5">
              <h2 className="mb-4 text-[var(--text-base)] font-semibold">
                Colonias con más peticiones
              </h2>
              {r.porColonia.length ? (
                <BarrasHorizontales datos={r.porColonia} colorUnico="var(--color-acento)" />
              ) : (
                <p className="py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Sin colonias registradas todavía.
                </p>
              )}
            </section>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.35fr]">
            <section className="panel px-4 py-3.5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[var(--text-base)] font-semibold">Territorio</h2>
                <Link
                  href="/mapa"
                  className="boton boton-llano !h-7 text-[var(--text-menuda)]"
                >
                  Abrir el mapa
                </Link>
              </div>
              <MapaDelPanel
                municipios={r.porMunicipio}
                archivo={archivoDeMapa(tenant.estado_clave)}
              />
            </section>

            {foco && foco.sin_resolver_total > 0 && (
              <section className="panel px-4 py-3.5">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[var(--text-base)] font-semibold">Dónde se decide</h2>
                  <Link
                    href="/prioridad"
                    className="boton boton-llano !h-7 text-[var(--text-menuda)]"
                  >
                    Dónde actuar
                  </Link>
                </div>

                <p className="flex items-baseline gap-2">
                  <span
                    className="cifra text-[length:var(--text-cifra)] font-semibold leading-none tracking-tight"
                    style={{
                      color:
                        foco.sin_resolver_disputado > 0
                          ? 'var(--color-aviso)'
                          : 'var(--color-tinta)',
                    }}
                  >
                    {foco.sin_resolver_disputado.toLocaleString('es-MX')}
                  </span>
                  <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                    de {foco.sin_resolver_total.toLocaleString('es-MX')} peticiones sin resolver
                    están en territorio disputado
                  </span>
                </p>
                <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Secciones donde la elección de 2015 se ganó por menos de 10 puntos
                  {foco.secciones_disputadas > 0 &&
                    ` · ${foco.secciones_disputadas} secciones`}
                </p>

                {foco.distritos.length > 0 && (
                  <ul className="mt-3 border-t border-[var(--color-borde)]">
                    {foco.distritos.map((d) => (
                      <li
                        key={d.clave}
                        className="flex items-center gap-3 border-b border-[var(--color-borde)] py-2 last:border-0"
                      >
                        <Link
                          href={`/distritos/${d.clave}`}
                          className="min-w-0 flex-1 truncate hover:text-[var(--color-acento-fuerte)]"
                        >
                          <span className="clave">{d.clave}</span>
                          {d.cabecera && <span className="ml-1.5">{d.cabecera}</span>}
                        </Link>
                        <span className="clave shrink-0">{d.margen} pts de margen</span>
                        <span className="num w-8 shrink-0 text-right font-medium">
                          {d.sin_resolver}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-borde)] px-4 py-3">
              <h2 className="text-[var(--text-base)] font-semibold">Registros recientes</h2>
              <Link href="/peticiones" className="boton boton-llano !h-7 text-[var(--text-menuda)]">
                Ver todas
              </Link>
            </div>
            <Tabla>
              <thead>
                <tr>
                  <th>Ciudadano</th>
                  <th>Problemática</th>
                  <th>Colonia</th>
                  <th>Prioridad</th>
                  <th>Estatus</th>
                  <th className="num">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {r.recientes.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.ciudadano ?? '—'}</td>
                    <td className="text-[var(--color-tinta-2)]">{p.problematica ?? '—'}</td>
                    <td className="text-[var(--color-tinta-2)]">{p.colonia ?? '—'}</td>
                    <td>
                      {p.prioridad === 'Urgente' ? (
                        <Distintivo tono="alerta">Urgente</Distintivo>
                      ) : (
                        <span className="text-[var(--color-tinta-2)]">{p.prioridad ?? '—'}</span>
                      )}
                    </td>
                    <td>
                      <Distintivo tono={TONO_ESTATUS[p.estatus ?? ''] ?? 'neutro'}>
                        {p.estatus ?? 'Sin estatus'}
                      </Distintivo>
                    </td>
                    <td className="num clave">{fechaCorta(p.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </section>
        </>
      )}
    </Pagina>
  )
}
