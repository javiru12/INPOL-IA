import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { nombreDeFuerza, colorDeFuerza } from '@/lib/partidos'
import { listarDistritos, ELECCIONES, esEleccion, type Eleccion, type FilaDistrito } from './consultas'

export const metadata: Metadata = { title: 'Distritos' }

const ORDENES = {
  clave: 'Distrito',
  margen: 'Competitividad',
  participacion: 'Participación',
  padron: 'Padrón',
  sin_resolver: 'Sin resolver',
} as const

type Orden = keyof typeof ORDENES

/**
 * Un distrito se gana o se pierde por poco. El margen es lo primero que
 * mira quien reparte recursos, así que la escala de color va al revés de
 * lo habitual: rojo es «apretado», que aquí significa «aquí se decide».
 */
function tonoDelMargen(margen: number | null) {
  if (margen === null) return 'neutro' as const
  if (margen < 5) return 'alerta' as const
  if (margen < 15) return 'aviso' as const
  return 'neutro' as const
}

export default async function Distritos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/distritos')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const eleccion: Eleccion = esEleccion(texto(sp.eleccion)) ? (texto(sp.eleccion) as Eleccion) : 'gobernador'
  const pedido = texto(sp.orden)
  const orden: Orden = pedido && pedido in ORDENES ? (pedido as Orden) : 'clave'

  const distritos = await listarDistritos(tenant.id, tenant.estado_id, eleccion)

  const ordenados = [...distritos].sort((a, b) => {
    if (orden === 'margen') return (a.margen ?? 999) - (b.margen ?? 999)
    if (orden === 'participacion') return (b.participacion ?? 0) - (a.participacion ?? 0)
    if (orden === 'padron') return b.lista_nominal - a.lista_nominal
    if (orden === 'sin_resolver') return b.sin_resolver - a.sin_resolver
    return a.clave.localeCompare(b.clave)
  })

  const padron = distritos.reduce((a, d) => a + d.lista_nominal, 0)
  const votos = distritos.reduce((a, d) => a + d.total_votos, 0)
  const participacion = padron ? (votos / padron) * 100 : 0
  const competidos = distritos.filter((d) => d.margen !== null && d.margen < 15).length
  const sinEstructura = distritos.filter((d) => d.movilizadores === 0).length

  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ eleccion, orden, ...cambios })
    return `/distritos?${p.toString()}`
  }

  const maximo = Math.max(1, ...distritos.map((d) => d.peticiones))

  return (
    <Pagina
      titulo="Distritos"
      descripcion="Cómo votó cada distrito, qué le pide la gente y quién lo está trabajando"
      acciones={
        <nav aria-label="Elección" className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5">
          {ELECCIONES.map((e) => (
            <Link
              key={e.valor}
              href={enlace({ eleccion: e.valor })}
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta="Distritos locales"
          valor={distritos.length}
          pie={`${distritos.reduce((a, d) => a + d.secciones, 0).toLocaleString('es-MX')} secciones en total`}
        />
        <Indicador
          etiqueta="Padrón del estado"
          valor={padron}
          pie="Lista nominal según el INE"
        />
        <Indicador
          etiqueta="Se deciden por menos de 15 puntos"
          valor={competidos}
          tono={competidos > 0 ? 'aviso' : 'neutro'}
          pie={`De ${distritos.length} distritos · participación ${participacion.toFixed(1)}%`}
        />
        <Indicador
          etiqueta="Sin un solo movilizador"
          valor={sinEstructura}
          tono={sinEstructura > 0 ? 'alerta' : 'exito'}
          pie={
            sinEstructura > 0
              ? 'Territorio sin nadie que lo trabaje'
              : 'Todos los distritos tienen estructura'
          }
        />
      </div>

      <nav aria-label="Ordenar" className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rotulo mr-1">Ordenar por</span>
        {(Object.keys(ORDENES) as Orden[]).map((o) => (
          <Link
            key={o}
            href={enlace({ orden: o })}
            aria-current={orden === o ? 'true' : undefined}
            className={`boton !h-8 text-[var(--text-menuda)] ${
              orden === o ? 'boton-primario' : 'boton-neutro'
            }`}
          >
            {ORDENES[o]}
          </Link>
        ))}
      </nav>

      {ordenados.length === 0 ? (
        <Vacio
          titulo={
            tenant.estado_id
              ? `Todavía no hay geografía electoral de ${tenant.estado_nombre ?? 'este estado'}`
              : 'Este cliente no tiene estado asignado'
          }
          descripcion={
            tenant.estado_id
              ? 'El catálogo del INE —distritos, secciones y resultados— se carga por estado. El de este cliente está pendiente.'
              : 'Hay que decir en qué estado opera antes de poder mostrarle su territorio.'
          }
        />
      ) : (
        <section className="panel mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Distrito</th>
                  <th className="num">Secciones</th>
                  <th className="num">Padrón</th>
                  <th className="num">Participación</th>
                  <th>Ganó</th>
                  <th className="num">Margen</th>
                  <th className="num">Peticiones</th>
                  <th className="num">Sin resolver</th>
                  <th className="num">Estructura</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((d) => (
                  <FilaDeDistrito key={d.clave} d={d} eleccion={eleccion} maximo={maximo} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-2 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Los porcentajes se calculan sobre votos válidos y las coaliciones se suman al
            partido que las encabeza.
          </p>
        </section>
      )}
    </Pagina>
  )
}

function FilaDeDistrito({
  d,
  eleccion,
  maximo,
}: {
  d: FilaDistrito
  eleccion: Eleccion
  maximo: number
}) {
  const tono = tonoDelMargen(d.margen)
  const colorMargen =
    tono === 'alerta'
      ? 'var(--color-alerta)'
      : tono === 'aviso'
        ? 'var(--color-aviso)'
        : 'var(--color-tinta)'

  return (
    <tr>
      <td>
        <Link
          href={`/distritos/${d.clave}?eleccion=${eleccion}`}
          className="font-medium hover:text-[var(--color-acento-fuerte)]"
        >
          <span className="clave">{d.clave}</span>
          {d.cabecera && (
            <span className="ml-2 text-[var(--color-tinta-2)]">{d.cabecera}</span>
          )}
        </Link>
        {d.municipios > 1 && (
          <span className="ml-2 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            {d.municipios} municipios
          </span>
        )}
      </td>
      <td className="num text-[var(--color-tinta-2)]">{d.secciones}</td>
      <td className="num">{d.lista_nominal.toLocaleString('es-MX')}</td>
      <td className="num">
        {d.participacion === null ? '—' : `${d.participacion.toFixed(1)}%`}
      </td>
      <td className="whitespace-nowrap">
        {d.ganador ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: colorDeFuerza(d.ganador) }}
            />
            <span className="font-medium">{nombreDeFuerza(d.ganador)}</span>
            {d.pct_ganador !== null && <span className="clave">{d.pct_ganador}%</span>}
          </span>
        ) : (
          <span className="text-[var(--color-tinta-3)]">Sin resultados</span>
        )}
      </td>
      <td className="num font-medium" style={{ color: colorMargen }}>
        {d.margen === null ? '—' : `${d.margen.toFixed(1)}`}
        {d.margen !== null && d.segundo && (
          <span className="clave ml-1 font-normal">sobre {nombreDeFuerza(d.segundo)}</span>
        )}
      </td>
      <td className="num">
        <span className="inline-flex items-center gap-2">
          {d.peticiones.toLocaleString('es-MX')}
          <span
            className="h-[6px] w-10 overflow-hidden rounded-full bg-[var(--color-borde)]"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${d.peticiones > 0 ? Math.max((d.peticiones / maximo) * 100, 10) : 0}%`,
                background: 'var(--color-acento)',
              }}
            />
          </span>
        </span>
      </td>
      <td
        className="num font-medium"
        style={d.sin_resolver > 0 ? { color: 'var(--color-aviso)' } : undefined}
      >
        {d.sin_resolver.toLocaleString('es-MX')}
      </td>
      <td
        className="num"
        style={d.movilizadores === 0 ? { color: 'var(--color-alerta)' } : undefined}
        title={
          d.movilizadores === 0
            ? 'Ningún movilizador registrado en este distrito'
            : `${d.movilizadores} movilizador(es)`
        }
      >
        {d.movilizadores === 0 ? 'Nadie' : d.movilizadores}
      </td>
    </tr>
  )
}
