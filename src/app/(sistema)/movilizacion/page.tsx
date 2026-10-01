import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import {
  panelDeMovilizacion,
  esOrden,
  esPinta,
  esMarcha,
  UMBRAL_REZAGO,
  ETIQUETA_ESTADO,
  ETIQUETA_PROSPECTO,
  type Orden,
  type Pinta,
  type Movilizador,
} from './consultas'
import { LienzoMovilizacion } from './lienzo'
import { FormaAltaMovilizador } from './formas'
import { Pagina, Indicador, Distintivo, Vacio } from '@/components/pagina'
import { Filtros } from '@/components/filtros'
import { IconoVer } from '@/components/iconos'
import { cifra, porcentaje, fechaCorta } from '@/lib/formato'
import { ESTADO } from '@/lib/paleta'
import { RAMPA_SECUENCIAL } from '@/lib/escalas'
import { exigirAcceso } from '@/lib/acceso'

export const metadata: Metadata = { title: 'Movilización' }

const COLUMNAS: { clave: Orden; titulo: string; num: boolean; ayuda?: string }[] = [
  { clave: 'nombre', titulo: 'Movilizador', num: false },
  { clave: 'zona', titulo: 'Zona', num: false, ayuda: 'Municipio y sección de su ficha ciudadana' },
  { clave: 'meta', titulo: 'Meta', num: true, ayuda: 'Personas que se comprometió a llevar a votar' },
  { clave: 'promovidos', titulo: 'Promovidos', num: true, ayuda: 'Ciudadanos que lleva registrados' },
  { clave: 'avance', titulo: '% de avance', num: true, ayuda: 'Promovidos entre meta' },
  { clave: 'confirmados', titulo: 'Confirmados', num: true, ayuda: 'Promovidos que ya confirmaron su voto' },
]

const PINTAS: { valor: Pinta; etiqueta: string }[] = [
  { valor: 'promovidos', etiqueta: 'Por promovidos' },
  { valor: 'avance', etiqueta: 'Por avance' },
]

const MARCHAS = [
  { valor: 'rezago', etiqueta: `En rezago (menos del ${Math.round(UMBRAL_REZAGO * 100)}%)` },
  { valor: 'camino', etiqueta: 'En camino' },
  { valor: 'cumplida', etiqueta: 'Meta cumplida' },
]

const TONO_ESTADO = {
  prospecto: 'neutro',
  contactado: 'dato',
  comprometido: 'aviso',
  confirmado: 'exito',
} as const

const TONO_PROSPECTO: Record<string, 'neutro' | 'dato' | 'aviso' | 'exito' | 'alerta'> = {
  nuevo: 'neutro',
  contactado: 'dato',
  interesado: 'aviso',
  convertido: 'exito',
  rechazado: 'alerta',
}

export default async function Movilizacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcceso('/movilizacion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const texto = (v: string | string[] | undefined) =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

  const crudoOrden = texto(sp.orden)
  const orden: Orden = esOrden(crudoOrden) ? crudoOrden : 'avance'
  const dir = texto(sp.dir) === 'asc' ? 'asc' : 'desc'
  const crudaPinta = texto(sp.pinta)
  const pinta: Pinta = esPinta(crudaPinta) ? crudaPinta : 'promovidos'
  const crudaMarcha = texto(sp.marcha)

  const r = await panelDeMovilizacion(tenant.id, {
    municipio: texto(sp.municipio),
    marcha: esMarcha(crudaMarcha) ? crudaMarcha : undefined,
    responsable: texto(sp.responsable),
    orden,
    dir,
  })

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
    const cadena = q.toString()
    return cadena ? `/movilizacion?${cadena}` : '/movilizacion'
  }
  const enlaceOrden = (col: Orden) =>
    enlace({
      orden: col,
      dir:
        orden === col
          ? dir === 'desc'
            ? 'asc'
            : 'desc'
          : col === 'nombre' || col === 'zona'
            ? 'asc'
            : 'desc',
    })

  const t = r.totales
  const avance = t.meta ? t.promovidos / t.meta : 0
  const hayTerritorio = r.municipios.length > 0
  const rezagados = r.movilizadores.filter((m) => m.marcha === 'rezago').length
  const cumplidas = r.movilizadores.filter((m) => m.marcha === 'cumplida').length
  const totalEmbudo = r.embudo.reduce((s, e) => s + e.promovidos, 0)
  const maximoPromovidos = Math.max(...r.movilizadores.map((m) => m.promovidos), 1)

  return (
    <Pagina
      titulo="Movilización"
      descripcion="La red que lleva gente a votar: quién se comprometió a cuánto y cómo va"
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
            nombre: 'marcha',
            etiqueta: 'Avance',
            vacio: 'Todo el avance',
            opciones: MARCHAS,
          },
          {
            nombre: 'responsable',
            etiqueta: 'Responsable',
            vacio: 'Todos los responsables',
            opciones: r.opciones.responsables,
          },
        ]}
      />

      {t.movilizadores === 0 ? (
        <Vacio
          titulo="Todavía no hay movilizadores en este corte"
          descripcion="La red se arma marcando como movilizador a gente que ya está en el padrón y fijándole una meta. Prueba quitando los filtros, o da de alta al primero desde el panel de abajo."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              etiqueta="Movilizadores activos"
              valor={t.movilizadores}
              pie={
                t.sinRegistrar > 0
                  ? `${cifra(t.sinRegistrar)} no han registrado a nadie todavía`
                  : 'Todos traen gente registrada'
              }
            />
            <Indicador
              etiqueta="Meta comprometida"
              valor={t.meta}
              pie={`${Math.round(t.meta / t.movilizadores)} personas por movilizador en promedio`}
            />
            <Indicador
              etiqueta="Promovidos registrados"
              valor={t.promovidos}
              tono="dato"
              pie={`${cifra(t.comprometidos)} ya se comprometieron · ${cifra(t.simpatizantes)} simpatizantes`}
            />
            <Indicador
              etiqueta="Avance contra la meta"
              valor={`${Math.round(avance * 100)}%`}
              tono={avance >= 1 ? 'exito' : avance < UMBRAL_REZAGO ? 'alerta' : 'aviso'}
              pie={
                avance >= 1
                  ? 'La red ya rebasó lo comprometido'
                  : `Faltan ${cifra(Math.max(t.meta - t.promovidos, 0))} personas por registrar`
              }
            />
          </div>

          {/* 1 · El embudo: dónde se atora la prospección ------------- */}
          <section className="panel mt-3 px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[var(--text-base)] font-semibold">Embudo de prospección</h2>
              <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                {cifra(totalEmbudo)} promovidos · {porcentaje(t.confirmados, totalEmbudo)} ya
                confirmó su voto
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              {r.embudo.map((tramo, i) => (
                <div key={tramo.estado} className="min-w-[8.5rem] flex-1">
                  <p className="rotulo">{ETIQUETA_ESTADO[tramo.estado]}</p>
                  <p className="cifra mt-1 text-[var(--text-media)] font-semibold">
                    {cifra(tramo.promovidos)}
                    <span className="ml-1.5 text-[var(--text-menuda)] font-normal text-[var(--color-tinta-3)]">
                      {porcentaje(tramo.promovidos, totalEmbudo)}
                    </span>
                  </p>
                  <span
                    aria-hidden="true"
                    className="mt-1.5 block h-[6px] overflow-hidden rounded-full bg-[var(--color-borde)]"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${totalEmbudo ? (tramo.promovidos / totalEmbudo) * 100 : 0}%`,
                        background: RAMPA_SECUENCIAL[2 + i],
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 2 · La tabla de la red ---------------------------------- */}
          <section className="panel mt-3 overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-borde)] px-4 py-3">
              <h2 className="text-[var(--text-base)] font-semibold">La red</h2>
              <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                {cumplidas > 0 && `${cifra(cumplidas)} ya cumplieron su meta · `}
                {rezagados > 0
                  ? `${cifra(rezagados)} por debajo del ${Math.round(UMBRAL_REZAGO * 100)}%`
                  : 'Nadie por debajo del umbral de rezago'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
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
                    <th>Marcha</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {r.movilizadores.map((m) => (
                    <FilaMovilizador key={m.id} m={m} maximo={maximoPromovidos} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3 · El territorio --------------------------------------- */}
          <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr] xl:items-start">
            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-[var(--text-base)] font-semibold">Dónde está la red</h2>
                  <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                    {pinta === 'avance'
                      ? 'Qué tan cerca está cada municipio de la meta que ahí se comprometió'
                      : 'Promovidos registrados por municipio'}
                  </p>
                </div>
                {hayTerritorio && (
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
                <LienzoMovilizacion municipios={r.municipios} pinta={pinta} />
              ) : (
                <Vacio
                  titulo="Sin territorio que pintar"
                  descripcion="Ninguno de los movilizadores de este cliente trae sección electoral en su ficha ciudadana, así que no se puede deducir a qué municipio pertenece. Las cifras de la red sí son válidas."
                />
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-[var(--color-borde)] px-4 py-3">
                <h2 className="text-[var(--text-base)] font-semibold">Avance por municipio</h2>
                <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Lo comprometido y lo registrado en cada zona
                </p>
              </div>
              {hayTerritorio ? (
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Municipio</th>
                        <th className="num">Red</th>
                        <th className="num">Meta</th>
                        <th className="num">Promovidos</th>
                        <th className="num">Avance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.municipios.map((m) => (
                        <tr key={m.clave}>
                          <td className="font-medium">{m.nombre}</td>
                          <td className="num">{cifra(m.movilizadores)}</td>
                          <td className="num text-[var(--color-tinta-2)]">{cifra(m.meta)}</td>
                          <td className="num">{cifra(m.promovidos)}</td>
                          <td
                            className="num font-medium"
                            style={{
                              color:
                                m.avance === null
                                  ? undefined
                                  : m.avance >= 1
                                    ? ESTADO.exito
                                    : m.avance < UMBRAL_REZAGO
                                      ? ESTADO.alerta
                                      : undefined,
                            }}
                          >
                            {m.avance === null ? '—' : `${Math.round(m.avance * 100)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                  Sin secciones capturadas en las fichas de los movilizadores.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      {/* 4 · Crecer la red: prospectos y alta --------------------- */}
      <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">
              Prospectos de movilizador
            </h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              A quién se está invitando a sumarse, y cómo va esa conversación
            </p>
          </div>
          {r.prospectos.length ? (
            <div className="max-h-[26rem] overflow-x-auto overflow-y-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Estado</th>
                    <th className="num" title="Llamadas registradas en su seguimiento">
                      Llamadas
                    </th>
                    <th className="num">Meta propuesta</th>
                    <th>Responsable</th>
                    <th className="num">Próximo contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {r.prospectos.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">
                        <span className="block font-medium">{p.nombre}</span>
                        <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                          {[p.colonia, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto'}
                        </span>
                      </td>
                      <td>
                        <Distintivo tono={TONO_PROSPECTO[p.estado] ?? 'neutro'}>
                          {ETIQUETA_PROSPECTO[p.estado] ?? p.estado}
                        </Distintivo>
                      </td>
                      <td className="num">{p.llamadas || '—'}</td>
                      <td className="num text-[var(--color-tinta-2)]">
                        {p.meta_propuesta === null ? '—' : cifra(p.meta_propuesta)}
                      </td>
                      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                        {p.responsable ?? '—'}
                      </td>
                      <td className="num clave whitespace-nowrap">
                        {p.proximo_contacto ? fechaCorta(p.proximo_contacto) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Todavía no se está invitando a nadie.
            </p>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--color-borde)] px-4 py-3">
            <h2 className="text-[var(--text-base)] font-semibold">Sumar a la red</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
              Se marca a alguien que ya está en el padrón: el registro de la persona no se duplica
            </p>
          </div>
          <FormaAltaMovilizador tipos={r.tipos} responsables={r.opciones.responsables} />
        </section>
      </div>
    </Pagina>
  )
}

function FilaMovilizador({ m, maximo }: { m: Movilizador; maximo: number }) {
  const ancho = (m.promovidos / maximo) * 100
  const pct = Math.round(m.avance * 100)

  const zona = m.municipio
    ? [m.municipio, m.seccion && `· ${m.seccion}`].filter(Boolean).join(' ')
    : (m.colonia ?? null)

  return (
    <tr
      style={
        m.marcha === 'rezago'
          ? { boxShadow: 'inset 3px 0 0 var(--color-alerta)' }
          : m.marcha === 'cumplida'
            ? { boxShadow: 'inset 3px 0 0 var(--color-exito)' }
            : undefined
      }
    >
      <td className="whitespace-nowrap font-medium">
        <Link
          href={`/movilizacion/${m.id}`}
          className="hover:text-[var(--color-acento-fuerte)] hover:underline"
        >
          {m.nombre}
        </Link>
        {m.tipo && (
          <span className="block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            {m.tipo}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
        {zona ?? <span className="text-[var(--color-tinta-3)]">Sin zona</span>}
      </td>
      <td className="num">{cifra(m.meta)}</td>
      <td className="num">
        <span className="flex items-center justify-end gap-2">
          <span
            aria-hidden="true"
            className="h-[6px] w-14 overflow-hidden rounded-full bg-[var(--color-borde)]"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${m.promovidos > 0 ? Math.max(ancho, 6) : 0}%`,
                background: 'var(--color-acento)',
              }}
            />
          </span>
          <span className="font-medium">{cifra(m.promovidos)}</span>
        </span>
      </td>
      <td
        className="num font-semibold"
        style={{
          color:
            m.marcha === 'cumplida'
              ? ESTADO.exito
              : m.marcha === 'rezago'
                ? ESTADO.alerta
                : undefined,
        }}
        title={
          m.diasSinRegistrar === null
            ? 'Nunca ha registrado a nadie'
            : `Su último registro fue hace ${m.diasSinRegistrar} días`
        }
      >
        {pct}%
      </td>
      <td className="num text-[var(--color-tinta-2)]">{m.confirmados || '—'}</td>
      <td>
        {m.marcha === 'cumplida' ? (
          <Distintivo tono="exito">Meta cumplida</Distintivo>
        ) : m.marcha === 'rezago' ? (
          <span title={`Lleva ${m.promovidos} de ${m.meta} comprometidos`}>
            <Distintivo tono="alerta">En rezago</Distintivo>
          </span>
        ) : (
          <Distintivo tono={TONO_ESTADO.contactado}>En camino</Distintivo>
        )}
      </td>
      <td className="w-10">
        <Link
          href={`/movilizacion/${m.id}`}
          className="boton boton-llano !h-7 !w-7 !p-0"
          aria-label={`Ver la ficha de ${m.nombre}`}
        >
          <IconoVer />
        </Link>
      </td>
    </tr>
  )
}
