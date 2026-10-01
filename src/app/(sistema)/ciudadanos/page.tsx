import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { listarCiudadanos, etiquetaSexo, POR_PAGINA } from './consultas'
import { Pagina, Indicador, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { IconoVer } from '@/components/iconos'
import { cifra, porcentaje } from '@/lib/formato'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Ciudadanos' }

const SEXOS = [
  { valor: 'mujer', etiqueta: 'Mujeres' },
  { valor: 'hombre', etiqueta: 'Hombres' },
]

const EDADES = [
  { valor: '18-29', etiqueta: '18 a 29 años' },
  { valor: '30-44', etiqueta: '30 a 44 años' },
  { valor: '45-59', etiqueta: '45 a 59 años' },
  { valor: '60+', etiqueta: '60 años o más' },
]

const PETICIONES = [
  { valor: 'con', etiqueta: 'Con peticiones' },
  { valor: 'sin', etiqueta: 'Sin peticiones' },
]

export default async function Ciudadanos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/ciudadanos')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const r = await listarCiudadanos(tenant.id, {
    q: texto(sp.q),
    colonia: texto(sp.colonia),
    sexo: texto(sp.sexo),
    edad: texto(sp.edad),
    peticiones: texto(sp.peticiones),
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  })

  return (
    <Pagina
      titulo="Ciudadanos"
      descripcion="Padrón de personas registradas por la estructura de campaña"
    >
      <Filtros
        busqueda={{ nombre: 'q', marcador: 'Buscar por nombre, colonia o teléfono…' }}
        selectores={[
          { nombre: 'colonia', etiqueta: 'Colonia', opciones: r.colonias },
          { nombre: 'sexo', etiqueta: 'Sexo', opciones: SEXOS },
          { nombre: 'edad', etiqueta: 'Edad', opciones: EDADES },
          { nombre: 'peticiones', etiqueta: 'Peticiones', opciones: PETICIONES },
        ]}
      />

      {r.total === 0 ? (
        <Vacio
          titulo="Ninguna persona coincide"
          descripcion="Prueba quitando algún filtro o buscando con otras palabras."
        />
      ) : (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              etiqueta="Ciudadanos"
              valor={r.resumen.total}
              pie="Registros que coinciden con el filtro"
            />
            <Indicador
              etiqueta="Con peticiones"
              valor={r.resumen.conPeticiones}
              tono="dato"
              pie={`${porcentaje(r.resumen.conPeticiones, r.resumen.total)} del listado`}
            />
            <Indicador
              etiqueta="Mujeres"
              valor={r.resumen.mujeres}
              pie={`${porcentaje(r.resumen.mujeres, r.resumen.total)} del listado`}
            />
            <Indicador
              etiqueta="Hombres"
              valor={r.resumen.hombres}
              pie={`${porcentaje(r.resumen.hombres, r.resumen.total)} del listado`}
            />
          </div>

          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="num">Edad</th>
                    <th>Sexo</th>
                    <th>Colonia</th>
                    <th>Sección</th>
                    <th>Móvil</th>
                    <th className="num">Peticiones</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {r.filas.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap font-medium">{c.nombre ?? '—'}</td>
                      <td className="num">
                        {cifra(c.edad)}
                      </td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {etiquetaSexo(c.sexo)}
                      </td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {c.colonia ?? '—'}
                      </td>
                      <td className="clave">{c.seccion ?? '—'}</td>
                      <td className="clave whitespace-nowrap">{c.telefono_movil ?? '—'}</td>
                      <td className="num">
                        {c.peticiones > 0 ? (
                          cifra(c.peticiones)
                        ) : (
                          <span className="text-[var(--color-tinta-3)]">—</span>
                        )}
                      </td>
                      <td className="w-10">
                        <Link
                          href={`/ciudadanos/${c.id}`}
                          className="boton boton-llano !h-7 !w-7 !p-0"
                          aria-label={`Ver ficha de ${c.nombre ?? 'la persona'}`}
                        >
                          <IconoVer />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginador pagina={r.pagina} porPagina={POR_PAGINA} total={r.total} />
          </div>
        </>
      )}
    </Pagina>
  )
}
