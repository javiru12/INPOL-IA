import Link from 'next/link'
import { DIAS_SEMANA, etiquetaMes, rejillaDelMes, type Celda } from './fechas'
import { fechaLarga } from '@/lib/formato'
import type { ActividadEnRejilla } from './consultas'

const MAXIMO_PASTILLAS = 3

const PASTILLA = {
  recorrido: {
    background: 'var(--color-acento-suave)',
    color: 'var(--color-acento-fuerte)',
  },
  evento: {
    background: 'var(--color-dato-suave)',
    color: 'var(--color-dato)',
  },
} as const

/**
 * La pastilla envuelve en varios renglones.
 *
 * Antes iba en una sola línea con recorte, y *todos* los títulos
 * acababan cortados —«09:17 Recorrid…», «13:10 Posada …»— a cualquier
 * ancho, no solo en ventanas estrechas: en una casilla de 150px no
 * cabe el nombre de nada en un renglón. La casilla mide 7rem de alto y
 * casi siempre está vacía, así que el sitio sobraba: lo que faltaba
 * era dejarlo usar.
 */
function Pastilla({ actividad }: { actividad: ActividadEnRejilla }) {
  return (
    <Link
      href={`/actividades/${actividad.tipo}/${actividad.id}`}
      title={`${actividad.hora ? `${actividad.hora} · ` : ''}${actividad.titulo}`}
      className="line-clamp-4 rounded-[var(--radius-xs)] px-1.5 py-1 text-[var(--text-micro)] font-medium leading-[1.35]"
      style={PASTILLA[actividad.tipo]}
    >
      {actividad.hora && <span className="tabular-nums opacity-70">{actividad.hora} </span>}
      {actividad.titulo}
    </Link>
  )
}

function Dia({
  celda,
  actividades,
  esHoy,
  conBordeDerecho,
  conBordeInferior,
}: {
  celda: Celda
  actividades: ActividadEnRejilla[]
  esHoy: boolean
  conBordeDerecho: boolean
  conBordeInferior: boolean
}) {
  const visibles = actividades.slice(0, MAXIMO_PASTILLAS)
  const ocultas = actividades.length - visibles.length

  return (
    <div
      className={[
        'relative min-w-0 px-1.5 pb-1.5 pt-1 min-h-[7rem]',
        conBordeDerecho ? 'border-r border-[var(--color-borde)]' : '',
        conBordeInferior ? 'border-b border-[var(--color-borde)]' : '',
      ].join(' ')}
      style={{
        background: esHoy
          ? 'var(--color-acento-suave)'
          : celda.delMes
            ? undefined
            : 'var(--color-superficie-2)',
      }}
    >
      {/* Toda la casilla abre el alta con esa fecha, no solo el número:
          apuntarle a un número de un cuarto de centímetro es incómodo y
          nadie adivina que ahí hay que dar clic.

          Es un enlace extendido por debajo y no un contenedor pinchable
          porque las pastillas de actividad son enlaces a su vez, y un
          enlace dentro de otro no es HTML válido: las pastillas quedan
          por encima y siguen abriendo lo suyo. */}
      <Link
        href={`/actividades/nueva?fecha=${celda.iso}`}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 z-0 rounded-[var(--radius-xs)] hover:bg-[var(--color-acento-suave)]"
      />

      <div className="group/dia relative z-10 mb-1 flex h-[1.125rem] items-center justify-between">
        <Link
          href={`/actividades/nueva?fecha=${celda.iso}`}
          title={`Nueva actividad el ${celda.dia}`}
          className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[var(--text-micro)] font-semibold tabular-nums hover:ring-2 hover:ring-[var(--color-acento-borde)]"
          style={
            esHoy
              ? { background: 'var(--color-acento)', color: '#fff' }
              : { color: celda.delMes ? 'var(--color-tinta-2)' : 'var(--color-tinta-3)' }
          }
        >
          {celda.dia}
        </Link>
        <Link
          href={`/actividades/nueva?fecha=${celda.iso}`}
          aria-label={`Agregar actividad el ${celda.dia}`}
          className="hidden h-[1.125rem] w-[1.125rem] items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-tinta-3)] hover:bg-[var(--color-acento-suave)] hover:text-[var(--color-acento-fuerte)] group-hover/dia:flex"
        >
          +
        </Link>
      </div>

      <div
        className="relative z-10 space-y-[3px]"
        style={{ opacity: celda.delMes ? 1 : 0.55 }}
      >
        {visibles.map((a) => (
          <Pastilla key={`${a.tipo}-${a.id}`} actividad={a} />
        ))}
        {ocultas > 0 && (
          <span className="block px-1.5 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            +{ocultas} más
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * El mismo mes como lista, para cuando la rejilla no cabe.
 *
 * Siete columnas en una ventana angosta dejan casillas de 90px: ahí no
 * entra el nombre de una actividad por mucho que se recorte. En vertical
 * cada título tiene el ancho entero, y los días sin nada no ocupan sitio
 * porque no se dibujan.
 */
function Agenda({
  celdas,
  porDia,
  hoy,
}: {
  celdas: Celda[]
  porDia: Map<string, ActividadEnRejilla[]>
  hoy: string
}) {
  const conAlgo = celdas.filter((c) => c.delMes && (porDia.get(c.iso)?.length ?? 0) > 0)

  if (conAlgo.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
        No hay actividades programadas este mes.
      </p>
    )
  }

  return (
    <ol className="divide-y divide-[var(--color-borde)]">
      {conAlgo.map((c) => (
        <li key={c.iso} className="px-4 py-3">
          <p className="mb-2 flex items-center gap-2 text-[var(--text-menuda)] font-medium">
            {fechaLarga(c.iso)}
            {c.iso === hoy && (
              <span
                className="distintivo"
                style={{ background: 'var(--color-acento-suave)', color: 'var(--color-acento-fuerte)' }}
              >
                Hoy
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            {(porDia.get(c.iso) ?? []).map((a) => (
              <Link
                key={`${a.tipo}-${a.id}`}
                href={`/actividades/${a.tipo}/${a.id}`}
                className="flex items-baseline gap-2 rounded-[var(--radius-sm)] px-2.5 py-2"
                style={PASTILLA[a.tipo]}
              >
                {a.hora && (
                  <span className="shrink-0 tabular-nums text-[var(--text-menuda)] opacity-70">
                    {a.hora}
                  </span>
                )}
                <span className="min-w-0 font-medium">{a.titulo}</span>
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Rejilla mensual de lunes a domingo, armada con CSS grid.
 * Los días de los meses vecinos completan las semanas y van atenuados.
 */
export function Calendario({
  mes,
  hoy,
  actividades,
  mesAnterior,
  mesSiguiente,
  mesDeHoy,
}: {
  mes: string
  hoy: string
  actividades: ActividadEnRejilla[]
  mesAnterior: string
  mesSiguiente: string
  mesDeHoy: string
}) {
  const celdas = rejillaDelMes(mes)

  const porDia = new Map<string, ActividadEnRejilla[]>()
  for (const a of actividades) {
    const lista = porDia.get(a.fecha)
    if (lista) lista.push(a)
    else porDia.set(a.fecha, [a])
  }

  const ultimaFila = Math.floor((celdas.length - 1) / 7)

  return (
    <section className="panel overflow-clip">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={mesAnterior}
            className="boton boton-neutro !h-8 !w-8 !px-0"
            aria-label="Mes anterior"
            title="Mes anterior"
          >
            ‹
          </Link>
          <Link
            href={mesSiguiente}
            className="boton boton-neutro !h-8 !w-8 !px-0"
            aria-label="Mes siguiente"
            title="Mes siguiente"
          >
            ›
          </Link>
          {/* Después de dos o tres saltos de mes, volver al actual era
              contar meses hacia atrás a mano. */}
          <Link href={mesDeHoy} className="boton boton-neutro !h-8 text-[var(--text-menuda)]">
            Hoy
          </Link>
          <h2 className="ml-1 text-[length:var(--text-titulo)] font-semibold">
            {etiquetaMes(mes)}
          </h2>
        </div>

        <span className="flex items-center gap-3 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--color-acento)' }} />
            Recorridos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--color-dato)' }} />
            Eventos
          </span>
        </span>
      </div>

      <div className="hidden xl:block">
        <div className="grid grid-cols-7 border-b border-[var(--color-borde)] bg-[var(--color-superficie-2)]">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="rotulo px-1.5 py-1.5 text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {celdas.map((celda, i) => (
            <Dia
              key={celda.iso}
              celda={celda}
              actividades={porDia.get(celda.iso) ?? []}
              esHoy={celda.iso === hoy}
              conBordeDerecho={(i + 1) % 7 !== 0}
              conBordeInferior={Math.floor(i / 7) !== ultimaFila}
            />
          ))}
        </div>
      </div>

      <div className="xl:hidden">
        <Agenda celdas={celdas} porDia={porDia} hoy={hoy} />
      </div>
    </section>
  )
}
