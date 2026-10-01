import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  listarSecciones,
  seccionesPrioritarias,
  participacionPorDistrito,
  catalogosDeTerritorio,
  POR_PAGINA,
  type Orden,
} from './consultas'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { ParticipacionPorDistrito } from './grafica'
import { COLOR_OTRAS, ESTADO } from '@/lib/paleta'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Territorio' }

/**
 * Partidos con color institucional. El color nunca va solo: la celda
 * siempre escribe el nombre al lado. Coaliciones, independientes y
 * partidos sin color propio caen en el gris de «otras», para no pasar
 * de ocho colores en pantalla.
 */
const PARTIDOS: Record<string, { etiqueta: string; color?: string }> = {
  PAN: { etiqueta: 'PAN', color: '#0b4ea2' },
  PRI: { etiqueta: 'PRI', color: '#0e7a3c' },
  MORENA: { etiqueta: 'Morena', color: '#9c1639' },
  MC: { etiqueta: 'MC', color: '#d8641b' },
  PRD: { etiqueta: 'PRD', color: '#c9a406' },
  PVEM: { etiqueta: 'PVEM', color: '#5aa832' },
  PT: { etiqueta: 'PT', color: '#c4231c' },
  NVA_ALIANZA: { etiqueta: 'Nueva Alianza' },
  ES: { etiqueta: 'Encuentro Social' },
  PH: { etiqueta: 'Humanista' },
  PD: { etiqueta: 'Demócrata' },
  CC: { etiqueta: 'Cruzada Ciudadana' },
  CAN_NREG: { etiqueta: 'No registrados' },
}

function nombrePartido(clave: string) {
  if (PARTIDOS[clave]) return PARTIDOS[clave].etiqueta
  if (clave.startsWith('CAND_IND')) return 'Independiente'
  // Coaliciones: el INE las reporta como 'PRI_PVEM_NVA_ALIANZA'.
  return clave.split('_').join('-')
}

function colorPartido(clave: string) {
  return PARTIDOS[clave]?.color ?? COLOR_OTRAS
}

/** Encabezado que reordena la tabla sin salir de la URL. */
function Ordenable({
  columna,
  actual,
  consulta,
  children,
}: {
  columna: Orden
  actual: Orden
  consulta: URLSearchParams
  children: string
}) {
  const siguientes = new URLSearchParams(consulta)
  siguientes.set('orden', columna)
  siguientes.delete('pagina')
  const activo = actual === columna

  return (
    <th className="num" aria-sort={activo ? 'descending' : 'none'}>
      <Link
        href={`/territorio?${siguientes.toString()}`}
        className="inline-flex items-center gap-1 hover:text-[var(--color-tinta)]"
        style={activo ? { color: 'var(--color-acento-fuerte)' } : undefined}
      >
        {children}
        <span aria-hidden="true" style={{ opacity: activo ? 1 : 0.3 }}>
          ↓
        </span>
      </Link>
    </th>
  )
}

export default async function Territorio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/territorio')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const ordenPedido = texto(sp.orden)
  const orden: Orden =
    ordenPedido === 'lista' || ordenPedido === 'participacion' ? ordenPedido : 'peticiones'

  const filtros = {
    municipio: texto(sp.municipio),
    distrito: texto(sp.distrito),
    orden,
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  }

  const [r, prioritarias, porDistrito, catalogos] = await Promise.all([
    listarSecciones(tenant.id, filtros),
    seccionesPrioritarias(tenant.id, filtros),
    participacionPorDistrito(filtros),
    catalogosDeTerritorio(filtros.municipio),
  ])

  const ind = r.indicadores
  const promedio = ind.secciones ? ind.peticiones / ind.secciones : 0

  // El orden viaja en la URL, igual que los filtros: un territorio
  // ordenado se puede compartir tal cual con quien opera en campo.
  const consulta = new URLSearchParams()
  for (const [llave, valor] of Object.entries(sp)) {
    if (typeof valor === 'string' && valor) consulta.set(llave, valor)
  }

  return (
    <Pagina
      titulo="Territorio"
      descripcion="Sección por sección: lo que pide la gente contra cómo votó en 2015"
    >
      <Filtros
        selectores={[
          { nombre: 'municipio', etiqueta: 'Municipio', opciones: catalogos.municipios },
          { nombre: 'distrito', etiqueta: 'Distrito local', opciones: catalogos.distritos },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta="Secciones con peticiones"
          valor={ind.con_peticiones}
          tono={ind.con_peticiones > 0 ? 'dato' : 'neutro'}
          pie={
            ind.secciones
              ? `${Math.round((ind.con_peticiones / ind.secciones) * 100)}% del territorio filtrado`
              : 'Sin secciones en el filtro'
          }
        />
        <Indicador
          etiqueta="Secciones en el padrón"
          valor={ind.secciones}
          pie={filtros.municipio ?? 'Nuevo León, los 51 municipios'}
        />
        <Indicador
          etiqueta="Lista nominal"
          valor={ind.lista_nominal}
          pie="Electores registrados según el INE"
        />
        <Indicador
          etiqueta="Peticiones por sección"
          valor={promedio.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
          pie={`${ind.peticiones.toLocaleString('es-MX')} peticiones entre ${ind.secciones.toLocaleString('es-MX')} secciones`}
        />
      </div>

      {ind.secciones === 0 ? (
        <div className="mt-3">
          <Vacio
            titulo="Ninguna sección coincide"
            descripcion="Ese municipio y ese distrito local no se cruzan. Prueba quitando uno de los dos filtros."
          />
        </div>
      ) : (
        <section className="panel mt-3 overflow-hidden">
          {ind.peticiones === 0 && (
            <p className="border-b border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Todavía no hay peticiones ligadas a una sección. Mientras tanto, el padrón y los
              resultados de 2015 ya sirven para decidir por dónde empezar.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Municipio</th>
                  <th className="num">Distrito</th>
                  <Ordenable columna="lista" actual={orden} consulta={consulta}>
                    Lista nominal
                  </Ordenable>
                  <Ordenable columna="peticiones" actual={orden} consulta={consulta}>
                    Peticiones
                  </Ordenable>
                  <th className="num">Ciudadanos</th>
                  <Ordenable columna="participacion" actual={orden} consulta={consulta}>
                    Participación 2015
                  </Ordenable>
                  <th>Más votado 2015</th>
                  <th className="w-20">Carga</th>
                </tr>
              </thead>
              <tbody>
                {r.filas.map((s) => {
                  const excede = s.participacion !== null && s.participacion > 100
                  const ancho = ind.maximo_peticiones
                    ? (s.peticiones / ind.maximo_peticiones) * 100
                    : 0
                  return (
                    <tr key={s.id}>
                      <td className="clave font-medium">{s.clave}</td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {s.municipio}
                      </td>
                      <td className="num clave">{s.distrito ?? '—'}</td>
                      <td className="num">
                        {s.lista_nominal?.toLocaleString('es-MX') ?? '—'}
                      </td>
                      <td className="num font-medium">
                        {s.peticiones.toLocaleString('es-MX')}
                      </td>
                      <td className="num text-[var(--color-tinta-2)]">
                        {s.ciudadanos.toLocaleString('es-MX')}
                      </td>
                      <td
                        className="num font-medium"
                        style={excede ? { color: ESTADO.aviso } : undefined}
                        title={
                          excede
                            ? 'El INE reporta más votos emitidos que lista nominal en esta sección'
                            : undefined
                        }
                      >
                        {s.participacion === null ? '—' : `${s.participacion.toFixed(1)}%`}
                      </td>
                      <td className="whitespace-nowrap">
                        {s.partido ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-[2px]"
                              style={{ background: colorPartido(s.partido) }}
                            />
                            <span className="font-medium">{nombrePartido(s.partido)}</span>
                            <span className="clave">
                              {s.partido_votos?.toLocaleString('es-MX') ?? ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--color-tinta-3)]">Sin resultados</span>
                        )}
                      </td>
                      <td>
                        <div
                          className="h-[6px] w-16 overflow-hidden rounded-full bg-[var(--color-borde)]"
                          title={`${s.peticiones} de ${ind.maximo_peticiones} peticiones en la sección más cargada`}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.peticiones > 0 ? Math.max(ancho, 10) : 0}%`,
                              background: 'var(--color-acento)',
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginador pagina={r.pagina} porPagina={POR_PAGINA} total={ind.secciones} />
        </section>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="panel self-start overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">Secciones prioritarias</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Más peticiones sin resolver: ahí es donde hay que mandar gente
            </p>
          </div>
          {prioritarias.length ? (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Municipio</th>
                  <th className="num">Distrito</th>
                  <th className="num">Sin resolver</th>
                  <th className="num">Capturadas</th>
                </tr>
              </thead>
              <tbody>
                {prioritarias.map((s) => (
                  <tr key={s.clave}>
                    <td className="clave font-medium">{s.clave}</td>
                    <td className="text-[var(--color-tinta-2)]">{s.municipio}</td>
                    <td className="num clave">{s.distrito ?? '—'}</td>
                    <td className="num font-semibold" style={{ color: ESTADO.alerta }}>
                      {s.sin_resolver}
                    </td>
                    <td className="num text-[var(--color-tinta-2)]">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Sin peticiones pendientes en el territorio filtrado.
            </p>
          )}
        </section>

        <section className="panel px-4 py-3.5">
          <div className="mb-4">
            <h2 className="text-[var(--text-base)] font-semibold">
              Participación histórica por distrito
            </h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Votos emitidos sobre lista nominal · gubernatura 2015
            </p>
          </div>
          {porDistrito.length ? (
            <ParticipacionPorDistrito datos={porDistrito} />
          ) : (
            <p className="py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Sin distritos en el territorio filtrado.
            </p>
          )}
        </section>
      </div>
    </Pagina>
  )
}
