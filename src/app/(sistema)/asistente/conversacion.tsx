'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { responder, type EstadoAsistente, type Vuelta } from './acciones'
import { BarrasHorizontales, BarrasTemporales } from '@/components/graficas'
import { TextoRico } from '@/components/texto-rico'
import type { Grafica } from '@/lib/ia'

/**
 * Preguntarle al sistema.
 *
 * Se deja ver cómo llegó a la respuesta. Un número sin procedencia en
 * una pantalla de gobierno no se puede usar para decidir nada: quien lo
 * va a citar en una junta necesita poder abrir la consulta y ver de
 * dónde salió. Por eso los pasos están ahí, plegados, y no escondidos.
 */

/**
 * Las preguntas de arranque.
 *
 * Están elegidas para enseñar lo que NINGUNA otra pantalla puede
 * contestar: cruces entre territorio, elección, estructura y demanda.
 * Un ejemplo que se responde mirando Estadísticas no demuestra nada,
 * solo enseña un camino más largo para llegar a lo mismo.
 */
const EJEMPLOS: { grupo: string; preguntas: string[] }[] = [
  {
    grupo: 'Dónde actuar',
    preguntas: [
      '¿Qué secciones tienen mucha demanda ciudadana y ningún movilizador asignado?',
      '¿En qué distritos ganamos por menos de 5 puntos en 2015 y hoy tenemos peticiones sin resolver?',
      'Dame las 10 colonias donde más conviene abrir una brigada y explica por qué cada una',
    ],
  },
  {
    grupo: 'Dónde duele',
    preguntas: [
      '¿Qué problemática tarda más en resolverse y en qué municipios es peor que el promedio?',
      '¿Hay peticiones urgentes que lleven más de 90 días sin un solo movimiento?',
      '¿Qué colonias piden una cosa muy distinta al resto del municipio?',
    ],
  },
  {
    grupo: 'Quién responde',
    preguntas: [
      '¿Quién del equipo tiene más carga y quién está desocupado?',
      '¿Qué gestores cierran más rápido que el promedio, y en qué temas?',
      '¿Hay peticiones que cambiaron de responsable más de dos veces?',
    ],
  },
  {
    grupo: 'A quién servimos',
    preguntas: [
      '¿La demanda de los adultos mayores es distinta a la del resto?',
      '¿A cuántos ciudadanos no podríamos avisarles nada porque no tienen teléfono?',
      'Compara las peticiones que entraron por la app contra las capturadas en campo',
    ],
  },
]


export function Conversacion() {
  const [estado, enviar] = useActionState<EstadoAsistente, FormData>(responder, {
    hilo: [],
  })
  const campo = useRef<HTMLTextAreaElement>(null)
  const [texto, setTexto] = useState('')
  const fondo = useRef<HTMLDivElement>(null)
  const hilo = estado.hilo

  // Tras responder, el cursor vuelve al campo y la vista baja: la
  // siguiente pregunta casi siempre sale de la respuesta anterior.
  useEffect(() => {
    if (estado.hilo.length > 0 || estado.error) {
      campo.current?.focus()
      fondo.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [estado])

  return (
    <div className="space-y-3">
      {hilo.map((v, i) => (
        <section key={i} className="panel px-4 py-4">
          <p className="mb-3 border-l-2 border-[var(--color-acento)] pl-3 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {v.pregunta}
          </p>
          <TextoRico texto={v.respuesta} />
          {v.graficas.map((g, j) => (
            <Pintada key={j} grafica={g} />
          ))}
          {v.pasos.length > 0 && <Pasos pasos={v.pasos} />}
        </section>
      ))}

      <form
        action={(d) => {
          d.set('hilo', JSON.stringify(hilo))
          setTexto('')
          return enviar(d)
        }}
        className="panel px-4 py-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Pregúntale a tus datos
          </span>
          <textarea
            ref={campo}
            name="pregunta"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea. En un
              // campo de una o dos líneas, pedir que se use el ratón
              // para enviar es fricción sin motivo.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={hilo.length ? "Sigue preguntando sobre lo de arriba…" : "Por ejemplo: ¿qué problemática tarda más en resolverse y en qué municipios?"}
            className="campo !h-auto py-2"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Enviar />
          {hilo.length === 0 && !estado.error && (
            <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Consulta los datos de {''}
              <strong className="font-medium">este cliente</strong> y nada más.
            </span>
          )}
        </div>

        {hilo.length === 0 && (
          <div className="mt-4 space-y-3">
            {EJEMPLOS.map((g) => (
              <div key={g.grupo}>
                <p className="rotulo mb-1.5">{g.grupo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.preguntas.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setTexto(q)
                        campo.current?.focus()
                      }}
                      className="boton boton-neutro !h-auto !py-1.5 text-left text-[var(--text-micro)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </form>

      {estado.error && (
        <p
          className="rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
          style={{ background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' }}
          role="alert"
        >
          {estado.error}
        </p>
      )}

      <div ref={fondo} />
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
          // Un ranking de porcentajes no tiene «parte del total»: el
          // 4% de una serie de tasas no significa nada.
          participacion={grafica.tipo === 'barras'}
        />
      )}
    </figure>
  )
}

function Pasos({ pasos }: { pasos: Vuelta['pasos'] }) {
  const consultas = pasos.filter((p) => p.tipo === 'consulta')
  if (consultas.length === 0) return null

  return (
    <details className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
      <summary className="cursor-pointer px-3 py-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        Cómo llegó a esto · {consultas.length}{' '}
        {consultas.length === 1 ? 'consulta' : 'consultas'}
      </summary>
      <div className="space-y-2 border-t border-[var(--color-borde)] px-3 py-2.5">
        {consultas.map((p, i) => (
          <div key={i}>
            <pre className="overflow-x-auto rounded-[var(--radius-xs)] bg-[var(--color-superficie-2)] px-2.5 py-2 text-[length:var(--text-micro)] leading-relaxed">
              <code>{p.tipo === 'consulta' ? p.sql : ''}</code>
            </pre>
            <p className="mt-1 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              {p.tipo === 'consulta' && p.error
                ? `Falló: ${p.error}`
                : p.tipo === 'consulta'
                  ? `${p.filas} ${p.filas === 1 ? 'fila' : 'filas'}`
                  : ''}
            </p>
          </div>
        ))}
      </div>
    </details>
  )
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario">
      {pending ? 'Consultando los datos…' : 'Preguntar'}
    </button>
  )
}
