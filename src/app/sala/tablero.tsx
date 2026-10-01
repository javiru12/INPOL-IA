'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Marca } from '@/components/marca'
import { mesCorto, cifra } from '@/lib/formato'
import { CATEGORICA } from '@/lib/paleta'
import type { Pulso } from './consultas'

/**
 * Sala de mando: pensada para quedarse puesta en un monitor de la oficina.
 * Fondo oscuro, cifras grandes y legibles a varios metros, y lo accionable
 * —lo urgente que lleva días sin resolverse— en el lugar más visible.
 */
export function Tablero({ cliente, pulso }: { cliente: string; pulso: Pulso }) {
  const avance = pulso.totales.total
    ? Math.round((pulso.totales.completadas / pulso.totales.total) * 100)
    : 0

  const { mediana, previa } = pulso.diasResolucion
  const mejora = mediana !== null && previa !== null ? previa - mediana : null

  return (
    <div className="min-h-screen bg-[#151119] px-7 py-6 text-white">
      <header className="flex items-center justify-between gap-6 border-b border-white/10 pb-5">
        <div className="flex items-center gap-5">
          <Marca tono="claro" />
          <div className="border-l border-white/15 pl-5">
            <p className="text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.1em] text-white/35">
              Sala de mando
            </p>
            <p className="text-[1.0625rem] font-semibold">{cliente}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Reloj />
          <Link
            href="/"
            className="rounded-[var(--radius-sm)] border border-white/15 px-3 py-1.5 text-[var(--text-menuda)] text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            Salir de la sala
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <Cifra
          rotulo="Peticiones vivas"
          valor={pulso.totales.abiertas}
          pie="Abiertas, en proceso o en gestión"
          tono="#c7add6"
        />
        <Cifra
          rotulo="Urgentes sin resolver"
          valor={pulso.totales.urgentes}
          pie="Requieren atención hoy"
          tono={pulso.totales.urgentes > 0 ? '#f0836f' : '#7fd0a0'}
          alarma={pulso.totales.urgentes > 0}
        />
        <Cifra
          rotulo="Resueltas"
          valor={`${avance}%`}
          pie={`${cifra(pulso.totales.completadas)} de ${cifra(pulso.totales.total)}`}
          tono="#7fd0a0"
        />
        <Cifra
          rotulo="Días para resolver"
          valor={mediana !== null ? mediana.toFixed(1) : '—'}
          pie={
            mejora === null
              ? 'Mediana del trimestre'
              : mejora > 0
                ? `${mejora.toFixed(1)} días menos que el trimestre anterior`
                : `${Math.abs(mejora).toFixed(1)} días más que el trimestre anterior`
          }
          tono={mejora !== null && mejora > 0 ? '#7fd0a0' : '#e8c468'}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-5 py-4">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold">Demanda ciudadana</h2>
            <p className="text-[var(--text-menuda)] text-white/40">
              {cifra(pulso.totales.hoy)} hoy · {cifra(pulso.totales.semana)} esta semana
            </p>
          </div>
          <Tendencia datos={pulso.porMes} />
        </section>

        <section className="rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-5 py-4">
          <h2 className="mb-4 font-semibold">Qué pide la gente</h2>
          <ul className="space-y-2.5">
            {pulso.porProblematica.slice(0, 7).map((p, i) => {
              const maximo = pulso.porProblematica[0]?.valor || 1
              return (
                <li key={p.etiqueta}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[var(--text-menuda)] text-white/75">
                      {p.etiqueta}
                    </span>
                    <span className="shrink-0 text-[var(--text-menuda)] font-semibold tabular-nums">
                      {cifra(p.valor)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max((p.valor / maximo) * 100, 2)}%`,
                        background: CATEGORICA[i % CATEGORICA.length],
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-[var(--radius-md)] border border-[#f0836f]/25 bg-[#f0836f]/[0.05] px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Urgentes sin resolver</h2>
            <span className="text-[var(--text-menuda)] text-white/40">
              Ordenadas por antigüedad
            </span>
          </div>
          {pulso.urgentes.length === 0 ? (
            <p className="py-7 text-center text-[var(--text-menuda)] text-white/45">
              No hay peticiones urgentes pendientes.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.07]">
              {pulso.urgentes.map((u) => (
                <li key={u.id} className="flex items-center gap-4 py-2">
                  <span className="w-14 shrink-0 font-mono text-[var(--text-micro)] text-white/35">
                    {u.folio}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-menuda)]">
                    {u.ciudadano ?? 'Sin ciudadano'}
                    <span className="ml-2 text-white/40">{u.problematica}</span>
                  </span>
                  <span className="hidden w-40 shrink-0 truncate text-[var(--text-menuda)] text-white/45 sm:block">
                    {u.colonia ?? '—'}
                  </span>
                  <span
                    className="w-20 shrink-0 text-right text-[var(--text-menuda)] font-semibold tabular-nums"
                    style={{ color: u.dias > 14 ? '#f0836f' : '#e8c468' }}
                  >
                    {u.dias} {u.dias === 1 ? 'día' : 'días'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-5 py-4">
          <h2 className="mb-4 font-semibold">Dónde se concentra</h2>
          <ul className="space-y-2">
            {pulso.porColonia.map((c) => {
              const maximo = pulso.porColonia[0]?.valor || 1
              return (
                <li key={c.etiqueta} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[var(--text-menuda)] text-white/75">
                    {c.etiqueta}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <span
                      className="block h-full rounded-full bg-[#a681bd]"
                      style={{ width: `${Math.max((c.valor / maximo) * 100, 3)}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[var(--text-menuda)] font-semibold tabular-nums">
                    {c.valor}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Cifra({
  rotulo,
  valor,
  pie,
  tono,
  alarma,
}: {
  rotulo: string
  valor: number | string
  pie: string
  tono: string
  alarma?: boolean
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] border px-5 py-4"
      style={{
        borderColor: alarma ? 'rgba(240,131,111,.3)' : 'rgba(255,255,255,.1)',
        background: alarma ? 'rgba(240,131,111,.05)' : 'rgba(255,255,255,.025)',
      }}
    >
      <p className="text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.08em] text-white/40">
        {rotulo}
      </p>
      <p
        className="mt-2 text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums"
        style={{ color: tono }}
      >
        {typeof valor === 'number' ? cifra(valor) : valor}
      </p>
      <p className="mt-2 text-[var(--text-menuda)] text-white/45">{pie}</p>
    </div>
  )
}

/** Doce meses de demanda. Una serie, un color; el eje lo da la cuadrícula. */
function Tendencia({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1)
  const tope = Math.ceil(maximo / 25) * 25 || 25

  return (
    <div className="relative" style={{ height: 190 }}>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-6">
        {[1, 0.5, 0].map((l) => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[length:var(--text-micro)] tabular-nums text-white/25">
              {Math.round(tope * l)}
            </span>
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>
        ))}
      </div>

      <div className="relative flex h-full items-end gap-2 pl-11">
        {datos.map((d, i) => {
          const alto = (d.valor / tope) * 158
          const ultimo = i === datos.length - 1
          return (
            <div key={d.etiqueta} className="group flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[length:var(--text-micro)] font-semibold tabular-nums text-white/0 transition-colors group-hover:text-white/80">
                {d.valor}
              </span>
              <div
                className="w-full max-w-[42px] rounded-t-[4px] transition-colors"
                style={{
                  height: Math.max(alto, d.valor > 0 ? 3 : 0),
                  background: ultimo ? '#c7add6' : '#8459a0',
                }}
              />
              <span className="mt-1.5 text-[length:var(--text-micro)] text-white/30">
                {mesCorto(d.etiqueta)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Reloj() {
  const [ahora, setAhora] = useState<Date | null>(null)

  useEffect(() => {
    setAhora(new Date())
    const id = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Hasta que monta en el cliente no hay hora: pintarla en el servidor
  // provocaría un desajuste de hidratación.
  if (!ahora) return <div className="h-10 w-36" aria-hidden="true" />

  return (
    <div className="text-right">
      <p className="text-[1.375rem] font-semibold leading-none tabular-nums">
        {ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="mt-1 text-[var(--text-micro)] text-white/40 first-letter:uppercase">
        {ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  )
}
