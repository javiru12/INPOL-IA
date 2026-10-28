'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { analizarArchivo, importar, type Analisis, type Resultado } from './acciones'
import { DESTINOS, destinoPorClave } from './destinos'
import { Tabla } from '@/components/tabla'

/**
 * Subir un archivo y decir a dónde va.
 *
 * Son dos pasos a propósito. Cargar a ciegas y enterarse después de que
 * la columna «teléfono» era la del patrón y no la de la persona
 * significa deshacer a mano miles de filas. Primero se enseña qué
 * entendió el sistema y con qué se va a quedar; solo entonces se carga.
 *
 * El archivo no se guarda entre un paso y otro: se manda otra vez al
 * confirmar. El navegador ya lo tiene y así no queda un archivo con
 * datos personales esperando en el servidor a que alguien decida.
 */
export function FormaImportar() {
  const [destino, setDestino] = useState('')
  const [analisis, analizar] = useActionState<Analisis, FormData>(analizarArchivo, {})
  const [resultado, cargar] = useActionState<Resultado, FormData>(importar, {})
  const archivo = useRef<HTMLInputElement>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')

  const d = destinoPorClave(destino)
  const listo = Boolean(analisis.encabezados && d)

  return (
    <div className="space-y-3">
      {/* ---- Paso 1: qué es y qué archivo ---- */}
      <form action={analizar} className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">1 · Qué traes</h2>

        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Tipo de datos
          </span>
          <select
            name="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="campo"
            required
          >
            <option value="">Elige qué trae el archivo…</option>
            {DESTINOS.map((x) => (
              <option key={x.clave} value={x.clave}>
                {x.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {d && (
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {d.descripcion}
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Archivo
          </span>
          <input
            ref={archivo}
            type="file"
            name="archivo"
            accept=".xlsx,.csv,.txt"
            required
            onChange={(e) => setNombreArchivo(e.target.files?.[0]?.name ?? '')}
            className="campo !h-auto py-1.5 text-[var(--text-menuda)]"
          />
          <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Excel (.xlsx) o CSV, hasta 15 MB. La primera fila son los encabezados.
          </span>
        </label>

        <Boton etiqueta="Revisar el archivo" pendiente="Leyendo…" />

        {analisis.error && (
          <p className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
            {analisis.error}
          </p>
        )}
      </form>

      {/* ---- Paso 2: mapeo y confirmación ---- */}
      {listo && !resultado.ok && (
        <form action={cargar} className="panel space-y-3 px-4 py-4">
          <input type="hidden" name="destino" value={destino} />

          <div>
            <h2 className="text-[var(--text-base)] font-semibold">2 · Qué entendí</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {analisis.totalFilas?.toLocaleString('es-MX')} filas en {nombreArchivo}. Revisa que
              cada campo tome la columna correcta.
            </p>
          </div>

          {analisis.avisos?.map((a) => (
            <p
              key={a}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
              style={{ background: 'var(--color-aviso-suave)', color: 'var(--color-aviso)' }}
            >
              {a}
            </p>
          ))}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d!.campos.map((c) => (
              <label key={c.clave} className="block">
                <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                  {c.etiqueta}{' '}
                  {c.requerido && <span style={{ color: 'var(--color-alerta)' }}>*</span>}
                </span>
                <select
                  name={`col_${c.clave}`}
                  defaultValue={analisis.mapeo?.[c.clave] ?? ''}
                  className="campo"
                >
                  <option value="">— no viene en el archivo —</option>
                  {analisis.encabezados!.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <details className="rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
            <summary className="cursor-pointer px-3 py-2 text-[var(--text-menuda)] font-medium">
              Ver las primeras filas del archivo
            </summary>
            <Tabla>
              <thead>
                <tr>
                  {analisis.encabezados!.map((h, i) => (
                    <th key={`${h}-${i}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analisis.muestra!.map((f, i) => (
                  <tr key={i}>
                    {analisis.encabezados!.map((_, j) => (
                      <td key={j} className="whitespace-nowrap">
                        {f[j] || <span className="text-[var(--color-tinta-3)]">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </details>

          <h2 className="pt-1 text-[var(--text-base)] font-semibold">3 · De dónde salió</h2>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Fuente <span style={{ color: 'var(--color-alerta)' }}>*</span>
            </span>
            <input
              name="fuente"
              required
              placeholder="Padrón de la Secretaría de…, corte de octubre 2026"
              className="campo"
            />
            <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Queda guardado en cada fila. Un dato sin procedencia no se puede explicar después.
            </span>
          </label>

          {d!.personal && (
            <label className="block">
              <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                Con qué autorización <span style={{ color: 'var(--color-alerta)' }}>*</span>
              </span>
              <input
                name="baseLegal"
                required
                placeholder="Convenio SG/2026/014, cláusula tercera"
                className="campo"
              />
              <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                Este archivo trae datos de personas. Escribe el convenio, acuerdo o facultad
                legal que ampara su tratamiento: queda en la bitácora con tu nombre.
              </span>
            </label>
          )}

          {/* El archivo se manda otra vez porque entre un paso y el otro
              no se guardó nada en el servidor. */}
          <input
            type="file"
            name="archivo"
            accept=".xlsx,.csv,.txt"
            required
            className="campo !h-auto py-1.5 text-[var(--text-menuda)]"
            aria-label="Vuelve a elegir el mismo archivo para confirmar"
          />
          <span className="-mt-2 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Vuelve a elegir el mismo archivo para confirmar la carga.
          </span>

          <Boton etiqueta="Cargar los datos" pendiente="Cargando…" primario />

          {resultado.error && (
            <p className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
              {resultado.error}
            </p>
          )}
        </form>
      )}

      {/* ---- Resultado ---- */}
      {resultado.ok && (
        <section
          className="panel space-y-2 px-4 py-4"
          style={{ borderColor: 'var(--color-exito)' }}
        >
          <h2 className="text-[var(--text-base)] font-semibold" style={{ color: 'var(--color-exito)' }}>
            Se cargaron {resultado.cargadas?.toLocaleString('es-MX')} filas
          </h2>
          {resultado.rechazadas ? (
            <>
              <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                {resultado.rechazadas.toLocaleString('es-MX')} se quedaron fuera:
              </p>
              <ul className="space-y-0.5">
                {resultado.motivos?.map((m) => (
                  <li key={m.motivo} className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                    · {m.motivo}: {m.cuantas.toLocaleString('es-MX')}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              Ninguna fila se rechazó.
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="boton boton-neutro"
          >
            Cargar otro archivo
          </button>
        </section>
      )}
    </div>
  )
}

function Boton({
  etiqueta,
  pendiente,
  primario,
}: {
  etiqueta: string
  pendiente: string
  primario?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`boton ${primario ? 'boton-primario' : 'boton-neutro'}`}
    >
      {pending ? pendiente : etiqueta}
    </button>
  )
}
