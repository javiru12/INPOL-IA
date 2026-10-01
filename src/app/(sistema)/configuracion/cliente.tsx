'use client'

import { useActionState } from 'react'
import { guardarCliente, type EstadoAccion } from './acciones'
import { Campo, CampoColor, Aviso, Enviar } from './piezas'

/**
 * Datos del contrato: cómo se llama el cliente, con qué color se pinta y
 * hasta cuándo tiene licencia.
 *
 * La clave no está: es el subdominio por el que entra la gente y la llave
 * con la que se resuelve el tenant en cada petición. Cambiarla desde aquí
 * dejaría a todo el cliente sin forma de entrar.
 */
export function FormaCliente({
  clave,
  nombre,
  nombreCorto,
  colorAcento,
  licenciaInicia,
  licenciaVence,
  puedeEditar,
}: {
  clave: string
  nombre: string
  nombreCorto: string | null
  colorAcento: string | null
  licenciaInicia: string | null
  licenciaVence: string | null
  puedeEditar: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarCliente, {})

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-[1fr_20rem] lg:items-start">
      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">Identidad</h2>

        <Campo
          nombre="nombre"
          etiqueta="Nombre del cliente"
          valor={nombre}
          requerido
          ayuda="Como aparece en el acceso y en los informes impresos."
        />
        <Campo
          nombre="nombreCorto"
          etiqueta="Nombre corto"
          valor={nombreCorto}
          ayuda="El que cabe en la barra lateral y en los encabezados."
        />
        <CampoColor nombre="colorAcento" etiqueta="Color de acento" valor={colorAcento} />

        <Aviso estado={estado} exito="Datos del cliente guardados" />

        {puedeEditar ? (
          <Enviar etiqueta="Guardar datos del cliente" accion="cliente-guardar" />
        ) : (
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Tu perfil puede consultar estos datos, pero no modificarlos.
          </p>
        )}
      </section>

      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">Licencia</h2>

        <Campo
          nombre="licenciaInicia"
          etiqueta="Inicia"
          tipo="date"
          valor={licenciaInicia}
        />
        <Campo nombre="licenciaVence" etiqueta="Vence" tipo="date" valor={licenciaVence} />

        <div className="border-t border-[var(--color-borde)] pt-3">
          <p className="rotulo">Clave de acceso</p>
          <p className="clave mt-1 !text-[var(--text-base)]">{clave}</p>
          <p className="mt-1.5 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            Es el subdominio por el que entra tu gente. No se cambia desde aquí:
            hacerlo dejaría el sistema inalcanzable.
          </p>
        </div>
      </section>
    </form>
  )
}
