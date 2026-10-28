'use client'

import { useEffect, useRef, useState } from 'react'
import { BarrasHorizontales, BarrasTemporales } from '@/components/graficas'
import { TextoRico } from '@/components/texto-rico'
import type { Grafica, Evento } from '@/lib/ia'

/**
 * El asistente, como conversación.
 *
 * Dos decisiones que cambian cómo se siente:
 *
 * La respuesta se escribe conforme llega. Treinta segundos de pantalla
 * quieta y luego un muro de texto se sienten rotos aunque la respuesta
 * sea buena; viendo el texto aparecer, la misma espera se lee como
 * trabajo.
 *
 * Y mientras consulta, dice qué está consultando. «Viendo cuántas
 * peticiones hay por colonia» no es decoración: es lo que convierte la
 * espera en algo comprensible, y de paso deja claro que está mirando
 * los datos de verdad y no inventando.
 */

const EJEMPLOS: { grupo: string; preguntas: string[] }[] = [
  {
    grupo: 'Dónde actuar',
    preguntas: [
      '¿Qué secciones tienen mucha demanda y ningún movilizador?',
      '¿En qué distritos ganamos por menos de 5 puntos en 2015 y hoy tenemos peticiones sin resolver?',
      'Dame las 10 colonias donde más conviene abrir una brigada y explica por qué',
    ],
  },
  {
    grupo: 'Dónde duele',
    preguntas: [
      '¿Qué problemática tarda más y en qué municipios es peor que el promedio?',
      '¿Hay urgentes con más de 90 días sin un solo movimiento?',
      '¿Qué colonias piden algo muy distinto al resto del municipio?',
    ],
  },
  {
    grupo: 'Quién responde',
    preguntas: [
      '¿Quién tiene más carga y quién está desocupado?',
      '¿Qué gestores cierran más rápido que el promedio, y en qué temas?',
    ],
  },
  {
    grupo: 'A quién servimos',
    preguntas: [
      '¿La demanda de los adultos mayores es distinta?',
      '¿A cuántos no podríamos avisarles nada por no tener teléfono?',
      'Compara lo que entra por la app contra lo capturado en campo',
    ],
  },
]

type Vuelta = {
  pregunta: string
  respuesta: string
  graficas: Grafica[]
  consultas: { sql: string; porque: string; filas?: number; error?: string }[]
  enCurso?: boolean
}

export function Conversacion() {
  const [hilo, setHilo] = useState<Vuelta[]>([])
  const [texto, setTexto] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fondo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [hilo, trabajando])

  async function preguntar(q: string) {
    const pregunta = q.trim()
    if (pregunta.length < 4 || trabajando) return

    setError(null)
    setTexto('')
    setTrabajando(true)

    const historial = hilo
      .slice(-6)
      .map((v) => ({ pregunta: v.pregunta, respuesta: v.respuesta }))

    setHilo((h) => [
      ...h,
      { pregunta, respuesta: '', graficas: [], consultas: [], enCurso: true },
    ])

    // Se actualiza siempre la última vuelta del hilo, que es la que se
    // está escribiendo.
    const actualizar = (cambio: (v: Vuelta) => Vuelta) =>
      setHilo((h) => h.map((v, i) => (i === h.length - 1 ? cambio(v) : v)))

    try {
      const r = await fetch('/asistente/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pregunta, historial }),
      })
      if (!r.ok || !r.body) throw new Error(await r.text())

      const lector = r.body.getReader()
      const decodificador = new TextDecoder()
      let resto = ''

      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        resto += decodificador.decode(value, { stream: true })

        // Una lectura puede traer varias líneas o media: lo que queda a
        // medias se arrastra a la siguiente.
        const lineas = resto.split('\n')
        resto = lineas.pop() ?? ''

        for (const linea of lineas) {
          if (!linea.trim()) continue
          const e: Evento = JSON.parse(linea)

          if (e.t === 'texto') {
            actualizar((v) => ({ ...v, respuesta: v.respuesta + e.delta }))
          } else if (e.t === 'consulta') {
            actualizar((v) => ({
              ...v,
              consultas: [...v.consultas, { sql: e.sql, porque: e.porque }],
            }))
          } else if (e.t === 'filas') {
            actualizar((v) => ({
              ...v,
              consultas: v.consultas.map((c, i) =>
                i === v.consultas.length - 1 ? { ...c, filas: e.n, error: e.error } : c,
              ),
            }))
          } else if (e.t === 'grafica') {
            actualizar((v) => ({ ...v, graficas: [...v.graficas, e.grafica] }))
          } else if (e.t === 'error') {
            setError(e.mensaje)
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Se cortó la conexión.')
    } finally {
      actualizar((v) => ({ ...v, enCurso: false }))
      setTrabajando(false)
      campo.current?.focus()
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hilo.length === 0 ? (
          <Arranque alElegir={(q) => preguntar(q)} />
        ) : (
          <div className="space-y-6 pb-4">
            {hilo.map((v, i) => (
              <Intercambio key={i} vuelta={v} />
            ))}
          </div>
        )}
        {error && (
          <p
            className="mt-3 rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
            style={{ background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' }}
            role="alert"
          >
            {error}
          </p>
        )}
        <div ref={fondo} />
      </div>

      <div className="shrink-0 border-t border-[var(--color-borde)] bg-[var(--color-fondo)] pt-3">
        <div
          className="flex items-end gap-2 rounded-[var(--radius-md)] border p-2 transition-colors"
          style={{
            borderColor: texto ? 'var(--color-acento-borde)' : 'var(--color-borde-fuerte)',
            background: 'var(--color-superficie)',
          }}
        >
          <textarea
            ref={campo}
            rows={1}
            value={texto}
            disabled={trabajando}
            onChange={(e) => {
              setTexto(e.target.value)
              // Crece con el texto hasta un tope, como cualquier campo
              // de chat; un textarea de alto fijo se siente de formulario.
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                preguntar(texto)
              }
            }}
            placeholder={
              hilo.length ? 'Sigue preguntando…' : 'Pregunta lo que quieras sobre tus datos…'
            }
            className="max-h-[200px] min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[var(--text-base)] outline-none placeholder:text-[var(--color-tinta-3)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => preguntar(texto)}
            disabled={trabajando || texto.trim().length < 4}
            aria-label="Preguntar"
            className="boton boton-primario !h-9 !w-9 shrink-0 !p-0"
          >
            {trabajando ? (
              <span className="block h-3 w-3 animate-pulse rounded-full bg-white/80" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 13V3M4 7l4-4 4 4" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          Consulta los datos de este cliente y nada más. Puede equivocarse: abre «cómo lo
          averiguó» para ver de dónde salió cada cifra.
        </p>
      </div>
    </div>
  )
}

function Arranque({ alElegir }: { alElegir: (q: string) => void }) {
  return (
    <div className="space-y-4 py-2">
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        Pregunta en español. Consulta los datos, los cruza y te contesta con cifras que
        puedes revisar.
      </p>
      {EJEMPLOS.map((g) => (
        <div key={g.grupo}>
          <p className="rotulo mb-1.5">{g.grupo}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.preguntas.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => alElegir(q)}
                className="boton boton-neutro !h-auto !py-1.5 text-left text-[var(--text-micro)] transition-transform hover:-translate-y-px"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Intercambio({ vuelta }: { vuelta: Vuelta }) {
  const ultima = vuelta.consultas.at(-1)
  const consultando = vuelta.enCurso && !vuelta.respuesta

  return (
    <div>
      <div className="flex justify-end">
        <p
          className="max-w-[80%] rounded-[var(--radius-md)] px-3.5 py-2 text-[var(--text-base)]"
          style={{ background: 'var(--color-acento-suave)' }}
        >
          {vuelta.pregunta}
        </p>
      </div>

      <div className="mt-3">
        {consultando && (
          <p className="flex items-center gap-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: 'var(--color-acento)' }}
            />
            {ultima ? ultima.porque : 'Mirando los datos…'}
          </p>
        )}

        {vuelta.respuesta && <TextoRico texto={vuelta.respuesta} />}

        {vuelta.graficas.map((g, i) => (
          <Pintada key={i} grafica={g} />
        ))}

        {!vuelta.enCurso && vuelta.consultas.length > 0 && (
          <Consultas consultas={vuelta.consultas} />
        )}
      </div>
    </div>
  )
}

function Pintada({ grafica }: { grafica: Grafica }) {
  const datos = grafica.datos.map((d) => ({ etiqueta: d.etiqueta, valor: d.valor }))
  return (
    <figure className="mt-4">
      <figcaption className="mb-3">
        <h3 className="text-[var(--text-base)] font-semibold">{grafica.titulo}</h3>
        {grafica.pie && (
          <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {grafica.pie}
          </p>
        )}
      </figcaption>
      {grafica.tipo === 'lineas' ? (
        <BarrasTemporales datos={datos} />
      ) : (
        <BarrasHorizontales
          datos={datos}
          colorUnico="var(--color-acento)"
          participacion={grafica.tipo === 'barras'}
        />
      )}
    </figure>
  )
}

function Consultas({ consultas }: { consultas: Vuelta['consultas'] }) {
  return (
    <details className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
      <summary className="cursor-pointer px-3 py-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        Cómo lo averiguó · {consultas.length}{' '}
        {consultas.length === 1 ? 'consulta' : 'consultas'}
      </summary>
      <div className="space-y-2.5 border-t border-[var(--color-borde)] px-3 py-2.5">
        {consultas.map((c, i) => (
          <div key={i}>
            <p className="mb-1 text-[var(--text-micro)] text-[var(--color-tinta-2)]">
              {c.porque}
            </p>
            <pre className="overflow-x-auto rounded-[var(--radius-xs)] bg-[var(--color-superficie-2)] px-2.5 py-2 text-[length:var(--text-micro)] leading-relaxed">
              <code>{c.sql}</code>
            </pre>
            <p className="mt-1 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              {c.error ? `Falló: ${c.error}` : `${c.filas ?? 0} filas`}
            </p>
          </div>
        ))}
      </div>
    </details>
  )
}
