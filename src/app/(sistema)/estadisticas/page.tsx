import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  estadisticasDeGestion,
  esOrden,
  esRango,
  RANGOS,
  RANGO_POR_DEFECTO,
  UMBRAL_ATORADAS,
  type Orden,
} from './consultas'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { Filtros } from '@/components/filtros'
import { BarrasHorizontales } from '@/components/graficas'
import { LineasTemporales, RangoPorCategoria, Embudo } from '@/components/analitica'
import { agruparCola, CATEGORICA } from '@/lib/paleta'
import { RAMPA_SECUENCIAL } from '@/lib/escalas'
import { mesLargo, cifra, porcentaje } from '@/lib/formato'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Estadísticas' }

/** Etapas ordenadas: rampa de un tono, más avanzada más oscura. */
const EMBUDO = [RAMPA_SECUENCIAL[2], RAMPA_SECUENCIAL[4], RAMPA_SECUENCIAL[6]]
/** Mediana y percentil 90 son la misma medida en dos puntos: un tono, dos pasos. */
const RANGO_TIPICO = RAMPA_SECUENCIAL[4]
const RANGO_MALO = RAMPA_SECUENCIAL[6]
const RANGO_CONECTOR = RAMPA_SECUENCIAL[2]

const PERFILES: Record<string, string> = {
  super_admin: 'Administración general',
  admin: 'Administración',
  asignador: 'Asignación',
  gestor_social: 'Gestión social',
  operador_gestion: 'Operación de gestión',
  operador_campo: 'Operación de campo',
  marketing: 'Marketing',
}

/** Perfil sin traducción conocida: se muestra legible, no la clave cruda. */
function nombrePerfil(clave: string | null) {
  if (!clave) return '—'
  const conocido = PERFILES[clave]
  if (conocido) return conocido
  const texto = clave.replaceAll('_', ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const COLUMNAS: { clave: Orden; titulo: string; num: boolean }[] = [
  { clave: 'nombre', titulo: 'Responsable', num: false },
  { clave: 'asignadas', titulo: 'Asignadas', num: true },
  { clave: 'resueltas', titulo: 'Resueltas', num: true },
  { clave: 'tasa', titulo: '% resolución', num: true },
  { clave: 'mediana', titulo: 'Mediana días', num: true },
]

const dias = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 1 })
/** En columna, con decimal fijo: así los dígitos caen alineados. */
const diasEnColumna = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default async function Estadisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/estadisticas')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const crudoRango = texto(sp.rango)
  const rango = esRango(crudoRango) ? crudoRango : RANGO_POR_DEFECTO
  const crudoOrden = texto(sp.orden)
  const orden: Orden = esOrden(crudoOrden) ? crudoOrden : 'asignadas'
  const dir = texto(sp.dir) === 'asc' ? 'asc' : 'desc'

  const r = await estadisticasDeGestion(tenant.id, {
    rango,
    problematica: texto(sp.problematica),
    dependencia: texto(sp.dependencia),
    orden,
    dir,
  })

  const filtros = (
    <Filtros
      selectores={[
        {
          nombre: 'rango',
          etiqueta: 'Periodo',
          vacio: `${RANGOS[RANGO_POR_DEFECTO].etiqueta} (por omisión)`,
          opciones: Object.entries(RANGOS).map(([valor, v]) => ({
            valor,
            etiqueta: v.etiqueta,
          })),
        },
        { nombre: 'problematica', etiqueta: 'Problemática', opciones: r.opciones.problematicas },
        { nombre: 'dependencia', etiqueta: 'Dependencia', opciones: r.opciones.dependencias },
      ]}
    />
  )

  if (!r.hayDatos) {
    return (
      <Pagina
        titulo="Estadísticas"
        descripcion="Cómo se comporta la gestión: demanda, tiempos de respuesta y cumplimiento"
      >
        {filtros}
        <Vacio
          titulo="No hay peticiones en este periodo"
          descripcion="Amplía el rango de fechas o quita alguno de los filtros para ver el análisis."
        />
      </Pagina>
    )
  }

  const meses = r.evolucion.map((m) => m.mes)
  const primerMes = meses[0]
  const ultimoMes = meses[meses.length - 1]
  const rotuloPeriodo =
    primerMes === ultimoMes
      ? mesLargo(primerMes)
      : `${mesLargo(primerMes)} a ${mesLargo(ultimoMes)}`

  const resueltasPct = porcentaje(r.totales.resueltas, r.totales.capturadas)

  // Enlaces de ordenamiento: conservan los filtros vigentes y alternan el
  // sentido al repetir la misma columna.
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.trim() && k !== 'orden' && k !== 'dir') base.set(k, v.trim())
  }
  const enlaceOrden = (col: Orden) => {
    const q = new URLSearchParams(base)
    q.set('orden', col)
    q.set('dir', orden === col ? (dir === 'desc' ? 'asc' : 'desc') : col === 'nombre' ? 'asc' : 'desc')
    return `/estadisticas?${q.toString()}`
  }

  const fuentes = agruparCola(r.porFuente, 8)
  const dependencias = agruparCola(r.porDependencia, 8)
  const totalFuente = r.porFuente.reduce((s, f) => s + f.valor, 0)

  return (
    <Pagina
      titulo="Estadísticas"
      descripcion="Cómo se comporta la gestión: demanda, tiempos de respuesta y cumplimiento"
      acciones={
        <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {rotuloPeriodo}
        </span>
      }
    >
      {filtros}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta="Peticiones capturadas"
          valor={r.totales.capturadas}
          pie={`Levantadas entre ${rotuloPeriodo}`}
        />
        <Indicador
          etiqueta="Resueltas"
          valor={r.totales.resueltas}
          tono="exito"
          pie={`${resueltasPct} de lo capturado en el periodo`}
        />
        <Indicador
          etiqueta="Días para resolver"
          valor={r.tiempos.mediana !== null ? dias(r.tiempos.mediana) : '—'}
          tono="dato"
          pie={
            r.tiempos.mediana === null
              ? 'Sin cierres en el periodo'
              : `Mediana de las ${cifra(r.tiempos.cerradas)} cerradas en el periodo · P90 ${dias(r.tiempos.p90 ?? 0)}`
          }
        />
        <Indicador
          etiqueta={`Atoradas (+${UMBRAL_ATORADAS} días)`}
          valor={r.totales.atoradas}
          tono={r.totales.atoradas > 0 ? 'alerta' : 'neutro'}
          pie={`Siguen abiertas de las ${cifra(r.totales.vivas)} vivas del periodo`}
        />
      </div>

      {/* 1 · ¿Estamos mejorando o empeorando? ------------------------- */}
      <section className="panel mt-3 px-4 py-3.5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[var(--text-base)] font-semibold">
            Lo que entra contra lo que sale
          </h2>
          <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Recibidas por mes de captura · resueltas por mes de cierre
            {r.periodo.mesEnCurso && ' · el mes en curso va a medias'}
          </p>
        </div>
        <LineasTemporales
          meses={meses}
          mesEnCurso={r.periodo.mesEnCurso}
          altura={230}
          series={[
            {
              clave: 'recibidas',
              etiqueta: 'Recibidas',
              color: CATEGORICA[0],
              valores: r.evolucion.map((m) => m.recibidas),
            },
            {
              clave: 'resueltas',
              etiqueta: 'Resueltas',
              color: CATEGORICA[1],
              valores: r.evolucion.map((m) => m.resueltas),
            },
          ]}
        />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <section className="panel px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">
              Días para resolver, mes a mes
            </h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Mediana de lo que cerró cada mes
            </p>
          </div>
          <LineasTemporales
            meses={meses}
            mesEnCurso={r.periodo.mesEnCurso}
            altura={250}
            unidad=" d"
            decimales={1}
            series={[
              {
                clave: 'mediana',
                etiqueta: 'Mediana de días',
                color: CATEGORICA[0],
                valores: r.evolucion.map((m) => m.mediana),
              },
            ]}
          />
          <p className="mt-2 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
            Es la línea que debería ir bajando. Los meses sin ningún cierre quedan en blanco.
          </p>
        </section>

        {/* 5 · ¿Cumplimos? ------------------------------------------- */}
        <section className="panel px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">Embudo de cumplimiento</h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Sobre lo capturado en el periodo
            </p>
          </div>
          <Embudo
            etapas={[
              {
                etiqueta: 'Capturadas',
                valor: r.totales.capturadas,
                descripcion: 'Todo lo que entró al sistema',
                color: EMBUDO[0],
              },
              {
                etiqueta: 'Puestas en proceso',
                valor: r.totales.trabajadas,
                descripcion: 'Salieron de la bandeja de entrada y se turnaron',
                color: EMBUDO[1],
              },
              {
                etiqueta: 'Resueltas',
                valor: r.totales.resueltas,
                descripcion: 'Cerradas como completadas',
                color: EMBUDO[2],
              },
            ]}
            fugas={[
              {
                etiqueta: 'Sin interpretar',
                valor: r.totales.sinInterpretar,
                descripcion: 'nadie las clasificó',
              },
              {
                etiqueta: 'Abiertas sin arrancar',
                valor: r.totales.sinArrancar,
                descripcion: 'capturadas y ahí siguen',
              },
              {
                etiqueta: 'Canceladas',
                valor: r.totales.canceladas,
                descripcion: 'se trabajaron y se dieron de baja',
              },
            ]}
          />
        </section>
      </div>

      {/* 2 · ¿Qué tan rápido resolvemos, y qué se nos atora? ---------- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <section className="panel px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">
              Días para resolver por problemática
            </h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              De lo cerrado en el periodo · mínimo 3 casos
            </p>
          </div>
          {r.porProblematica.length ? (
            <RangoPorCategoria
              datos={r.porProblematica.map((p) => ({
                etiqueta: p.etiqueta,
                desde: p.mediana,
                hasta: p.p90,
                pie: `${cifra(p.cerradas)} cerradas`,
              }))}
              decimales={1}
              unidad=" d"
              etiquetaDesde="Mediana"
              etiquetaHasta="Percentil 90"
              colorDesde={RANGO_TIPICO}
              colorHasta={RANGO_MALO}
              colorConector={RANGO_CONECTOR}
            />
          ) : (
            <p className="py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              No hubo suficientes cierres en el periodo para calcular tiempos.
            </p>
          )}
          <p className="mt-3 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
            La mediana es el caso típico; el percentil 90 es lo que tarda el 10% peor. La
            distancia entre los dos puntos es lo irregular que resulta el trámite.
          </p>
        </section>

        <section className="panel px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">Lo que se atora</h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Abiertas con más de {UMBRAL_ATORADAS} días
            </p>
          </div>
          {r.atoradas.length ? (
            <>
              <BarrasHorizontales
                datos={r.atoradas.map((a) => ({ etiqueta: a.etiqueta, valor: a.valor }))}
                colorUnico="var(--color-alerta)"
                participacion={false}
              />
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--color-borde)] pt-3">
                {[
                  { t: `Más de ${UMBRAL_ATORADAS}`, v: r.totales.atoradas },
                  { t: 'Más de 60', v: r.totales.atoradas60 },
                  { t: 'Más de 120', v: r.totales.atoradas120 },
                ].map((b) => (
                  <div key={b.t}>
                    <dt className="rotulo">{b.t} días</dt>
                    <dd
                      className="cifra mt-0.5 text-[var(--text-media)] font-semibold"
                      style={{ color: 'var(--color-alerta)' }}
                    >
                      {cifra(b.v)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
                Los cortes se acumulan: las de más de 120 días también están contadas en los
                otros dos. La más vieja del periodo lleva{' '}
                {cifra(Math.max(...r.atoradas.map((a) => a.masVieja)))} días sin cerrarse.
              </p>
            </>
          ) : (
            <p className="py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Ninguna petición viva del periodo rebasa los {UMBRAL_ATORADAS} días.
            </p>
          )}
        </section>
      </div>

      {/* 3 · ¿Cómo va cada quien? ------------------------------------ */}
      <section className="panel mt-3 overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-borde)] px-4 py-3">
          <h2 className="text-[var(--text-base)] font-semibold">Cómo va cada responsable</h2>
          <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Peticiones asignadas de las capturadas en el periodo · la mediana es la de lo que
            ya resolvió
          </p>
        </div>
        {r.responsables.length === 0 ? (
          <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Ninguna petición del periodo tiene responsable asignado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  {COLUMNAS.map((c) => (
                    <th key={c.clave} className={c.num ? 'num' : undefined}>
                      <Link
                        href={enlaceOrden(c.clave)}
                        scroll={false}
                        className="inline-flex items-center gap-1 hover:text-[var(--color-acento-fuerte)]"
                        aria-sort={
                          orden === c.clave
                            ? dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        {c.titulo}
                        <span aria-hidden="true" className="text-[var(--color-tinta-3)]">
                          {orden === c.clave ? (dir === 'asc' ? '↑' : '↓') : '·'}
                        </span>
                      </Link>
                    </th>
                  ))}
                  <th>Avance</th>
                </tr>
              </thead>
              <tbody>
                {r.responsables.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap font-medium">
                      {p.nombre}
                      <span className="ml-2 text-[length:var(--text-micro)] font-normal text-[var(--color-tinta-3)]">
                        {nombrePerfil(p.perfil)}
                      </span>
                    </td>
                    <td className="num cifra">{cifra(p.asignadas)}</td>
                    <td className="num cifra">{cifra(p.resueltas)}</td>
                    <td className="num cifra font-semibold">
                      {Math.round(p.tasa * 100)}%
                    </td>
                    <td className="num cifra">
                      {p.mediana !== null ? diasEnColumna(p.mediana) : '—'}
                    </td>
                    <td className="w-40">
                      <span className="block h-[7px] w-full overflow-hidden rounded-full bg-[var(--color-superficie-2)]">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(p.tasa * 100, 1.5)}%`,
                            background: 'var(--color-exito)',
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4 · ¿De dónde llega la demanda? ----------------------------- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="panel px-4 py-3.5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">Por dónde llega la demanda</h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              {cifra(totalFuente)} peticiones del periodo
            </p>
          </div>
          <BarrasHorizontales datos={fuentes} colorUnico="var(--color-acento)" />
        </section>

        <section className="panel px-4 py-3.5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[var(--text-base)] font-semibold">A qué dependencia se turna</h2>
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Responsable de resolver
            </p>
          </div>
          <BarrasHorizontales datos={dependencias} colorUnico="var(--color-acento)" />
        </section>
      </div>
    </Pagina>
  )
}
