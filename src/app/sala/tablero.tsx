'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Marca } from '@/components/marca'
import { Anillo } from '@/components/anillo'
import { mesCorto, cifra } from '@/lib/formato'
import { CATEGORICA, ESTADO } from '@/lib/paleta'
import type { Pulso } from './consultas'

/**
 * Sala de mando: pensada para quedarse puesta en un monitor de la
 * oficina. Mismo lenguaje que los demás tableros —fondo con luz,
 * superficies de vidrio— y todo un punto más grande que en una pantalla
 * de trabajo, porque esta se lee de pie y desde lejos.
 *
 * Lo accionable —lo urgente que lleva días sin moverse— ocupa el lugar
 * más visible y es lo único que se pinta en rojo.
 */
export function Tablero({
  cliente,
  pulso,
  leidoEn,
}: {
  cliente: string
  pulso: Pulso
  /** Cuándo se consultó la base. El reloj de arriba va al segundo y hace
      creer que los números también: se recalculan cada minuto, y en una
      sala proyectada hay que poder decir si lo que se ve está fresco. */
  leidoEn: string
}) {
  const avance = pulso.totales.total
    ? Math.round((pulso.totales.completadas / pulso.totales.total) * 100)
    : 0

  const { mediana, previa } = pulso.diasResolucion
  const mejora = mediana !== null && previa !== null ? previa - mediana : null

  return (
    <div data-vidrio className="min-h-screen px-8 py-6">
      <div aria-hidden="true" className="fondo-padre" />

      <header className="flex flex-wrap items-center justify-between gap-6 pb-6">
        <div className="flex items-center gap-5">
          <Marca />
          <div className="border-l border-[var(--color-borde)] pl-5">
            <p className="rotulo">Sala de mando</p>
            <p className="text-[length:var(--text-titulo)] font-semibold">{cliente}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <p className="text-right text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Datos al <span className="cifra">{leidoEn}</span>
            <span className="block text-[length:var(--text-micro)] text-[var(--color-tinta-3)]">
              Se recalculan cada minuto
            </span>
          </p>
          <Reloj />
          <Link href="/" className="boton boton-neutro">
            Salir de la sala
          </Link>
        </div>
      </header>

      <div className="franja">
        <Cifra
          rotulo="Peticiones vivas"
          valor={pulso.totales.abiertas}
          pie="Abiertas, en proceso o en gestión"
        />
        <Cifra
          rotulo="Urgentes sin resolver"
          valor={pulso.totales.urgentes}
          pie="Requieren atención hoy"
          tono={pulso.totales.urgentes > 0 ? 'var(--color-alerta)' : 'var(--color-exito)'}
        />
        <Cifra
          rotulo="Resueltas"
          valor={`${avance}%`}
          pie={`${cifra(pulso.totales.completadas)} de ${cifra(pulso.totales.total)}`}
          tono="var(--color-exito)"
        />
        <Cifra
          rotulo="Días para resolver"
          valor={mediana !== null ? mediana.toFixed(1) : '—'}
          tono={mejora !== null && mejora > 0 ? 'var(--color-exito)' : 'var(--color-aviso)'}
          variacion={
            mediana !== null && previa !== null && previa > 0
              ? { porcentaje: ((mediana - previa) / previa) * 100, subirEsBueno: false }
              : undefined
          }
          pie={
            mejora === null
              ? 'Mediana del trimestre'
              : mejora > 0
                ? `${mejora.toFixed(1)} días menos que el trimestre anterior`
                : `${Math.abs(mejora).toFixed(1)} días más que el trimestre anterior`
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="panel px-6 py-5">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="text-[length:var(--text-titulo)] font-semibold">Demanda ciudadana</h2>
            <p className="text-[var(--color-tinta-2)]">
              <span className="cifra">{cifra(pulso.totales.hoy)}</span> hoy ·{' '}
              <span className="cifra">{cifra(pulso.totales.semana)}</span> esta semana
            </p>
          </div>
          <Tendencia datos={pulso.porMes} />
        </section>

        <section className="panel flex items-center gap-6 px-6 py-5">
          {/* El avance en anillo: a distancia, cuánto falta para cerrar
              se ve antes en un hueco que en un porcentaje escrito. */}
          <Anillo porcentaje={avance} color={ESTADO.exito} tamano={130} grosor={11}>
            <span
              className="cifra text-[2rem] leading-none"
              style={{ color: ESTADO.exito }}
            >
              {avance}%
            </span>
          </Anillo>
          <div className="min-w-0">
            <h2 className="text-[length:var(--text-titulo)] font-semibold">Avance de atención</h2>
            <p className="mt-1.5 leading-snug text-[var(--color-tinta-2)]">
              {cifra(pulso.totales.completadas)} de {cifra(pulso.totales.total)} peticiones ya
              tienen desenlace.
            </p>
            <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Faltan {cifra(pulso.totales.total - pulso.totales.completadas)} por cerrar.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        {/* Lo único que se pinta de rojo en toda la pantalla: si todo
            grita, nada grita. */}
        <section
          className="panel px-6 py-5"
          style={{ borderColor: 'var(--color-alerta)', background: 'var(--color-alerta-suave)' }}
        >
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-[length:var(--text-titulo)] font-semibold">
              Urgentes sin resolver
            </h2>
            <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Ordenadas por antigüedad
            </span>
          </div>
          {pulso.urgentes.length === 0 ? (
            <p className="py-7 text-center text-[var(--color-tinta-2)]">
              No hay peticiones urgentes pendientes.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-borde)]">
              {pulso.urgentes.map((u) => (
                <li key={u.id} className="flex items-center gap-4 py-2.5">
                  <span className="clave w-16 shrink-0">{u.folio}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {u.ciudadano ?? 'Sin ciudadano'}
                    <span className="ml-2 font-normal text-[var(--color-tinta-2)]">
                      {u.problematica}
                    </span>
                  </span>
                  <span className="hidden w-40 shrink-0 truncate text-[var(--color-tinta-2)] sm:block">
                    {u.colonia ?? '—'}
                  </span>
                  <span
                    className="cifra w-24 shrink-0 text-right"
                    style={{ color: u.dias > 14 ? 'var(--color-alerta)' : 'var(--color-aviso)' }}
                  >
                    {u.dias} {u.dias === 1 ? 'día' : 'días'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel px-6 py-5">
          <h2 className="mb-4 text-[length:var(--text-titulo)] font-semibold">Qué pide la gente</h2>
          <ul className="space-y-3">
            {pulso.porProblematica.slice(0, 7).map((p, i) => {
              const maximo = pulso.porProblematica[0]?.valor || 1
              return (
                <li key={p.etiqueta}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate">{p.etiqueta}</span>
                    <span className="cifra shrink-0">{cifra(p.valor)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-superficie-2)]">
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

      <section className="panel mt-4 px-6 py-5">
        <h2 className="mb-4 text-[length:var(--text-titulo)] font-semibold">Dónde se concentra</h2>
        <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {pulso.porColonia.map((c) => {
            const maximo = pulso.porColonia[0]?.valor || 1
            return (
              <li key={c.etiqueta} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate">{c.etiqueta}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-superficie-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-acento)]"
                    style={{ width: `${Math.max((c.valor / maximo) * 100, 3)}%` }}
                  />
                </span>
                <span className="cifra w-12 shrink-0 text-right">{c.valor}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Cifra({
  rotulo,
  valor,
  pie,
  tono = 'var(--color-tinta)',
  variacion,
}: {
  rotulo: string
  valor: number | string
  pie: string
  tono?: string
  /** Cuánto cambió contra el periodo anterior. A tres metros, una
      flecha se lee de un golpe y una frase hay que acercarse a leerla. */
  variacion?: { porcentaje: number; subirEsBueno?: boolean }
}) {
  return (
    <div>
      <p className="rotulo">{rotulo}</p>
      <p
        className="cifra mt-2 inline-flex items-baseline gap-3 text-[2.75rem] leading-none"
        style={{ color: tono }}
      >
        {typeof valor === 'number' ? cifra(valor) : valor}
        {variacion && Math.abs(variacion.porcentaje) >= 0.5 && (
          <span
            className="text-[1.125rem]"
            style={{
              color:
                variacion.porcentaje > 0 === (variacion.subirEsBueno ?? true)
                  ? 'var(--color-exito)'
                  : 'var(--color-alerta)',
            }}
          >
            {variacion.porcentaje > 0 ? '↗' : '↘'}{' '}
            {Math.abs(Math.round(variacion.porcentaje))}%
          </span>
        )}
      </p>
      <p className="mt-2 text-[var(--color-tinta-2)]">{pie}</p>
    </div>
  )
}

/** Doce meses de demanda. Una serie, un color; el eje lo da la cuadrícula. */
function Tendencia({ datos }: { datos: { etiqueta: string; valor: number }[] }) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1)
  const tope = Math.ceil(maximo / 25) * 25 || 25

  return (
    <div className="relative" style={{ height: 210 }}>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-6">
        {[1, 0.5, 0].map((l) => (
          <div key={l} className="flex items-center gap-2">
            <span className="cifra w-10 shrink-0 text-right text-[var(--text-menuda)] font-normal text-[var(--color-tinta-3)]">
              {Math.round(tope * l)}
            </span>
            <span className="h-px flex-1 bg-[var(--color-borde)]" />
          </div>
        ))}
      </div>

      <div className="relative flex h-full items-end gap-2 pl-12">
        {datos.map((d, i) => {
          const alto = (d.valor / tope) * 174
          const ultimo = i === datos.length - 1
          return (
            <div key={d.etiqueta} className="group flex flex-1 flex-col items-center justify-end">
              <span className="cifra mb-1 text-[var(--text-menuda)] text-transparent transition-colors group-hover:text-[var(--color-tinta)]">
                {d.valor}
              </span>
              <div
                className="w-full max-w-[46px] rounded-t-[4px] transition-colors"
                style={{
                  height: Math.max(alto, d.valor > 0 ? 3 : 0),
                  // El mes en curso va más claro: lleva días de menos y
                  // compararlo con los cerrados sin avisar engaña.
                  background: ultimo ? 'var(--color-acento-borde)' : 'var(--color-acento)',
                }}
              />
              <span className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
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
      <p className="cifra text-[1.5rem] leading-none">
        {ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-3)] first-letter:uppercase">
        {ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  )
}
