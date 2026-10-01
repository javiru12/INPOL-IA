import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { obtenerCiudadano, etiquetaSexo } from '../consultas'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { fechaLarga, fechaCorta, cifra } from '@/lib/formato'

export const metadata: Metadata = { title: 'Ficha ciudadana' }

const TONO: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

/** Par etiqueta/valor de la ficha. Lo que falta se dice con un guion. */
function Dato({
  etiqueta,
  valor,
  mono,
  ancho,
}: {
  etiqueta: string
  valor?: string | number | null
  mono?: boolean
  ancho?: boolean
}) {
  const texto = valor === null || valor === undefined || valor === '' ? null : String(valor)
  return (
    <div className={ancho ? 'col-span-2' : undefined}>
      <p className="rotulo">{etiqueta}</p>
      {texto === null ? (
        <p className="mt-0.5 text-[var(--color-tinta-3)]">—</p>
      ) : (
        <p className={mono ? 'clave mt-0.5 block' : 'mt-0.5'}>{texto}</p>
      )}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-[var(--color-borde)] pt-4">
      <h3 className="mb-3 text-[var(--text-menuda)] font-semibold text-[var(--color-tinta-2)]">
        {titulo}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</div>
    </div>
  )
}

export default async function FichaCiudadano({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const { id } = await params
  const datos = await obtenerCiudadano(tenant.id, id)
  if (!datos) notFound()

  const { ciudadano: c, peticiones } = datos

  // Calle y números viven en columnas separadas; `direccion` es el campo
  // libre del padrón viejo y solo se usa cuando no hay nada desglosado.
  const domicilio =
    [c.calle, c.numero_ext && `#${c.numero_ext}`, c.numero_int && `Int. ${c.numero_int}`]
      .filter(Boolean)
      .join(' ') || c.direccion

  // Cuántas peticiones, dicho de forma legible en el subtítulo.
  const conteo =
    peticiones.length === 0
      ? 'Sin peticiones levantadas'
      : peticiones.length === 1
        ? '1 petición levantada'
        : `${cifra(peticiones.length)} peticiones levantadas`

  const contexto = [c.colonia, c.seccion && `Sección ${c.seccion}`, conteo].filter(Boolean)

  return (
    <Pagina
      titulo={c.nombre ?? 'Ciudadano sin nombre'}
      descripcion={contexto.join(' · ')}
      acciones={
        <Link href="/ciudadanos" className="boton boton-neutro">
          Volver al listado
        </Link>
      }
    >
      <div className="grid items-start gap-3 lg:grid-cols-[21rem_1fr]">
        <section className="panel px-4 py-3.5">
          <h2 className="mb-3 text-[var(--text-base)] font-semibold">Datos personales</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Dato etiqueta="Nombre" valor={c.nombre} ancho />
            <Dato etiqueta="Edad" valor={c.edad === null ? null : `${cifra(c.edad)} años`} />
            <Dato etiqueta="Sexo" valor={etiquetaSexo(c.sexo)} />
            <Dato
              etiqueta="Fecha de nacimiento"
              valor={c.fecha_nacimiento && fechaLarga(c.fecha_nacimiento)}
              ancho
            />
          </div>

          <Bloque titulo="Contacto">
            <Dato etiqueta="Teléfono móvil" valor={c.telefono_movil} mono />
            <Dato etiqueta="Teléfono fijo" valor={c.telefono_fijo} mono />
            <Dato etiqueta="Correo" valor={c.correo} ancho />
          </Bloque>

          <Bloque titulo="Domicilio">
            <Dato etiqueta="Calle y número" valor={domicilio} ancho />
            <Dato etiqueta="Colonia" valor={c.colonia} />
            <Dato etiqueta="Código postal" valor={c.codigo_postal} mono />
            <Dato etiqueta="Municipio" valor={c.municipio} />
            <Dato etiqueta="Sección electoral" valor={c.seccion} mono />
          </Bloque>
        </section>

        {peticiones.length === 0 ? (
          <Vacio
            titulo="Sin peticiones en el historial"
            descripcion="Esta persona está en el padrón, pero todavía no ha levantado ninguna solicitud. En cuanto lo haga, aquí quedará el seguimiento completo."
          />
        ) : (
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-borde)] px-4 py-3">
              <h2 className="text-[var(--text-base)] font-semibold">Historial de peticiones</h2>
              <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                De la más reciente a la más antigua
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Problemática</th>
                    <th>Descripción</th>
                    <th>Estatus</th>
                    <th className="num">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {peticiones.map((p) => (
                    <tr key={p.id}>
                      <td className="clave">{p.folio}</td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {p.problematica ?? '—'}
                      </td>
                      <td className="max-w-[34rem]">
                        <span className="block truncate" title={p.descripcion ?? undefined}>
                          {p.descripcion ?? '—'}
                        </span>
                      </td>
                      <td>
                        <Distintivo tono={TONO[p.estatus ?? ''] ?? 'neutro'}>
                          {p.estatus ?? 'Sin estatus'}
                        </Distintivo>
                      </td>
                      <td className="num clave whitespace-nowrap">{fechaCorta(p.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Pagina>
  )
}
