'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { guardarActividad, type EstadoAccion } from './acciones'

export type DatosActividad = {
  id: string
  tipo: 'evento' | 'recorrido'
  titulo: string | null
  descripcion: string | null
  fecha: string | null
  hora_inicia: string | null
  hora_termina: string | null
  lugar: string | null
  colonia: string | null
  municipio_id: string | null
  seccion_clave: string | null
  responsable_id: string | null
  asistentes_programados: number | null
  notas: string | null
}

export function FormaActividad({
  municipios,
  responsables,
  actividad,
}: {
  municipios: { id: string; nombre: string }[]
  responsables: { id: string; nombre: string }[]
  actividad?: DatosActividad
}) {
  const esEdicion = Boolean(actividad)
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarActividad, {})
  const [tipo, setTipo] = useState<'evento' | 'recorrido'>(actividad?.tipo ?? 'evento')
  const router = useRouter()

  useEffect(() => {
    if (estado.ok && estado.id && estado.tipo) {
      router.push(`/actividades/${estado.tipo}/${estado.id}`)
    }
  }, [estado.ok, estado.id, estado.tipo, router])

  const v = actividad

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {v && <input type="hidden" name="id" value={v.id} />}

      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">Qué es</h2>

        {/* El tipo decide a qué tabla va; en una edición no se cambia,
            porque sería mover la fila de tabla y perder su historial.

            Un `fieldset` deshabilitado NO envía sus campos, así que al
            editar el tipo viaja aparte en un campo oculto: sin él, el
            formulario se guardaba sin tipo y la edición fallaba. */}
        {esEdicion && <input type="hidden" name="tipo" value={tipo} />}
        <fieldset disabled={esEdicion} className="mb-3">
          <legend className="mb-1.5 text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Tipo de actividad
          </legend>
          <div className="flex gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5">
            {(['evento', 'recorrido'] as const).map((t) => (
              <label key={t} className="flex-1">
                <input
                  type="radio"
                  name="tipo"
                  value={t}
                  checked={tipo === t}
                  onChange={() => setTipo(t)}
                  className="sr-only"
                />
                <span
                  className={`boton !h-7 w-full justify-center text-[var(--text-menuda)] ${
                    tipo === t ? 'boton-primario' : 'boton-llano'
                  }`}
                  style={esEdicion ? { opacity: tipo === t ? 1 : 0.4 } : undefined}
                >
                  {t === 'evento' ? 'Evento' : 'Recorrido'}
                </span>
              </label>
            ))}
          </div>
          {esEdicion && (
            <p className="mt-1.5 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              El tipo no se puede cambiar una vez creada.
            </p>
          )}
        </fieldset>

        <Campo nombre="titulo" etiqueta="Título" requerido valor={v?.titulo} />
        <div className="mt-3">
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Descripción
            </span>
            <textarea
              name="descripcion"
              rows={3}
              defaultValue={v?.descripcion ?? ''}
              className="campo !h-auto py-2"
            />
          </label>
        </div>
      </section>

      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">Cuándo</h2>
        <Campo nombre="fecha" etiqueta="Fecha" tipo="date" requerido valor={v?.fecha} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo nombre="horaInicia" etiqueta="Hora de inicio" tipo="time" valor={v?.hora_inicia} />
          <Campo nombre="horaTermina" etiqueta="Hora de término" tipo="time" valor={v?.hora_termina} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Responsable
            </span>
            <select name="responsableId" defaultValue={v?.responsable_id ?? ''} className="campo">
              <option value="">Sin asignar</option>
              {responsables.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo
            nombre="asistentesProgramados"
            etiqueta="Asistentes esperados"
            tipo="number"
            valor={v?.asistentes_programados?.toString()}
          />
        </div>
      </section>

      <section className="panel px-4 py-4 lg:col-span-2">
        <h2 className="mb-1 text-[var(--text-base)] font-semibold">Dónde</h2>
        <p className="mb-4 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          La sección electoral liga la actividad con el territorio: sin ella no cuenta en los
          análisis por distrito.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            nombre="lugar"
            etiqueta={tipo === 'evento' ? 'Lugar' : 'Punto de salida'}
            valor={v?.lugar}
          />
          <Campo nombre="colonia" etiqueta="Colonia" valor={v?.colonia} />
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Municipio
            </span>
            <select name="municipioId" defaultValue={v?.municipio_id ?? ''} className="campo">
              <option value="">Sin especificar</option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo
            nombre="seccionClave"
            etiqueta="Sección electoral"
            valor={v?.seccion_clave}
            ayuda="Cuatro dígitos"
          />
        </div>
        <div className="mt-3">
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Notas de logística
            </span>
            <textarea
              name="notas"
              rows={2}
              defaultValue={v?.notas ?? ''}
              className="campo !h-auto py-2"
            />
          </label>
        </div>
      </section>

      {estado.error && (
        <p
          className="lg:col-span-2 rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
          style={{ background: 'var(--color-alerta-suave)', color: 'var(--color-alerta)' }}
          role="alert"
        >
          {estado.error}
        </p>
      )}

      <div className="flex items-center gap-2 lg:col-span-2">
        <Guardar esEdicion={esEdicion} />
        <Link
          href={v ? `/actividades/${v.tipo}/${v.id}` : '/actividades'}
          className="boton boton-neutro"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}

function Guardar({ esEdicion }: { esEdicion: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton boton-primario">
      {pending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear actividad'}
    </button>
  )
}

function Campo({
  nombre,
  etiqueta,
  tipo = 'text',
  requerido,
  valor,
  ayuda,
}: {
  nombre: string
  etiqueta: string
  tipo?: string
  requerido?: boolean
  valor?: string | null
  ayuda?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta} {requerido && <span style={{ color: 'var(--color-alerta)' }}>*</span>}
      </span>
      <input
        type={tipo}
        name={nombre}
        required={requerido}
        defaultValue={valor ?? ''}
        className="campo"
      />
      {ayuda && (
        <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {ayuda}
        </span>
      )}
    </label>
  )
}
