import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { nombreDeFuerza, colorDeFuerza } from '@/lib/partidos'
import {
  distrito,
  fuerzasDelDistrito,
  seccionesDelDistrito,
  problematicasDelDistrito,
  ELECCIONES,
  esEleccion,
  type Eleccion,
} from '../consultas'

export const metadata: Metadata = { title: 'Distrito' }

export default async function Distrito({
  params,
  searchParams,
}: {
  params: Promise<{ clave: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/distritos')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { clave } = await params
  const sp = await searchParams
  const pedida = typeof sp.eleccion === 'string' ? sp.eleccion : undefined
  const eleccion: Eleccion = esEleccion(pedida) ? pedida : 'gobernador'

  const d = await distrito(tenant.estado_id, clave)
  if (!d || !tenant.estado_id) notFound()

  const [fuerzas, secciones, problematicas] = await Promise.all([
    fuerzasDelDistrito(tenant.estado_id, clave, eleccion),
    seccionesDelDistrito(tenant.id, tenant.estado_id, clave, eleccion),
    problematicasDelDistrito(tenant.id, tenant.estado_id, clave),
  ])

  const padron = secciones.reduce((a, s) => a + (s.lista_nominal ?? 0), 0)
  const peticiones = secciones.reduce((a, s) => a + s.peticiones, 0)
  const sinResolver = secciones.reduce((a, s) => a + s.sin_resolver, 0)
  const votos = secciones.reduce((a, s) => a + s.total_votos, 0)
  const participacion = padron ? (votos / padron) * 100 : null
  const sinPeticiones = secciones.filter((s) => s.peticiones === 0).length
  const maxProblematica = Math.max(1, ...problematicas.map((p) => p.valor))

  return (
    <Pagina
      titulo={`Distrito ${d.clave}${d.cabecera ? ` · ${d.cabecera}` : ''}`}
      descripcion={`${secciones.length} secciones · ${ELECCIONES.find((e) => e.valor === eleccion)!.etiqueta}`}
      acciones={
        <div className="flex items-center gap-2">
          <nav
            aria-label="Elección"
            className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5"
          >
            {ELECCIONES.map((e) => (
              <Link
                key={e.valor}
                href={`/distritos/${clave}?eleccion=${e.valor}`}
                aria-current={eleccion === e.valor ? 'true' : undefined}
                className={`boton !h-7 !px-2.5 text-[var(--text-menuda)] ${
                  eleccion === e.valor ? 'boton-primario' : 'boton-llano'
                }`}
              >
                {e.etiqueta}
              </Link>
            ))}
          </nav>
          <Link href={`/distritos?eleccion=${eleccion}`} className="boton boton-neutro !h-7">
            Todos los distritos
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador etiqueta="Padrón" valor={padron} pie="Lista nominal del INE" />
        <Indicador
          etiqueta="Participación"
          valor={participacion === null ? '—' : `${participacion.toFixed(1)}%`}
          pie={`${votos.toLocaleString('es-MX')} votos emitidos`}
        />
        <Indicador
          etiqueta="Peticiones"
          valor={peticiones}
          tono={peticiones > 0 ? 'dato' : 'neutro'}
          pie={`${secciones.length - sinPeticiones} de ${secciones.length} secciones con alguna`}
        />
        <Indicador
          etiqueta="Sin resolver"
          valor={sinResolver}
          tono={sinResolver > 0 ? 'aviso' : 'exito'}
          pie={sinResolver > 0 ? 'Abiertas, en proceso o sin interpretar' : 'Nada pendiente'}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="font-medium">Cómo votó el distrito</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Todas las fuerzas, sobre votos válidos
            </p>
          </div>
          {fuerzas.length === 0 ? (
            <p className="px-4 py-6 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              No hay resultados cargados para esta elección.
            </p>
          ) : (
            <ul className="px-4 py-3">
              {fuerzas.map((f) => (
                <li key={f.fuerza} className="flex items-center gap-3 py-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: colorDeFuerza(f.fuerza) }}
                  />
                  <span className="w-44 shrink-0 truncate">{nombreDeFuerza(f.fuerza)}</span>
                  <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[var(--color-borde)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${f.porcentaje ?? 0}%`,
                        background: colorDeFuerza(f.fuerza),
                      }}
                    />
                  </span>
                  <span className="num w-14 shrink-0 text-right font-medium">
                    {f.porcentaje === null ? '—' : `${f.porcentaje.toFixed(1)}%`}
                  </span>
                  <span className="clave w-20 shrink-0 text-right">
                    {f.votos.toLocaleString('es-MX')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="font-medium">Qué le pide la gente</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Problemáticas más capturadas en el distrito
            </p>
          </div>
          {problematicas.length === 0 ? (
            <p className="px-4 py-6 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Todavía no hay peticiones capturadas aquí.
            </p>
          ) : (
            <ul className="px-4 py-3">
              {problematicas.map((p) => (
                <li key={p.etiqueta} className="flex items-center gap-3 py-1.5">
                  <span className="w-44 shrink-0 truncate">{p.etiqueta}</span>
                  <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[var(--color-borde)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max((p.valor / maxProblematica) * 100, 4)}%`,
                        background: 'var(--color-acento)',
                      }}
                    />
                  </span>
                  <span className="num w-14 shrink-0 text-right font-medium">{p.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {secciones.length === 0 ? (
        <Vacio titulo="Este distrito no tiene secciones cargadas" />
      ) : (
        <section className="panel mt-3 overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="font-medium">Sus secciones</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Primero las que tienen más peticiones sin resolver
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Municipio</th>
                  <th className="num">Padrón</th>
                  <th className="num">Participación</th>
                  <th>Ganó</th>
                  <th className="num">Peticiones</th>
                  <th className="num">Sin resolver</th>
                </tr>
              </thead>
              <tbody>
                {secciones.map((s) => (
                  <tr key={s.id}>
                    <td className="clave font-medium">{s.clave}</td>
                    <td className="whitespace-nowrap text-[var(--color-tinta-2)]">{s.municipio}</td>
                    <td className="num">{s.lista_nominal?.toLocaleString('es-MX') ?? '—'}</td>
                    <td className="num">
                      {s.participacion === null ? '—' : `${s.participacion.toFixed(1)}%`}
                    </td>
                    <td className="whitespace-nowrap">
                      {s.ganador ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: colorDeFuerza(s.ganador) }}
                          />
                          {nombreDeFuerza(s.ganador)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-tinta-3)]">—</span>
                      )}
                    </td>
                    <td className="num">{s.peticiones.toLocaleString('es-MX')}</td>
                    <td
                      className="num font-medium"
                      style={s.sin_resolver > 0 ? { color: 'var(--color-aviso)' } : undefined}
                    >
                      {s.sin_resolver.toLocaleString('es-MX')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Pagina>
  )
}
