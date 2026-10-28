import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { listarPeticiones, POR_PAGINA } from './consultas'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { Filtros, Paginador } from '@/components/filtros'
import { SeleccionEnLote } from './seleccion'
import { FilaAbrible } from '@/components/fila-abrible'
import { IconoVer } from '@/components/iconos'
import { fechaCorta } from '@/lib/formato'
import { exigirAcceso } from '@/lib/acceso'
import { puede } from '@/lib/permisos'
import { esRango } from '@/lib/edades'
import { Tabla } from '@/components/tabla'

export const metadata: Metadata = { title: 'Peticiones' }

const TONO: Record<string, 'exito' | 'aviso' | 'alerta' | 'dato' | 'neutro'> = {
  Completada: 'exito',
  'En proceso': 'dato',
  'En gestión': 'dato',
  Abierta: 'aviso',
  'No interpretada': 'alerta',
  Cancelada: 'neutro',
}

export default async function Peticiones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/peticiones')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const r = await listarPeticiones(tenant.id, {
    q: texto(sp.q),
    estatus: texto(sp.estatus),
    problematica: texto(sp.problematica),
    prioridad: texto(sp.prioridad),
    pendientes: texto(sp.pendientes) === 'si',
    mes: texto(sp.mes),
    municipio: texto(sp.municipio),
    edad: texto(sp.edad),
    pagina: Number(texto(sp.pagina) ?? 1) || 1,
  }, tenant.estado_clave)

  const puedeExportar = await puede('exportacion.peticiones')

  // Recortes que no viven en los selectores pero sí acotan la lista.
  const conSp = (quitar: string) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === 'string' && v.trim() && k !== quitar && k !== 'pagina') q.set(k, v)
    }
    const t = q.toString()
    return t ? `/peticiones?${t}` : '/peticiones'
  }

  const MES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const nombreDeMes = (m: string) => {
    const [a, n] = m.split('-')
    const i = Number(n) - 1
    return MES[i] ? `${MES[i]} de ${a}` : m
  }

  const recortes = [
    texto(sp.pendientes) === 'si'
      ? { llave: 'pendientes', texto: 'sin resolver', sinEste: conSp('pendientes') }
      : null,
    texto(sp.mes)
      ? { llave: 'mes', texto: nombreDeMes(texto(sp.mes)!), sinEste: conSp('mes') }
      : null,
    texto(sp.municipio)
      ? { llave: 'municipio', texto: texto(sp.municipio)!, sinEste: conSp('municipio') }
      : null,
    esRango(texto(sp.edad))
      ? { llave: 'edad', texto: `${texto(sp.edad)} años`, sinEste: conSp('edad') }
      : null,
  ].filter((x): x is { llave: string; texto: string; sinEste: string } => x !== null)

  return (
    <Pagina
      titulo="Peticiones"
      descripcion="Solicitudes ciudadanas levantadas en campo, eventos y oficina"
      acciones={
        <>
          {/* El botón solo aparece si el perfil puede exportar. La ruta
              lo vuelve a comprobar: esconder el botón no protege nada,
              cualquiera escribe la dirección. */}
          {puedeExportar && (
            <a
              href={`/peticiones/exportar?${new URLSearchParams(
                Object.entries(sp).flatMap(([k, v]) =>
                  typeof v === 'string' && v.trim() && k !== 'pagina' ? [[k, v]] : [],
                ) as [string, string][],
              ).toString()}`}
              className="boton boton-neutro"
              download
            >
              Exportar
            </a>
          )}
          <Link href="/peticiones/nueva" className="boton boton-primario">
            Nueva petición
          </Link>
        </>
      }
    >
      <Filtros
        busqueda={{ nombre: 'q', marcador: 'Buscar por ciudadano, colonia o descripción…' }}
        selectores={[
          { nombre: 'estatus', etiqueta: 'Estatus', opciones: r.estatus },
          { nombre: 'problematica', etiqueta: 'Problemática', opciones: r.problematicas },
          { nombre: 'prioridad', etiqueta: 'Prioridad', opciones: r.prioridades },
        ]}
      />

      {/* Los recortes que llegan desde otra pantalla —un mes de la
          gráfica, un municipio del mapa, la alerta de urgentes— no están
          en los selectores de arriba. Si no se dijeran aquí, el total
          saldría distinto al de la pantalla anterior sin explicación. */}
      {recortes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rotulo">Viendo solo</span>
          {recortes.map((c) => (
            <Link
              key={c.llave}
              href={c.sinEste}
              className="distintivo gap-1.5 hover:opacity-80"
              style={{ background: 'var(--color-acento-suave)', color: 'var(--color-acento-fuerte)' }}
              title="Quitar este recorte"
            >
              {c.texto}
              <span aria-hidden="true">×</span>
            </Link>
          ))}
        </div>
      )}

      <SeleccionEnLote estatus={r.estatusConId} />

      {r.total === 0 ? (
        <Vacio
          titulo="Ninguna petición coincide"
          descripcion="Prueba quitando algún filtro o buscando con otras palabras."
        />
      ) : (
        <div className="panel overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    data-todas=""
                    aria-label="Seleccionar todas las de esta página"
                    className="cursor-pointer"
                  />
                </th>
                <th>Folio</th>
                <th>Ciudadano</th>
                <th>Petición</th>
                <th className="hidden 2xl:table-cell">Colonia</th>
                <th>Prioridad</th>
                <th>Estatus</th>
                <th className="num">Fecha</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {r.filas.map((p) => (
                <FilaAbrible key={p.id} href={`/peticiones/${p.id}`}>
                  <td>
                    <input
                      type="checkbox"
                      data-peticion={p.id}
                      aria-label={`Seleccionar la petición ${p.folio}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="clave">{p.folio}</td>
                  <td className="whitespace-nowrap font-medium">
                    <Link
                      href={`/ciudadanos/${p.ciudadano_id}`}
                      className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                    >
                      {p.ciudadano ?? '—'}
                    </Link>
                  </td>
                  <td className="w-full max-w-0">
                    <span className="block truncate" title={p.descripcion ?? undefined}>
                      {p.descripcion ?? '—'}
                    </span>
                    <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                      {[p.problematica, p.subproblematica].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap text-[var(--color-tinta-2)] 2xl:table-cell">
                    {p.colonia ?? '—'}
                  </td>
                  <td>
                    {p.prioridad === 'Urgente' ? (
                      <Distintivo tono="alerta">Urgente</Distintivo>
                    ) : (
                      <span className="text-[var(--color-tinta-2)]">{p.prioridad ?? '—'}</span>
                    )}
                  </td>
                  <td>
                    <Distintivo tono={TONO[p.estatus ?? ''] ?? 'neutro'}>
                      {p.estatus ?? 'Sin estatus'}
                    </Distintivo>
                  </td>
                  <td className="num clave whitespace-nowrap">{fechaCorta(p.fecha)}</td>
                  <td className="w-10">
                    <Link
                      href={`/peticiones/${p.id}`}
                      className="boton boton-llano !h-7 !w-7 !p-0"
                      aria-label={`Ver petición ${p.folio}`}
                    >
                      <IconoVer />
                    </Link>
                  </td>
                </FilaAbrible>
              ))}
            </tbody>
          </Tabla>
          <Paginador pagina={r.pagina} porPagina={POR_PAGINA} total={r.total} />
        </div>
      )}
    </Pagina>
  )
}
