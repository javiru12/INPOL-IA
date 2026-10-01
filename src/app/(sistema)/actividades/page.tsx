import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  listarActividades,
  mesesConActividad,
  panoramaDelMes,
  tipoValido,
  POR_PAGINA,
} from './consultas'
import {
  delDia,
  desplazarMes,
  diaActual,
  etiquetaMes,
  mesActual,
  mesValido,
  rejillaDelMes,
} from './fechas'
import { cifra, fechaCorta } from '@/lib/formato'
import { Calendario } from './calendario'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { IconoVer } from '@/components/iconos'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Actividades' }

type Parametros = Record<string, string | string[] | undefined>

function texto(v: string | string[] | undefined) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Conserva el resto de la URL al cambiar un parámetro. */
function enlace(sp: Parametros, cambios: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(sp)) {
    const limpio = texto(valor)
    if (limpio) params.set(clave, limpio)
  }
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor) params.set(clave, valor)
    else params.delete(clave)
  }
  const cadena = params.toString()
  return cadena ? `/actividades?${cadena}` : '/actividades'
}

/**
 * Mes a mostrar: el de la URL si es válido; si no, el mes en curso, y si
 * ese está vacío, el mes con actividad más reciente ya transcurrido. Abrir
 * el calendario en un mes en blanco no le sirve a nadie.
 */
function resolverMes(pedido: string | undefined, meses: string[]) {
  if (pedido) return pedido
  const actual = mesActual()
  if (meses.length === 0 || meses.includes(actual)) return actual
  return meses.find((m) => m < actual) ?? meses[0]
}

export default async function Actividades({
  searchParams,
}: {
  searchParams: Promise<Parametros>
}) {
  await exigirAcceso('/actividades')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const vista = texto(sp.vista) === 'lista' ? 'lista' : 'calendario'
  const tipo = tipoValido(texto(sp.tipo))
  const mesPedido = mesValido(texto(sp.mes))

  const meses = await mesesConActividad(tenant.id)
  const mes = resolverMes(mesPedido, meses)
  const hoy = diaActual()

  const celdas = rejillaDelMes(mes)
  const { resumen, actividades } = await panoramaDelMes(
    tenant.id,
    mes,
    { desde: celdas[0].iso, hasta: celdas[celdas.length - 1].iso },
    hoy,
  )

  const lista =
    vista === 'lista'
      ? await listarActividades(tenant.id, {
          tipo,
          mes: mesPedido,
          pagina: Number(texto(sp.pagina) ?? 1) || 1,
        })
      : null

  const asistentes = `${cifra(resumen.reales)} de ${cifra(resumen.programados)}`

  return (
    <Pagina
      titulo="Actividades"
      descripcion="Recorridos y eventos de campaña, su logística y las peticiones que levantan"
      acciones={
        <div className="flex items-center gap-1.5">
          <Link
            href={enlace(sp, { vista: undefined, pagina: undefined })}
            className={`boton !h-8 ${vista === 'calendario' ? 'boton-primario' : 'boton-neutro'}`}
          >
            Calendario
          </Link>
          <Link
            href={enlace(sp, { vista: 'lista', mes: mesPedido ?? mes })}
            className={`boton !h-8 ${vista === 'lista' ? 'boton-primario' : 'boton-neutro'}`}
          >
            Lista
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta="Actividades del mes"
          valor={resumen.total}
          pie={etiquetaMes(mes)}
        />
        <Indicador
          etiqueta="Recorridos realizados"
          valor={resumen.recorridos}
          tono="dato"
          pie="Con fecha ya transcurrida"
        />
        <Indicador
          etiqueta="Eventos realizados"
          valor={resumen.eventos}
          tono="dato"
          pie="Con fecha ya transcurrida"
        />
        <Indicador
          etiqueta="Asistentes acumulados"
          valor={asistentes}
          tono={resumen.programados > 0 && resumen.reales >= resumen.programados ? 'exito' : 'neutro'}
          pie="Reales contra programados"
        />
      </div>

      <div className="mt-3">
        {vista === 'calendario' ? (
          <Calendario
            mes={mes}
            hoy={hoy}
            actividades={actividades}
            mesAnterior={enlace(sp, { mes: desplazarMes(mes, -1), pagina: undefined })}
            mesSiguiente={enlace(sp, { mes: desplazarMes(mes, 1), pagina: undefined })}
          />
        ) : (
          <>
            <Filtros
              selectores={[
                {
                  nombre: 'tipo',
                  etiqueta: 'Actividad',
                  opciones: [
                    { valor: 'recorrido', etiqueta: 'Recorridos' },
                    { valor: 'evento', etiqueta: 'Eventos' },
                  ],
                },
                {
                  nombre: 'mes',
                  etiqueta: 'Fecha',
                  opciones: meses.map((m) => ({ valor: m, etiqueta: etiquetaMes(m) })),
                },
              ]}
            />

            {lista && lista.total > 0 ? (
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Título</th>
                        <th className="num">Fecha</th>
                        <th>Colonia</th>
                        <th className="num">Programados</th>
                        <th className="num">Reales</th>
                        <th>Responsable</th>
                        <th aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.filas.map((a) => (
                        <tr key={`${a.tipo}-${a.id}`}>
                          <td>
                            <Distintivo tono={a.tipo === 'recorrido' ? 'acento' : 'dato'}>
                              {a.tipo === 'recorrido' ? 'Recorrido' : 'Evento'}
                            </Distintivo>
                          </td>
                          <td className="max-w-[24rem]">
                            <span className="block truncate font-medium" title={a.titulo}>
                              {a.titulo}
                            </span>
                          </td>
                          <td className="num clave whitespace-nowrap">
                            {fechaCorta(delDia(a.fecha))}
                          </td>
                          <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                            {a.colonia ?? '—'}
                          </td>
                          <td className="num">{cifra(a.programados)}</td>
                          <td className="num">{cifra(a.reales)}</td>
                          <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                            {a.responsable ?? '—'}
                          </td>
                          <td className="w-10">
                            <Link
                              href={`/actividades/${a.tipo}/${a.id}`}
                              className="boton boton-llano !h-7 !w-7 !p-0"
                              aria-label={`Ver ${a.titulo}`}
                            >
                              <IconoVer />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginador
                  pagina={lista.pagina}
                  porPagina={POR_PAGINA}
                  total={lista.total}
                />
              </div>
            ) : (
              <Vacio
                titulo="Ninguna actividad coincide"
                descripcion="Prueba con otro mes o quita el filtro de tipo para ver recorridos y eventos juntos."
              />
            )}
          </>
        )}
      </div>
    </Pagina>
  )
}
