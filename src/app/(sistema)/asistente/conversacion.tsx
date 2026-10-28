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

  const vacio = hilo.length === 0

  // Con la conversación vacía el campo vive en el centro, junto al
  // título: ahí es el protagonista y no queda un hueco muerto entre los
  // ejemplos y el pie. En cuanto hay respuestas baja y se fija abajo,
  // que es donde se busca para seguir preguntando.
  const campoDeTexto = (
    <div className="w-full">
      <div
        className="flex items-end gap-1.5 p-1.5 transition-[border-color,box-shadow] duration-200"
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-borde-fuerte)',
          background: 'var(--color-superficie)',
          boxShadow: texto
            ? '0 0 0 3px var(--color-acento-suave)'
            : '0 1px 2px rgb(28 24 36 / 0.04)',
          borderColor: texto ? 'var(--color-acento-borde)' : undefined,
        }}
      >
        <textarea
          ref={campo}
          rows={1}
          value={texto}
          disabled={trabajando}
          onChange={(e) => {
            setTexto(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              preguntar(texto)
            }
          }}
          placeholder={vacio ? 'Pregunta lo que quieras…' : 'Sigue preguntando…'}
          className="max-h-[180px] min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[var(--text-media)] leading-relaxed outline-none placeholder:text-[var(--color-tinta-3)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => preguntar(texto)}
          disabled={trabajando || texto.trim().length < 4}
          aria-label="Preguntar"
          className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center text-white transition-all duration-150 disabled:opacity-25"
          style={{
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-acento)',
          }}
        >
          {trabajando ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 13V3M4 7l4-4 4 4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      {vacio ? (
        // ---- Sin conversación: todo al centro ----
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="w-full max-w-[42rem] pb-12">
            <h2 className="text-center text-[length:var(--text-presente)] font-semibold leading-[1.1] tracking-[-0.02em]">
              ¿Qué quieres saber?
            </h2>
            <p className="mx-auto mt-3 max-w-[26rem] text-center text-[var(--text-base)] leading-relaxed text-[var(--color-tinta-2)]">
              Consulto tus datos, los cruzo y te contesto con cifras que puedes revisar
              una por una.
            </p>

            <div className="mt-7">{campoDeTexto}</div>

            <div className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {EJEMPLOS.map((g) => (
                <div key={g.grupo}>
                  <p className="rotulo mb-2">{g.grupo}</p>
                  {/* Con viñeta y sin borde parecían una lista de
                      lectura y nadie las tocaba. Cada una es un botón
                      con su propia superficie y una flecha que aparece:
                      se ve que llevan a algún lado. */}
                  <ul className="space-y-2">
                    {g.preguntas.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          onClick={() => preguntar(q)}
                          className="group flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-borde)] bg-[var(--color-superficie)] px-3.5 py-2.5 text-left text-[var(--text-menuda)] leading-snug text-[var(--color-tinta-2)] transition-colors hover:border-[var(--color-acento-borde)] hover:bg-[var(--color-acento-suave)] hover:text-[var(--color-tinta)]"
                        >
                          <span className="min-w-0 flex-1">{q}</span>
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-[var(--color-tinta-3)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-acento-fuerte)]"
                          >
                            →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        // ---- Con conversación: hilo arriba, campo abajo ----
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[48rem] space-y-8 pb-6">
              {hilo.map((v, i) => (
                <Intercambio key={i} vuelta={v} />
              ))}
            </div>
            {error && (
              <p
                className="mx-auto mt-3 max-w-[48rem] rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
                style={{ background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' }}
                role="alert"
              >
                {error}
              </p>
            )}
            <div ref={fondo} />
          </div>

          <div className="shrink-0 pt-3">
            <div className="mx-auto max-w-[48rem]">
              {campoDeTexto}
              <p className="mt-2 text-center text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                Puede equivocarse · abre «cómo lo averiguó» para ver de dónde salió cada cifra
              </p>
            </div>
          </div>
        </>
      )}

      {vacio && error && (
        <p
          className="mx-auto max-w-[42rem] rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
          style={{ background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' }}
          role="alert"
        >
          {error}
        </p>
      )}
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
          className="max-w-[80%] px-4 py-2.5 text-[var(--text-base)] leading-relaxed"
          style={{
            background: 'var(--color-acento-suave)',
            // Esquina viva del lado de quien escribe: es el detalle que
            // hace que una burbuja se lea como dicha por alguien y no
            // como una caja más de la pantalla.
            borderRadius: 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)',
          }}
        >
          {vuelta.pregunta}
        </p>
      </div>

      <div className="mt-4">
        {consultando && (
          <p className="flex items-center gap-2.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {/* Dos capas: un punto fijo y un halo que se expande. Un
                  parpadeo simple se lee como error; esto se lee como
                  algo en marcha. */}
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: 'var(--color-acento)' }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: 'var(--color-acento)' }}
              />
            </span>
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
