import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { puede } from '@/lib/permisos'
import { Pagina, Vacio } from '@/components/pagina'
import { Conversacion } from './conversacion'

export const metadata: Metadata = { title: 'Asistente' }

/** Una pregunta puede encadenar varias consultas; tarda más que una pantalla normal. */
export const maxDuration = 120

export default async function Asistente() {
  await exigirAcceso('/asistente')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  if (!(await puede('asistente.consultar'))) {
    return (
      <Pagina titulo="Asistente" descripcion="Preguntarle al sistema sobre tus datos">
        <Vacio
          titulo="Tu perfil no tiene acceso al asistente"
          descripcion="El asistente cruza cualquier dato con cualquier otro, así que es un permiso aparte. Pídeselo a un administrador."
        />
      </Pagina>
    )
  }

  return (
    <Pagina
      titulo="Asistente"
      descripcion={`Pregunta en español sobre los datos de ${tenant.nombre_corto ?? tenant.nombre}`}
    >
      <Conversacion />
    </Pagina>
  )
}
