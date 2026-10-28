import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { BarrasTemporales } from '@/components/graficas'
import { fechaLarga } from '@/lib/formato'
import { jornadaActiva, tableroDeJornada, ETIQUETA_TIPO } from './consultas'
import { Tabla } from '@/components/tabla'

export const metadata: Metadata = { title: 'Día D' }

const TONO_GRAVEDAD: Record<string, 'alerta' | 'aviso' | 'neutro'> = {
  urgente: 'alerta',
  atencion: 'aviso',
  normal: 'neutro',
}

export default async function DiaD() {
  await exigirAcceso('/dia-d')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const jornada = await jornadaActiva(tenant.id)

  if (!jornada) {
    return (
      <Pagina titulo="Día D" descripcion="El tablero de la jornada electoral">
        <Vacio
          titulo="No hay ninguna jornada activa"
          descripcion="El Día D sigue a la gente que esta campaña comprometió: cuánta ya acudió a votar, a qué hora y dónde falta. Se enciende dando de alta la jornada con su fecha."
        />
      </Pagina>
    )
  }

  const t = await tableroDeJornada(tenant.id, jornada.id)
  const { comprometidos, acudieron } = t.totales
  const faltan = comprometidos - acudieron
  const avance = comprometidos ? Math.round((acudieron / comprometidos) * 100) : 0
  const abiertas = t.incidencias.filter((i) => !i.resuelta)
  const urgentes = abiertas.filter((i) => i.gravedad === 'urgente').length

  // ¿Esta jornada es hoy, ya pasó o falta? La pantalla hablaba siempre
  // en presente —«a quién llamar ahora», «todavía se les puede
  // llamar»— aunque la fecha llevara semanas atrás, y no había forma de
  // saber si lo que se veía era la jornada en curso o el archivo de una
  // que terminó.
  const hoy = new Date()
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const cuando: 'hoy' | 'pasada' | 'futura' =
    jornada.fecha === hoyIso ? 'hoy' : jornada.fecha < hoyIso ? 'pasada' : 'futura'
  const diasDeDiferencia = Math.round(
    Math.abs(new Date(`${jornada.fecha}T12:00:00`).getTime() - new Date(`${hoyIso}T12:00:00`).getTime()) /
      86400000,
  )

  // El acumulado es la lectura real de una jornada: lo que importa no es
  // cuánta gente llegó a las once, sino cuánta lleva uno a las once.
  let suma = 0
  const porHora = t.porHora.map((h) => {
    suma += h.valor
    return { etiqueta: `${String(h.hora).padStart(2, '0')}h`, valor: h.valor, acumulado: suma }
  })

  return (
    <Pagina
      vidrio
      titulo="Día D"
      insignias={
        cuando === 'hoy' ? (
          <Distintivo tono="exito">En curso</Distintivo>
        ) : cuando === 'pasada' ? (
          <Distintivo tono="neutro">
            Terminó hace {diasDeDiferencia} {diasDeDiferencia === 1 ? 'día' : 'días'}
          </Distintivo>
        ) : (
          <Distintivo tono="dato">
            Faltan {diasDeDiferencia} {diasDeDiferencia === 1 ? 'día' : 'días'}
          </Distintivo>
        )
      }
      descripcion={`${jornada.nombre} · ${fechaLarga(jornada.fecha)} · de ${jornada.hora_apertura.slice(0, 5)} a ${jornada.hora_cierre.slice(0, 5)}`}
      acciones={
        urgentes > 0 ? (
          <Distintivo tono="alerta">
            {urgentes} incidencia{urgentes === 1 ? '' : 's'} urgente{urgentes === 1 ? '' : 's'}
          </Distintivo>
        ) : undefined
      }
    >
      <div className="franja">
        <Indicador
          etiqueta="Gente comprometida"
          valor={comprometidos}
          pie={`${t.totales.movilizadores} movilizadores en ${t.totales.secciones} secciones`}
        />
        <Indicador
          etiqueta="Ya fueron a votar"
          valor={acudieron}
          tono="exito"
          pie={`${avance}% de lo comprometido`}
        />
        <Indicador
          etiqueta="Faltan por salir"
          valor={faltan}
          tono={faltan > 0 ? 'aviso' : 'exito'}
          pie={
            faltan === 0
              ? 'Salieron todos'
              : cuando === 'hoy'
                ? 'Todavía se les puede llamar'
                : 'No salieron ese día'
          }
        />
        <Indicador
          etiqueta="Incidencias abiertas"
          valor={abiertas.length}
          tono={urgentes > 0 ? 'alerta' : abiertas.length > 0 ? 'aviso' : 'exito'}
          pie={urgentes > 0 ? `${urgentes} urgente(s)` : 'Nada grave reportado'}
        />
      </div>

      <section className="panel mt-3 px-4 py-3.5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[var(--text-base)] font-semibold">Cómo va la hora</h2>
          <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {acudieron.toLocaleString('es-MX')} acumulados · {avance}% de la meta
          </span>
        </div>
        {porHora.length === 0 ? (
          <p className="py-6 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Todavía no se registra a nadie. El conteo arranca cuando el primer
            representante marca una asistencia.
          </p>
        ) : (
          <BarrasTemporales datos={porHora.map((h) => ({ etiqueta: h.etiqueta, valor: h.valor }))} />
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">
              {cuando === 'hoy' ? 'A quién llamar ahora' : 'Quiénes se quedaron sin salir'}
            </h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {cuando === 'hoy'
                ? 'Movilizadores con más gente comprometida que todavía no sale'
                : 'Movilizadores con más gente comprometida que no acudió'}
            </p>
          </div>
          {t.rezagados.length === 0 ? (
            <p className="px-4 py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Toda la gente comprometida ya acudió.
            </p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Movilizador</th>
                  <th>Zona</th>
                  <th className="num">Falta</th>
                  <th className="num">Avance</th>
                  <th>Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {t.rezagados.map((m) => {
                  const faltanSuyos = m.comprometidos - m.acudieron
                  const pct = Math.round((m.avance ?? 0) * 100)
                  return (
                    <tr key={m.id}>
                      <td className="font-medium">{m.nombre}</td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {m.municipio ?? '—'}
                        {m.seccion && <span className="clave ml-1.5">{m.seccion}</span>}
                      </td>
                      <td className="num font-semibold" style={{ color: 'var(--color-aviso)' }}>
                        {faltanSuyos}
                      </td>
                      <td className="num">
                        <span className="inline-flex items-center gap-2">
                          {pct}%
                          <span
                            className="h-[6px] w-12 overflow-hidden rounded-full bg-[var(--color-borde)]"
                            aria-hidden="true"
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(pct, 3)}%`,
                                background:
                                  pct >= 70
                                    ? 'var(--color-exito)'
                                    : pct >= 40
                                      ? 'var(--color-aviso)'
                                      : 'var(--color-alerta)',
                              }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="clave whitespace-nowrap">
                        {m.telefono ? (
                          <a href={`tel:${m.telefono}`} className="hover:text-[var(--color-acento-fuerte)]">
                            {m.telefono}
                          </a>
                        ) : (
                          <span className="text-[var(--color-tinta-3)]">sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabla>
          )}
        </section>

        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">Avance por distrito</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Primero los que van más atrasados
            </p>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {t.porDistrito.map((d) => {
              const pct = Math.round((d.avance ?? 0) * 100)
              return (
                <li
                  key={d.clave}
                  className="flex items-center gap-3 border-b border-[var(--color-borde)] px-4 py-2 last:border-0"
                >
                  <Link
                    href={`/distritos/${d.clave}`}
                    className="min-w-0 flex-1 truncate hover:text-[var(--color-acento-fuerte)]"
                  >
                    <span className="clave">{d.clave}</span>
                    {d.cabecera && <span className="ml-1.5">{d.cabecera}</span>}
                  </Link>
                  <span className="clave shrink-0">
                    {d.acudieron}/{d.comprometidos}
                  </span>
                  <span className="h-[6px] w-16 shrink-0 overflow-hidden rounded-full bg-[var(--color-borde)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        background:
                          pct >= 70
                            ? 'var(--color-exito)'
                            : pct >= 40
                              ? 'var(--color-aviso)'
                              : 'var(--color-alerta)',
                      }}
                    />
                  </span>
                  <span className="num w-9 shrink-0 text-right font-medium">{pct}%</span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <section className="panel mt-3 overflow-hidden">
        <div className="border-b border-[var(--color-borde)] px-4 py-3">
          <h2 className="text-[var(--text-base)] font-semibold">Incidencias en casilla</h2>
          <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Lo reportado desde el territorio, sin resolver primero
          </p>
        </div>
        {t.incidencias.length === 0 ? (
          <p className="px-4 py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Sin incidencias reportadas.
          </p>
        ) : (
          <ul>
            {t.incidencias.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-3 border-b border-[var(--color-borde)] px-4 py-2.5 last:border-0"
                style={i.resuelta ? { opacity: 0.55 } : undefined}
              >
                <span className="clave w-10 shrink-0 pt-0.5">{i.creada_en}</span>
                <span className="shrink-0">
                  <Distintivo tono={TONO_GRAVEDAD[i.gravedad] ?? 'neutro'}>
                    {ETIQUETA_TIPO[i.tipo] ?? i.tipo}
                  </Distintivo>
                </span>
                <span className="min-w-0 flex-1">{i.descripcion}</span>
                <span className="clave shrink-0 whitespace-nowrap text-[var(--color-tinta-3)]">
                  {i.seccion ? `Sección ${i.seccion}` : ''}
                  {i.casilla ? ` · ${i.casilla}` : ''}
                </span>
                {i.resuelta && (
                  <span className="shrink-0 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                    resuelta
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Pagina>
  )
}
