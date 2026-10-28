import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { CATEGORICA } from '@/lib/paleta'
import { cifra } from '@/lib/formato'
import { LienzoPrioridad } from './lienzo'
import {
  seccionesPriorizadas,
  agruparPorDistrito,
  ELECCIONES,
  esEleccion,
  type Eleccion,
} from './consultas'
import {
  FACTORES,
  razonesDe,
  factoresQueNoDiscriminan,
  type Factor,
  type SeccionPriorizada,
} from './indice'
import { Tabla } from '@/components/tabla'

export const metadata: Metadata = { title: 'Dónde actuar' }

const CLAVES = Object.keys(FACTORES) as Factor[]
const COLOR: Record<Factor, string> = {
  competitividad: CATEGORICA[0],
  peso_electoral: CATEGORICA[1],
  voto_dormido: CATEGORICA[2],
  demanda: CATEGORICA[3],
  vacio: CATEGORICA[4],
}

const CUANTAS = 25

/**
 * De qué está hecho el índice de una sección. Cada tramo es el aporte real
 * —factor por su peso—, así que el ancho total es el índice mismo y los
 * tramos se pueden comparar entre renglones.
 */
function Composicion({ s }: { s: SeccionPriorizada }) {
  return (
    <span className="flex h-[10px] w-full gap-[2px] overflow-hidden" aria-hidden="true">
      {CLAVES.map((k) => {
        const aporte = (s.factores[k] * FACTORES[k].peso) / 100
        if (aporte <= 0) return null
        return (
          <span
            key={k}
            className="block first:rounded-l-[2px] last:rounded-r-[2px]"
            style={{ width: `${aporte}%`, background: COLOR[k] }}
            title={`${FACTORES[k].etiqueta}: ${aporte.toFixed(1)} de ${FACTORES[k].peso}`}
          />
        )
      })}
    </span>
  )
}

export default async function Prioridad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/prioridad')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const pedida = typeof sp.eleccion === 'string' ? sp.eleccion : undefined
  const eleccion: Eleccion = esEleccion(pedida) ? pedida : 'gobernador'

  const secciones = await seccionesPriorizadas(tenant.id, tenant.estado_id, eleccion)
  const distritos = agruparPorDistrito(secciones)

  const mudos = factoresQueNoDiscriminan(secciones)
  const ordenadas = [...secciones].sort((a, b) => b.indice - a.indice)
  const top = ordenadas.slice(0, CUANTAS)

  const padronTop = top.reduce((a, s) => a + (s.lista_nominal ?? 0), 0)
  const pendientesTop = top.reduce((a, s) => a + s.sin_resolver, 0)
  const sinEstructura = secciones.filter((s) => s.movilizadores === 0).length
  const cerradas = secciones.filter((s) => s.margen !== null && s.margen < 10).length

  return (
    <Pagina
      titulo="Dónde actuar"
      descripcion="Las secciones que más rinden si se trabajan esta semana, y por qué"
      acciones={
        <nav
          aria-label="Elección de referencia"
          className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5"
        >
          {ELECCIONES.map((e) => (
            <Link
              key={e.valor}
              href={`/prioridad?eleccion=${e.valor}`}
              aria-current={eleccion === e.valor ? 'true' : undefined}
              className={`boton !h-7 !px-2.5 text-[var(--text-menuda)] ${
                eleccion === e.valor ? 'boton-primario' : 'boton-llano'
              }`}
            >
              {e.etiqueta}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="franja">
        <Indicador
          etiqueta={`Padrón de las ${CUANTAS} primeras`}
          valor={padronTop}
          tono="dato"
          pie={`${((padronTop / Math.max(1, secciones.reduce((a, s) => a + (s.lista_nominal ?? 0), 0))) * 100).toFixed(1)}% del estado en ${CUANTAS} de ${cifra(secciones.length)} secciones`}
        />
        <Indicador
          etiqueta="Se ganaron por menos de 10 puntos"
          valor={cerradas}
          tono={cerradas > 0 ? 'aviso' : 'neutro'}
          pie="Secciones donde la elección estuvo en disputa"
        />
        <Indicador
          etiqueta="Sin un solo movilizador"
          valor={sinEstructura}
          tono={sinEstructura > 0 ? 'alerta' : 'exito'}
          pie={`${((sinEstructura / Math.max(1, secciones.length)) * 100).toFixed(0)}% del territorio sin nadie`}
        />
        <Indicador
          etiqueta="Pendientes en las primeras"
          valor={pendientesTop}
          tono={pendientesTop > 0 ? 'aviso' : 'exito'}
          pie="Peticiones abiertas donde más conviene resolver"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="font-medium">El estado, por prioridad</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Cada distrito pintado por el índice de sus secciones, ponderado por padrón
            </p>
          </div>
          <LienzoPrioridad distritos={distritos} />
        </section>

        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="font-medium">Distritos</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              De mayor a menor prioridad
            </p>
          </div>
          <ul className="max-h-[400px] overflow-y-auto">
            {distritos.map((d, i) => (
              <li
                key={d.clave}
                className="flex items-center gap-3 border-b border-[var(--color-borde)] px-4 py-2 last:border-0"
              >
                <span className="clave w-5 shrink-0 text-right text-[var(--color-tinta-3)]">
                  {i + 1}
                </span>
                <Link
                  href={`/distritos/${d.clave}?eleccion=${eleccion}`}
                  className="min-w-0 flex-1 truncate hover:text-[var(--color-acento-fuerte)]"
                >
                  <span className="clave">{d.clave}</span>
                  {d.cabecera && <span className="ml-1.5">{d.cabecera}</span>}
                </Link>
                {d.sin_estructura > 0 && (
                  <span
                    className="text-[var(--text-micro)]"
                    style={{ color: 'var(--color-alerta)' }}
                    title={`${d.sin_estructura} secciones sin movilizador`}
                  >
                    {d.sin_estructura} sin nadie
                  </span>
                )}
                <span className="num w-10 shrink-0 text-right font-semibold">{d.indice}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel mt-3 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-3">
          <div>
            <h2 className="font-medium">Las {CUANTAS} secciones que más rinden</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              La barra muestra de qué está hecho el índice de cada una
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {CLAVES.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: COLOR[k] }}
                />
                <span className="text-[var(--text-micro)] text-[var(--color-tinta-2)]">
                  {FACTORES[k].etiqueta}
                </span>
                <span className="clave text-[var(--text-micro)]">{FACTORES[k].peso}</span>
              </li>
            ))}
          </ul>
        </div>

        {top.length === 0 ? (
          <Vacio titulo="No hay secciones para priorizar" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className="w-10 num">#</th>
                <th>Sección</th>
                <th>Municipio</th>
                <th className="num">Distrito</th>
                <th className="w-56">Composición del índice</th>
                <th className="num">Índice</th>
                <th>Por qué</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s, i) => (
                <tr key={s.id}>
                  <td className="num text-[var(--color-tinta-3)]">{i + 1}</td>
                  <td className="clave font-medium">{s.clave}</td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {s.municipio}
                  </td>
                  <td className="num clave">{s.distrito ?? '—'}</td>
                  <td>
                    <Composicion s={s} />
                  </td>
                  <td className="num text-[length:var(--text-media)] font-semibold">
                    {s.indice.toFixed(1)}
                  </td>
                  <td className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                    {razonesDe(s).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}

        <div className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-3">
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            <span className="font-medium">Cómo se calcula.</span> Cinco factores de 0 a 100,
            cada uno con su peso, sobre las {cifra(secciones.length)} secciones del estado.
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {CLAVES.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: COLOR[k] }}
                />
                <span className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  <span className="font-medium text-[var(--color-tinta-2)]">
                    {FACTORES[k].etiqueta} ({FACTORES[k].peso})
                  </span>{' '}
                  {FACTORES[k].ayuda}
                </span>
              </li>
            ))}
          </ul>
          {mudos.length > 0 && (
            <p
              className="mt-3 border-l-2 pl-3 text-[var(--text-menuda)]"
              style={{ borderColor: 'var(--color-aviso)', color: 'var(--color-tinta-2)' }}
            >
              <span className="font-medium">Ojo con la lectura.</span>{' '}
              {mudos.map((m, i) => (
                <span key={m.factor}>
                  {i > 0 && ' '}
                  «{FACTORES[m.factor].etiqueta}» vale lo mismo en {cifra(m.iguales)} de{' '}
                  {cifra(m.total)} secciones, así que hoy no las separa.
                </span>
              ))}{' '}
              El orden lo están decidiendo los demás factores.
            </p>
          )}
          <p className="mt-2 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Los pesos son un punto de partida, no una verdad: se discuten con el cliente y se
            cambian en un solo archivo.
          </p>
        </div>
      </section>
    </Pagina>
  )
}
