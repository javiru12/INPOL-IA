import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { regionesConDatos, METRICAS, type Metrica, type Ambito } from './consultas'
import { LienzoMapa } from './lienzo'
import { Pagina, Indicador } from '@/components/pagina'
import { colorDePartido, nombreDePartido } from '@/lib/escalas'
import { cifra } from '@/lib/formato'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Mapa' }

const AMBITOS: { valor: Ambito; etiqueta: string; archivo: string }[] = [
  { valor: 'municipio', etiqueta: 'Municipios', archivo: 'nl-municipios.json' },
  { valor: 'distrito', etiqueta: 'Distritos locales', archivo: 'nl-distritos-locales.json' },
]

export default async function MapaTerritorial({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/mapa')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

  const ambito: Ambito = texto(sp.ambito) === 'distrito' ? 'distrito' : 'municipio'
  const metrica: Metrica =
    (METRICAS.find((m) => m.valor === texto(sp.metrica))?.valor as Metrica) ?? 'peticiones'

  const regiones = await regionesConDatos(tenant.id, ambito)
  const definicion = METRICAS.find((m) => m.valor === metrica)!
  const capa = AMBITOS.find((a) => a.valor === ambito)!

  const totales = regiones.reduce(
    (acc, r) => ({
      peticiones: acc.peticiones + r.peticiones,
      lista: acc.lista + r.lista_nominal,
      votos: acc.votos + r.votos_totales,
      conPeticiones: acc.conPeticiones + (r.peticiones > 0 ? 1 : 0),
    }),
    { peticiones: 0, lista: 0, votos: 0, conPeticiones: 0 },
  )

  const participacionGlobal = totales.lista
    ? ((totales.votos / totales.lista) * 100).toFixed(1)
    : '—'

  const ordenadas = [...regiones].sort((a, b) => {
    if (metrica === 'ganador') return b.votos_ganador - a.votos_ganador
    if (metrica === 'margen') return (a.margen ?? 999) - (b.margen ?? 999)
    if (metrica === 'participacion') return (b.participacion ?? 0) - (a.participacion ?? 0)
    if (metrica === 'lista_nominal') return b.lista_nominal - a.lista_nominal
    return b.peticiones - a.peticiones
  })

  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ ambito, metrica, ...cambios })
    return `/mapa?${p.toString()}`
  }

  return (
    <Pagina
      titulo="Mapa territorial"
      descripcion={definicion.ayuda}
      acciones={
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5">
          {AMBITOS.map((a) => (
            <Link
              key={a.valor}
              href={enlace({ ambito: a.valor })}
              className={`boton !h-7 !px-2.5 text-[var(--text-menuda)] ${
                ambito === a.valor ? 'boton-primario' : 'boton-llano'
              }`}
            >
              {a.etiqueta}
            </Link>
          ))}
        </div>
      }
    >
      <nav aria-label="Métrica" className="mb-3 flex flex-wrap gap-1.5">
        {METRICAS.map((m) => (
          <Link
            key={m.valor}
            href={enlace({ metrica: m.valor })}
            aria-current={metrica === m.valor ? 'true' : undefined}
            className={`boton !h-8 text-[var(--text-menuda)] ${
              metrica === m.valor ? 'boton-primario' : 'boton-neutro'
            }`}
          >
            {m.etiqueta}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta={ambito === 'municipio' ? 'Municipios' : 'Distritos locales'}
          valor={regiones.length}
          pie={`${totales.conPeticiones} con peticiones capturadas`}
        />
        <Indicador etiqueta="Peticiones" valor={totales.peticiones} tono="dato" pie="En todo el territorio" />
        <Indicador etiqueta="Lista nominal" valor={totales.lista} pie="Electores según el INE" />
        <Indicador
          etiqueta="Participación 2015"
          valor={`${participacionGlobal}%`}
          pie="Elección de gobernador"
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.6fr_1fr] xl:items-start">
        <LienzoMapa
          archivo={capa.archivo}
          regiones={regiones}
          metrica={metrica}
          unidad={definicion.unidad}
        />

        <section className="panel overflow-hidden">
          <h2 className="border-b border-[var(--color-borde)] px-4 py-3 text-[var(--text-base)] font-semibold">
            {metrica === 'margen' ? 'Las más competidas' : 'Ranking'}
          </h2>
          <div className="max-h-[27rem] overflow-y-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{ambito === 'municipio' ? 'Municipio' : 'Distrito'}</th>
                  {metrica === 'ganador' ? (
                    <th>Ganó 2015</th>
                  ) : (
                    <th className="num">{definicion.etiqueta}</th>
                  )}
                  {metrica !== 'peticiones' && <th className="num">Peticiones</th>}
                </tr>
              </thead>
              <tbody>
                {ordenadas.slice(0, 30).map((r) => (
                  <tr key={r.clave}>
                    <td className="font-medium">{r.nombre}</td>
                    {metrica === 'ganador' ? (
                      <td>
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ background: colorDePartido(r.ganador) }}
                          />
                          {r.ganador ? nombreDePartido(r.ganador) : '—'}
                        </span>
                      </td>
                    ) : (
                      <td className="num">
                        {metrica === 'participacion'
                          ? r.participacion !== null ? `${r.participacion}%` : '—'
                          : metrica === 'margen'
                            ? r.margen !== null ? `${r.margen} pts` : '—'
                            : metrica === 'lista_nominal'
                              ? cifra(r.lista_nominal)
                              : cifra(r.peticiones)}
                      </td>
                    )}
                    {metrica !== 'peticiones' && (
                      <td className="num">{r.peticiones > 0 ? cifra(r.peticiones) : '—'}</td>
                    )}
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
