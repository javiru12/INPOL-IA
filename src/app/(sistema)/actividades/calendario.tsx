import Link from 'next/link'
import { DIAS_SEMANA, etiquetaMes, rejillaDelMes, type Celda } from './fechas'
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

function Pastilla({ actividad }: { actividad: ActividadEnRejilla }) {
  return (
    <Link
      href={`/actividades/${actividad.tipo}/${actividad.id}`}
      title={`${actividad.hora ? `${actividad.hora} · ` : ''}${actividad.titulo}`}
      className="block truncate rounded-[var(--radius-xs)] px-1.5 py-px text-[var(--text-micro)] font-medium leading-[1.45]"
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
        'min-w-0 px-1.5 pb-1.5 pt-1 min-h-[6.5rem]',
        conBordeDerecho ? 'border-r border-[var(--color-borde)]' : '',
        conBordeInferior ? 'border-b border-[var(--color-borde)]' : '',
      ].join(' ')}
      style={{
        background: celda.delMes ? undefined : 'var(--color-superficie-2)',
      }}
    >
      <div className="mb-1 flex h-[1.125rem] items-center">
        <span
          className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[var(--text-micro)] font-semibold tabular-nums"
          style={
            esHoy
              ? { background: 'var(--color-acento)', color: '#fff' }
              : { color: celda.delMes ? 'var(--color-tinta-2)' : 'var(--color-tinta-3)' }
          }
        >
          {celda.dia}
        </span>
      </div>

      <div className="space-y-[3px]" style={{ opacity: celda.delMes ? 1 : 0.55 }}>
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
 * Rejilla mensual de lunes a domingo, armada con CSS grid.
 * Los días de los meses vecinos completan las semanas y van atenuados.
 */
export function Calendario({
  mes,
  hoy,
  actividades,
  mesAnterior,
  mesSiguiente,
}: {
  mes: string
  hoy: string
  actividades: ActividadEnRejilla[]
  mesAnterior: string
  mesSiguiente: string
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
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-2.5">
        <h2 className="text-[var(--text-base)] font-semibold">{etiquetaMes(mes)}</h2>
        <div className="flex items-center gap-1.5">
          <span className="mr-2 flex items-center gap-3 text-[var(--text-micro)] text-[var(--color-tinta-2)]">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: 'var(--color-acento)' }}
              />
              Recorridos
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: 'var(--color-dato)' }}
              />
              Eventos
            </span>
          </span>
          <Link
            href={mesAnterior}
            className="boton boton-neutro !h-7 text-[var(--text-menuda)]"
            aria-label="Mes anterior"
          >
            Anterior
          </Link>
          <Link
            href={mesSiguiente}
            className="boton boton-neutro !h-7 text-[var(--text-menuda)]"
            aria-label="Mes siguiente"
          >
            Siguiente
          </Link>
        </div>
      </div>

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
    </section>
  )
}
