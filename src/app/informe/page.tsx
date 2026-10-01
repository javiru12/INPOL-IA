import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { datosDelInforme } from './consultas'
import { Marca } from '@/components/marca'
import { fechaLarga, mesCorto, cifra, porcentaje } from '@/lib/formato'
import { BotonImprimir } from './imprimir'
import './informe.css'

export const metadata: Metadata = { title: 'Informe de gestión' }

export default async function Informe({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>
}) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')
  const sesion = await leerSesion()
  if (!sesion) redirect('/entrar')
  if (sesion.tenantId !== tenant.id) redirect('/entrar')

  const { meses: crudo } = await searchParams
  const meses = [3, 6, 12, 24].includes(Number(crudo)) ? Number(crudo) : 12

  const d = await datosDelInforme(tenant.id, meses)
  const cumplimiento = d.totales.capturadas
    ? Math.round((d.totales.resueltas / d.totales.capturadas) * 100)
    : 0
  const mejora =
    d.mediana !== null && d.medianaPrevia !== null ? d.medianaPrevia - d.mediana : null

  return (
    <>
      <nav className="sin-imprimir sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--color-borde)] bg-[var(--color-superficie)] px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="boton boton-llano !h-8 text-[var(--text-menuda)]">
            ← Volver
          </Link>
          <span className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Informe de los últimos {meses} meses
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {[3, 6, 12, 24].map((m) => (
            <Link
              key={m}
              href={`/informe?meses=${m}`}
              className={`boton !h-8 text-[var(--text-menuda)] ${
                m === meses ? 'boton-primario' : 'boton-neutro'
              }`}
            >
              {m} meses
            </Link>
          ))}
          <BotonImprimir />
        </div>
      </nav>

      <main className="hoja">
        {/* --- Portada ---------------------------------------------- */}
        <header className="portada">
          <Marca />
          <p className="rotulo mt-12">Informe de gestión social</p>
          <h1 className="titulo-informe">{tenant.nombre}</h1>
          <p className="subtitulo-informe">
            Periodo del {fechaLarga(d.periodo.desde)} al {fechaLarga(d.periodo.hasta)}
          </p>
          <dl className="datos-portada">
            <div>
              <dt>Generado</dt>
              <dd>{fechaLarga(new Date())}</dd>
            </div>
            <div>
              <dt>Por</dt>
              <dd>{sesion.nombre}</dd>
            </div>
          </dl>
        </header>

        {/* --- Resumen ---------------------------------------------- */}
        <section className="bloque">
          <h2>Resumen del periodo</h2>
          <p className="entrada">
            Durante el periodo se recibieron <strong>{cifra(d.totales.capturadas)}</strong>{' '}
            peticiones ciudadanas, de las cuales se resolvieron{' '}
            <strong>{cifra(d.totales.resueltas)}</strong> ({cumplimiento}%). La mediana de
            atención fue de <strong>{d.mediana !== null ? `${d.mediana.toFixed(1)} días` : '—'}</strong>
            {mejora !== null && mejora > 0 && (
              <>, {mejora.toFixed(1)} días menos que en el periodo anterior</>
            )}
            {mejora !== null && mejora <= 0 && (
              <>, {Math.abs(mejora).toFixed(1)} días más que en el periodo anterior</>
            )}
            . Quedan <strong>{cifra(d.totales.atoradas)}</strong> peticiones abiertas con más de
            treinta días.
          </p>

          <div className="cifras">
            <Cifra etiqueta="Peticiones recibidas" valor={cifra(d.totales.capturadas)} />
            <Cifra etiqueta="Resueltas" valor={`${cumplimiento}%`} />
            <Cifra
              etiqueta="Días para resolver"
              valor={d.mediana !== null ? d.mediana.toFixed(1) : '—'}
            />
            <Cifra etiqueta="Abiertas +30 días" valor={cifra(d.totales.atoradas)} alerta />
            <Cifra etiqueta="Ciudadanos atendidos" valor={cifra(d.totales.ciudadanos)} />
            <Cifra etiqueta="Actividades en territorio" valor={cifra(d.totales.actividades)} />
          </div>
        </section>

        {/* --- Demanda ---------------------------------------------- */}
        <section className="bloque">
          <h2>Demanda mes a mes</h2>
          <TablaMeses datos={d.porMes} />
        </section>

        {/* --- Problemáticas ---------------------------------------- */}
        <section className="bloque">
          <h2>Qué pidió la ciudadanía</h2>
          <table className="tabla-informe">
            <thead>
              <tr>
                <th>Problemática</th>
                <th className="n">Peticiones</th>
                <th className="n">Participación</th>
                <th className="n">Días para resolver</th>
              </tr>
            </thead>
            <tbody>
              {d.porProblematica.map((p) => (
                <tr key={p.etiqueta}>
                  <td>{p.etiqueta}</td>
                  <td className="n">{cifra(p.valor)}</td>
                  <td className="n">{porcentaje(p.valor, d.totales.capturadas)}</td>
                  <td className="n">{p.mediana !== null ? p.mediana.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* --- Dependencias ----------------------------------------- */}
        {d.porDependencia.length > 0 && (
          <section className="bloque">
            <h2>Atención por dependencia</h2>
            <table className="tabla-informe">
              <thead>
                <tr>
                  <th>Dependencia</th>
                  <th className="n">Turnadas</th>
                  <th className="n">Resueltas</th>
                  <th className="n">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {d.porDependencia.map((x) => (
                  <tr key={x.etiqueta}>
                    <td>{x.etiqueta}</td>
                    <td className="n">{cifra(x.valor)}</td>
                    <td className="n">{cifra(x.resueltas)}</td>
                    <td className="n">{porcentaje(x.resueltas, x.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* --- Territorio ------------------------------------------- */}
        <section className="bloque">
          <h2>Dónde se concentró la demanda</h2>
          <table className="tabla-informe">
            <thead>
              <tr>
                <th>Colonia</th>
                <th className="n">Peticiones</th>
                <th className="n">Participación</th>
              </tr>
            </thead>
            <tbody>
              {d.porColonia.map((c) => (
                <tr key={c.etiqueta}>
                  <td>{c.etiqueta}</td>
                  <td className="n">{cifra(c.valor)}</td>
                  <td className="n">{porcentaje(c.valor, d.totales.capturadas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* --- Equipo ----------------------------------------------- */}
        {d.responsables.length > 0 && (
          <section className="bloque">
            <h2>Desempeño del equipo</h2>
            <table className="tabla-informe">
              <thead>
                <tr>
                  <th>Responsable</th>
                  <th className="n">Asignadas</th>
                  <th className="n">Resueltas</th>
                  <th className="n">Cumplimiento</th>
                  <th className="n">Días</th>
                </tr>
              </thead>
              <tbody>
                {d.responsables.map((r) => (
                  <tr key={r.nombre}>
                    <td>{r.nombre}</td>
                    <td className="n">{cifra(r.asignadas)}</td>
                    <td className="n">{cifra(r.resueltas)}</td>
                    <td className="n">{porcentaje(r.resueltas, r.asignadas)}</td>
                    <td className="n">{r.mediana !== null ? r.mediana.toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="pie-informe">
          <p>
            {tenant.nombre} · Informe generado el {fechaLarga(new Date())} desde INPOL.
          </p>
          <p>
            Documento de uso interno. Contiene información derivada de datos personales de
            ciudadanos; su difusión está sujeta a la normativa de protección de datos.
          </p>
        </footer>
      </main>
    </>
  )
}

function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div className="cifra-informe">
      <p className="rotulo">{etiqueta}</p>
      <p className={`valor ${alerta ? 'valor-alerta' : ''}`}>{valor}</p>
    </div>
  )
}

/** Tabla con barra embebida: en papel se lee igual que en pantalla. */
function TablaMeses({ datos }: { datos: { etiqueta: string; recibidas: number; resueltas: number }[] }) {
  const maximo = Math.max(...datos.map((m) => Math.max(m.recibidas, m.resueltas)), 1)

  return (
    <table className="tabla-informe">
      <thead>
        <tr>
          <th>Mes</th>
          <th className="n">Recibidas</th>
          <th className="n">Resueltas</th>
          <th style={{ width: '42%' }}>Comparativo</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((m) => (
          <tr key={m.etiqueta}>
            <td className="mes">{mesCorto(m.etiqueta)}</td>
            <td className="n">{cifra(m.recibidas)}</td>
            <td className="n">{cifra(m.resueltas)}</td>
            <td>
              <span className="barras">
                <span className="barra barra-recibidas" style={{ width: `${(m.recibidas / maximo) * 100}%` }} />
                <span className="barra barra-resueltas" style={{ width: `${(m.resueltas / maximo) * 100}%` }} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}


