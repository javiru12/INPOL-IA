'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { crearCiudadano, editarCiudadano, type EstadoAccion } from './acciones'
import { CampoFecha } from '@/components/campos-fecha'

export type DatosCiudadano = {
  id: string
  nombre: string | null
  apellido_paterno: string | null
  apellido_materno: string | null
  sexo: string | null
  fecha_nacimiento: string | null
  telefono_movil: string | null
  telefono_fijo: string | null
  correo: string | null
  calle: string | null
  numero_ext: string | null
  numero_int: string | null
  colonia: string | null
  codigo_postal: string | null
  municipio_id: string | null
  seccion_clave: string | null
  curp: string | null
  discapacidad: boolean
  tipo_discapacidad: string | null
  adulto_mayor: boolean
}

export function FormaCiudadano({
  municipios,
  ciudadano,
}: {
  municipios: { id: string; nombre: string }[]
  /** Sin esto es un alta; con esto, una edición. */
  ciudadano?: DatosCiudadano
}) {
  const esEdicion = Boolean(ciudadano)
  const [estado, accion] = useActionState<EstadoAccion, FormData>(
    esEdicion ? editarCiudadano : crearCiudadano,
    {},
  )
  const router = useRouter()

  // Al guardar se va a la ficha: quien acaba de capturar quiere ver el
  // resultado, no quedarse en el formulario sin saber si pasó algo.
  useEffect(() => {
    if (estado.ok && estado.id) router.push(`/ciudadanos/${estado.id}`)
  }, [estado.ok, estado.id, router])

  const v = ciudadano

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {v && <input type="hidden" name="id" value={v.id} />}

      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">Quién es</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo nombre="nombre" etiqueta="Nombre(s)" requerido valor={v?.nombre} />
          <Campo nombre="apellidoPaterno" etiqueta="Apellido paterno" valor={v?.apellido_paterno} />
          <Campo nombre="apellidoMaterno" etiqueta="Apellido materno" valor={v?.apellido_materno} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Sexo
            </span>
            <select name="sexo" defaultValue={v?.sexo ?? ''} className="campo">
              <option value="">Sin especificar</option>
              <option value="H">Hombre</option>
              <option value="M">Mujer</option>
            </select>
          </label>
          <CampoFecha
            nombre="fechaNacimiento"
            etiqueta="Fecha de nacimiento"
            valor={v?.fecha_nacimiento}
          />
        </div>
        <div className="mt-3">
          {/* La CURP es la llave contra los padrones externos: sin ella
              la ficha no se puede cruzar con nada. */}
          <Campo
            nombre="curp"
            etiqueta="CURP"
            valor={v?.curp}
            ayuda="18 caracteres, como viene en la credencial de elector"
          />
        </div>
      </section>

      <section className="panel px-4 py-4">
        <h2 className="mb-1 text-[var(--text-base)] font-semibold">Atención prioritaria</h2>
        <p className="mb-4 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Marca lo que cambie cómo hay que atender a esta persona.
        </p>
        <div className="space-y-2.5">
          {/* «Adulto mayor» no se captura: sale de la fecha de
              nacimiento. Pedirlo a mano crearía dos verdades sobre lo
              mismo y tarde o temprano dejarían de coincidir. */}
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Adulto mayor:{' '}
            <strong className="font-medium text-[var(--color-tinta)]">
              {v?.adulto_mayor ? 'sí, por su edad' : 'no'}
            </strong>
            <span className="ml-1 text-[var(--color-tinta-3)]">
              · se deduce de la fecha de nacimiento
            </span>
          </p>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="discapacidad"
              value="si"
              defaultChecked={v?.discapacidad ?? false}
              className="cursor-pointer"
            />
            <span className="text-[var(--text-menuda)]">Vive con alguna discapacidad</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Tipo de discapacidad
            </span>
            <select
              name="tipoDiscapacidad"
              defaultValue={v?.tipo_discapacidad ?? ''}
              className="campo"
            >
              <option value="">Sin especificar</option>
              <option value="motriz">Motriz</option>
              <option value="visual">Visual</option>
              <option value="auditiva">Auditiva</option>
              <option value="intelectual">Intelectual</option>
              <option value="psicosocial">Psicosocial</option>
              <option value="multiple">Múltiple</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">Cómo contactarlo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo nombre="telefonoMovil" etiqueta="Celular" valor={v?.telefono_movil} />
          <Campo nombre="telefonoFijo" etiqueta="Teléfono fijo" valor={v?.telefono_fijo} />
        </div>
        <div className="mt-3">
          <Campo nombre="correo" etiqueta="Correo" tipo="email" valor={v?.correo} />
        </div>
      </section>

      <section className="panel px-4 py-4 lg:col-span-2">
        <h2 className="mb-1 text-[var(--text-base)] font-semibold">Dónde vive</h2>
        <p className="mb-4 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          La sección electoral es lo que liga a esta persona con el territorio: sin ella no
          aparece en los análisis por distrito.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo nombre="calle" etiqueta="Calle" valor={v?.calle} />
          <Campo nombre="numeroExt" etiqueta="Número exterior" valor={v?.numero_ext} />
          <Campo nombre="numeroInt" etiqueta="Número interior" valor={v?.numero_int} />
          <Campo nombre="codigoPostal" etiqueta="Código postal" valor={v?.codigo_postal} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
            ayuda="Cuatro dígitos, por ejemplo 1548"
          />
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
          href={v ? `/ciudadanos/${v.id}` : '/ciudadanos'}
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
      {pending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Dar de alta'}
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
