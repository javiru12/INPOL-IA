import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  panelDeEstructura,
  esOrden,
  esPinta,
  UMBRAL_REZAGO,
  UMBRAL_DUENO,
  type Orden,
  type Pinta,
  type Riesgo,
  type Persona,
} from './consultas'
import { LienzoEquipo } from './lienzo'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { Filtros } from '@/components/filtros'
import { BarrasHorizontales } from '@/components/graficas'
import { cifra } from '@/lib/formato'
import { ESTADO } from '@/lib/paleta'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Estructura' }

const PERFILES: Record<string, string> = {
  super_admin: 'Administración general',
  admin: 'Administración',
  asignador: 'Asignación',
  gestor_social: 'Gestión social',
  operador_gestion: 'Operación de gestión',
  operador_campo: 'Operación de campo',
  marketing: 'Marketing',
  rp_movilizadores: 'Movilización',
  lider_promotores: 'Promoción',
  promotor_votos: 'Promoción',
  representante_casilla: 'Representación',
}

function nombrePerfil(clave: string | null) {
  if (!clave) return '—'
  const conocido = PERFILES[clave]
  if (conocido) return conocido
  const texto = clave.replaceAll('_', ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const RIESGOS: Record<Riesgo, { etiqueta: string; tono: 'alerta' | 'aviso' | 'dato'; ayuda: string }> = {
  sola: {
    etiqueta: 'Una persona',
    tono: 'alerta',
    ayuda: 'Toda la zona depende de un único responsable: si falta, nadie la conoce.',
  },
  dispersa: {
    etiqueta: 'Sin dueño',
    tono: 'aviso',
    ayuda: `Quien más atiende la zona no llega al ${Math.round(UMBRAL_DUENO * 100)}% de sus peticiones: la demanda está repartida y nadie responde por el conjunto.`,
  },
  rezago: {
    etiqueta: 'Rezago',
    tono: 'dato',
    ayuda: `El reparto está bien, pero hay peticiones abiertas con más de ${UMBRAL_REZAGO} días.`,
  },
}

const COLUMNAS: { clave: Orden; titulo: string; num: boolean; ayuda?: string }[] = [
  { clave: 'nombre', titulo: 'Persona', num: false },
  { clave: 'secciones', titulo: 'Secciones', num: true, ayuda: 'Secciones donde ha atendido al menos una petición' },
  { clave: 'asignadas', titulo: 'Asignadas', num: true },
  { clave: 'resueltas', titulo: 'Resueltas', num: true },
  { clave: 'tasa', titulo: '% resolución', num: true },
  { clave: 'mediana', titulo: 'Mediana días', num: true, ayuda: 'Días que tarda en cerrar, mediana de lo que ya resolvió' },
  { clave: 'abiertas', titulo: 'Abiertas hoy', num: true, ayuda: 'Todo lo que no quedó Completada ni Cancelada' },
  { clave: 'rezagadas', titulo: 'En rezago', num: true, ayuda: `Abiertas con más de ${UMBRAL_REZAGO} días` },
]

const PINTAS: { valor: Pinta; etiqueta: string }[] = [
  { valor: 'carga', etiqueta: 'Por carga' },
  { valor: 'responsable', etiqueta: 'Por responsable' },
]

/** Debajo de esto, la mediana de días es anécdota, no tendencia. */
const MINIMO_PARA_MEDIANA = 3

const unDecimal = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default async function Estructura({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/estructura')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const crudoOrden = texto(sp.orden)
  const orden: Orden = esOrden(crudoOrden) ? crudoOrden : 'asignadas'
  const dir = texto(sp.dir) === 'asc' ? 'asc' : 'desc'
  const crudoPinta = texto(sp.pinta)
  const pinta: Pinta = esPinta(crudoPinta) ? crudoPinta : 'carga'

  const r = await panelDeEstructura(tenant.id, {
    municipio: texto(sp.municipio),
    persona: texto(sp.persona),
    orden,
    dir,
  })

  const elegida = r.personas.find((p) => p.id === texto(sp.persona)) ?? null

  // Los enlaces conservan lo que ya está puesto: el orden y el mapa viven
  // en la URL igual que los filtros, así una pantalla se comparte tal cual.
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.trim()) base.set(k, v.trim())
  }
  const enlace = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams(base)
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    const texto = q.toString()
    return texto ? `/estructura?${texto}` : '/estructura'
  }
  const enlaceOrden = (col: Orden) =>
    enlace({
      orden: col,
      dir: orden === col ? (dir === 'desc' ? 'asc' : 'desc') : col === 'nombre' ? 'asc' : 'desc',
    })

  const hayTerritorio = r.municipios.length > 0
  const conCarga = r.personas.filter((p) => p.asignadas > 0)
  const mediaAbiertas = conCarga.length ? r.totales.abiertas / conCarga.length : 0

  const ambito = texto(sp.municipio) ?? 'los municipios con demanda capturada'

  return (
    <Pagina
      titulo="Estructura de atención"
      descripcion="Quién responde por cada zona del territorio y cómo va su carga de trabajo"
      acciones={
        elegida ? (
          <Link href={enlace({ persona: null })} className="boton boton-neutro">
            Ver a todo el equipo
          </Link>
        ) : undefined
      }
    >
      <Filtros
        selectores={[
          {
            nombre: 'municipio',
            etiqueta: 'Municipio',
            vacio: 'Todo el territorio',
            opciones: r.opciones.municipios,
          },
          {
            nombre: 'persona',
            etiqueta: 'Persona',
            vacio: 'Todo el equipo',
            opciones: r.opciones.personas,
          },
        ]}
      />

      {r.totales.peticiones === 0 ? (
        <Vacio
          titulo="No hay trabajo capturado en este territorio"
          descripcion="La estructura se deduce de las peticiones que atiende cada quien. Sin peticiones no hay a quién medir: prueba quitando el filtro de municipio."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              etiqueta="Personas con carga"
              valor={conCarga.length}
              pie={`De ${cifra(r.personas.length)} activas en el sistema · ${cifra(r.ramas.length)} áreas`}
            />
            <Indicador
              etiqueta="Peticiones abiertas"
              valor={r.totales.abiertas}
              tono="dato"
              pie={`${unDecimal(mediaAbiertas)} por persona · de ${cifra(r.totales.peticiones)} asignadas`}
            />
            <Indicador
              etiqueta={`En rezago (+${UMBRAL_REZAGO} días)`}
              valor={r.totales.rezagadas}
              tono={r.totales.rezagadas > 0 ? 'alerta' : 'exito'}
              pie={
                r.totales.abiertas
                  ? `${Math.round((r.totales.rezagadas / r.totales.abiertas) * 100)}% de lo que sigue abierto`
                  : 'Nada abierto por ahora'
              }
            />
            <Indicador
              etiqueta="Secciones sin dueño claro"
              valor={r.riesgo.sinDueno}
              tono={
                r.riesgo.zonas === 0 ? 'neutro' : r.riesgo.sinDueno > 0 ? 'aviso' : 'exito'
              }
              pie={
                r.riesgo.zonas
                  ? `De ${cifra(r.riesgo.zonas)} secciones con demanda · ${cifra(r.riesgo.concentradas)} dependen de una sola persona`
                  : 'Ninguna petición tiene sección capturada'
              }
            />
          </div>

          {/* 1 · ¿Quién compone el equipo y qué carga lleva? ---------- */}
          <section className="panel mt-3 overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-borde)] px-4 py-3">
              <h2 className="text-[var(--text-base)] font-semibold">El equipo</h2>
              <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                Elige a una persona para ver su territorio
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    {COLUMNAS.map((c) => {
                      const activa = orden === c.clave
                      return (
                        <th
                          key={c.clave}
                          className={c.num ? 'num' : undefined}
                          title={c.ayuda}
                          aria-sort={activa ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <Link
                            href={enlaceOrden(c.clave)}
                            className="inline-flex items-center gap-1 hover:text-[var(--color-tinta)]"
                            style={activa ? { color: 'var(--color-acento-fuerte)' } : undefined}
                          >
                            {c.titulo}
                            <span aria-hidden="true" style={{ opacity: activa ? 1 : 0.3 }}>
                              {activa && dir === 'asc' ? '↑' : '↓'}
                            </span>
                          </Link>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {r.personas.map((p) => (
                    <FilaPersona
                      key={p.id}
                      persona={p}
                      elegida={elegida?.id === p.id}
                      href={enlace({ persona: elegida?.id === p.id ? null : p.id })}
                      maximo={Math.max(...r.personas.map((x) => x.asignadas), 1)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-4 py-2 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              {r.formal.vinculos > 0
                ? `Hay ${cifra(r.formal.vinculos)} relaciones de jerarquía capturadas en ${cifra(r.formal.estructuras)} estructuras formales.`
                : 'Todavía no hay jerarquía formal capturada (estructuras y sus relaciones están vacías). Lo que se muestra se deduce del trabajo realmente asignado a cada persona.'}
            </p>
          </section>

          {/* 2 · ¿Qué territorio cubre la persona elegida? ------------ */}
          {elegida && r.detalle && (
            <section className="panel mt-3 overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-borde)] px-4 py-3">
                <div>
                  <h2 className="text-[var(--text-base)] font-semibold">
                    Territorio de {elegida.nombre}
                  </h2>
                  <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                    {nombrePerfil(elegida.perfil)} · {cifra(elegida.asignadas)} peticiones en{' '}
                    {cifra(elegida.secciones)} secciones de {cifra(elegida.municipios)} municipios
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <Cifra etiqueta="Abiertas" valor={cifra(elegida.abiertas)} />
                  <Cifra
                    etiqueta="En rezago"
                    valor={cifra(elegida.rezagadas)}
                    color={elegida.rezagadas > 0 ? ESTADO.alerta : undefined}
                  />
                  <Cifra
                    etiqueta="Mediana días"
                    valor={elegida.mediana !== null ? unDecimal(elegida.mediana) : '—'}
                  />
                  <Cifra
                    etiqueta="% resolución"
                    valor={`${Math.round(elegida.tasa * 100)}%`}
                  />
                </div>
              </div>

              {r.detalle.municipios.length === 0 ? (
                <p className="px-4 py-8 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Ninguna de sus peticiones trae sección capturada, así que no hay territorio que
                  mostrar.
                </p>
              ) : (
                <div className="grid gap-x-6 gap-y-4 px-4 py-3.5 lg:grid-cols-2">
                  <div>
                    <p className="rotulo mb-2.5">Dónde atiende</p>
                    <BarrasHorizontales
                      datos={r.detalle.municipios.map((m) => ({
                        etiqueta: m.nombre,
                        valor: m.peticiones,
                      }))}
                    />
                  </div>
                  <div>
                    <p className="rotulo mb-2">Sus secciones más cargadas</p>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Sección</th>
                          <th>Municipio</th>
                          <th className="num">Peticiones</th>
                          <th className="num">Abiertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.detalle.secciones.map((s) => (
                          <tr key={s.id}>
                            <td className="clave font-medium">{s.clave}</td>
                            <td className="text-[var(--color-tinta-2)]">{s.municipio}</td>
                            <td className="num">{cifra(s.peticiones)}</td>
                            <td
                              className="num font-medium"
                              style={s.abiertas > 0 ? { color: ESTADO.aviso } : undefined}
                            >
                              {s.abiertas}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 3 · El mapa y la cobertura por municipio ----------------- */}
          <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr] xl:items-start">
            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-[var(--text-base)] font-semibold">
                    {elegida ? `Dónde opera ${elegida.nombre}` : 'El territorio y quién lo atiende'}
                  </h2>
                  <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                    {elegida
                      ? 'Sus peticiones abiertas por municipio'
                      : pinta === 'carga'
                        ? `Peticiones abiertas por municipio en ${ambito}`
                        : 'Cada municipio con el color de quien más peticiones lleva ahí'}
                  </p>
                </div>
                {!elegida && hayTerritorio && (
                  <nav
                    aria-label="Qué pinta el mapa"
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5"
                  >
                    {PINTAS.map((o) => (
                      <Link
                        key={o.valor}
                        href={enlace({ pinta: o.valor })}
                        aria-current={pinta === o.valor ? 'true' : undefined}
                        className={`boton !h-7 !px-2.5 text-[var(--text-menuda)] ${
                          pinta === o.valor ? 'boton-primario' : 'boton-llano'
                        }`}
                      >
                        {o.etiqueta}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
              {hayTerritorio ? (
                <LienzoEquipo
                  municipios={r.municipios}
                  pinta={pinta}
                  persona={elegida ? { id: elegida.id, nombre: elegida.nombre } : null}
                />
              ) : (
                <Vacio
                  titulo="Sin territorio que pintar"
                  descripcion={`Ninguna de las ${cifra(r.totales.peticiones)} peticiones de este cliente trae sección electoral capturada, así que no se puede deducir a qué municipio pertenece. Las cifras del equipo sí son válidas.`}
                />
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-[var(--color-borde)] px-4 py-3">
                <h2 className="text-[var(--text-base)] font-semibold">Cobertura por municipio</h2>
                <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Cuánta gente atiende cada zona y qué parte lleva quien más carga
                </p>
              </div>
              {hayTerritorio ? (
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Municipio</th>
                        <th className="num">Peticiones</th>
                        <th className="num">Abiertas</th>
                        <th className="num">Personas</th>
                        <th>Lleva más</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.municipios.map((m) => (
                        <tr key={m.clave}>
                          <td className="font-medium">{m.nombre}</td>
                          <td className="num">{cifra(m.peticiones)}</td>
                          <td
                            className="num font-medium"
                            style={m.rezagadas > 0 ? { color: ESTADO.alerta } : undefined}
                            title={
                              m.rezagadas > 0
                                ? `${m.rezagadas} con más de ${UMBRAL_REZAGO} días`
                                : undefined
                            }
                          >
                            {cifra(m.abiertas)}
                          </td>
                          <td className="num">{cifra(m.personas)}</td>
                          <td className="whitespace-nowrap">
                            {m.principal ? (
                              <span className="flex items-baseline gap-1.5">
                                <span>{m.principal}</span>
                                <span
                                  className="clave"
                                  title="Parte de las peticiones de la zona que lleva esta persona"
                                  style={
                                    m.participacion !== null &&
                                    m.participacion < UMBRAL_DUENO * 100
                                      ? { color: ESTADO.aviso }
                                      : undefined
                                  }
                                >
                                  {m.participacion !== null ? `${m.participacion}%` : ''}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[var(--color-tinta-3)]">Sin responsable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Sin secciones capturadas en las peticiones.
                </p>
              )}
            </section>
          </div>

          {/* 4 · Lo accionable: zonas y ramas ------------------------- */}
          <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr] xl:items-start">
            <section className="panel overflow-hidden">
              <div className="border-b border-[var(--color-borde)] px-4 py-3">
                <h2 className="text-[var(--text-base)] font-semibold">
                  Zonas que piden intervención
                </h2>
                <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Secciones con trabajo abierto, por rezago y por lo claro que esté quién responde
                </p>
              </div>
              {r.zonas.length ? (
                <div className="overflow-x-auto">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Sección</th>
                        <th className="num">Abiertas</th>
                        <th className="num" title={`Abiertas con más de ${UMBRAL_REZAGO} días`}>
                          En rezago
                        </th>
                        <th>Responsable</th>
                        <th>Señal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.zonas.map((z) => (
                        <tr key={z.id}>
                          <td className="whitespace-nowrap">
                            <span className="clave font-medium">{z.clave}</span>
                            <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                              {z.municipio}
                            </span>
                          </td>
                          <td className="num font-medium">{cifra(z.abiertas)}</td>
                          <td
                            className="num font-semibold"
                            style={z.rezagadas > 0 ? { color: ESTADO.alerta } : undefined}
                          >
                            {z.rezagadas || '—'}
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="block">{z.principal ?? '—'}</span>
                            <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                              {z.participacion !== null
                                ? `${z.participacion}% de ${z.peticiones}`
                                : `${z.peticiones} peticiones`}
                              {` · ${z.personas === 1 ? '1 persona' : `${z.personas} personas`}`}
                            </span>
                          </td>
                          <td>
                            {z.riesgo ? (
                              <span title={RIESGOS[z.riesgo].ayuda}>
                                <Distintivo tono={RIESGOS[z.riesgo].tono}>
                                  {RIESGOS[z.riesgo].etiqueta}
                                </Distintivo>
                              </span>
                            ) : (
                              <span className="text-[var(--color-tinta-3)]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  {hayTerritorio
                    ? 'Ninguna sección tiene trabajo abierto en este territorio.'
                    : 'Sin secciones capturadas en las peticiones: el territorio no se puede deducir.'}
                </p>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-[var(--color-borde)] px-4 py-3">
                <h2 className="text-[var(--text-base)] font-semibold">Cómo va cada área</h2>
                <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Las ramas que hoy existen de verdad son los perfiles del equipo
                </p>
              </div>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Área</th>
                    <th className="num">Personas</th>
                    <th className="num">Asignadas</th>
                    <th className="num">Abiertas</th>
                    <th className="num">En rezago</th>
                  </tr>
                </thead>
                <tbody>
                  {r.ramas.map((rama) => (
                    <tr key={rama.perfil}>
                      <td className="font-medium">{nombrePerfil(rama.perfil)}</td>
                      <td className="num">{cifra(rama.personas)}</td>
                      <td className="num">{cifra(rama.asignadas)}</td>
                      <td className="num">{cifra(rama.abiertas)}</td>
                      <td
                        className="num font-medium"
                        style={rama.rezagadas > 0 ? { color: ESTADO.alerta } : undefined}
                      >
                        {rama.rezagadas || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </Pagina>
  )
}

/** Cifra suelta del encabezado de detalle. */
function Cifra({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string
  valor: string
  color?: string
}) {
  return (
    <div>
      <p className="rotulo">{etiqueta}</p>
      <p className="cifra mt-0.5 text-[var(--text-media)] font-semibold" style={{ color }}>
        {valor}
      </p>
    </div>
  )
}

function FilaPersona({
  persona,
  elegida,
  href,
  maximo,
}: {
  persona: Persona
  elegida: boolean
  href: string
  maximo: number
}) {
  const quema = persona.rezagadas > 0
  const pocosCierres = persona.mediana !== null && persona.resueltas < MINIMO_PARA_MEDIANA
  const ancho = (persona.asignadas / maximo) * 100

  return (
    <tr
      style={
        elegida
          ? { background: 'var(--color-acento-suave)', boxShadow: 'inset 3px 0 0 var(--color-acento)' }
          : undefined
      }
    >
      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
        {nombrePerfil(persona.perfil)}
      </td>
      <td className="whitespace-nowrap font-medium">
        <Link
          href={href}
          className="hover:text-[var(--color-acento-fuerte)] hover:underline"
          aria-current={elegida ? 'true' : undefined}
        >
          {persona.nombre}
        </Link>
      </td>
      <td className="num">
        {persona.secciones ? cifra(persona.secciones) : '—'}
        {persona.municipios > 0 && (
          <span className="clave ml-1.5">{persona.municipios} mun.</span>
        )}
      </td>
      <td className="num">
        <span className="flex items-center justify-end gap-2">
          <span
            aria-hidden="true"
            className="h-[6px] w-14 overflow-hidden rounded-full bg-[var(--color-borde)]"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${persona.asignadas > 0 ? Math.max(ancho, 6) : 0}%`,
                background: 'var(--color-acento)',
              }}
            />
          </span>
          <span className="font-medium">{cifra(persona.asignadas)}</span>
        </span>
      </td>
      <td className="num text-[var(--color-tinta-2)]">{cifra(persona.resueltas)}</td>
      <td className="num">
        {persona.asignadas ? `${Math.round(persona.tasa * 100)}%` : '—'}
      </td>
      {/* Una mediana sobre dos o tres cierres no es un tiempo típico:
          se muestra apagada para que nadie la lea como tal. */}
      <td
        className="num"
        style={pocosCierres ? { color: 'var(--color-tinta-3)' } : undefined}
        title={
          pocosCierres
            ? `Calculada sobre ${persona.resueltas} ${persona.resueltas === 1 ? 'cierre' : 'cierres'}: todavía no es un tiempo típico`
            : undefined
        }
      >
        {persona.mediana !== null ? unDecimal(persona.mediana) : '—'}
      </td>
      <td className="num font-medium">{persona.abiertas ? cifra(persona.abiertas) : '—'}</td>
      <td className="num">
        {quema ? (
          <span
            className="inline-flex items-baseline gap-1.5"
            title={`La más antigua lleva ${persona.masVieja} días abierta`}
          >
            <span className="font-semibold" style={{ color: ESTADO.alerta }}>
              {persona.rezagadas}
            </span>
            <span className="clave text-[var(--color-tinta-3)]">
              {persona.masVieja}d
            </span>
          </span>
        ) : (
          <span className="text-[var(--color-tinta-3)]">—</span>
        )}
      </td>
    </tr>
  )
}
