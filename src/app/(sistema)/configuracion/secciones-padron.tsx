import Link from 'next/link'
import { conTenant } from '@/lib/db'
import { Indicador, Vacio, Distintivo } from '@/components/pagina'
import { Tabla } from '@/components/tabla'
import { ORIGENES, TONO_ORIGEN, etiquetaOrigen } from '@/lib/origenes'
import { cifra } from '@/lib/formato'

/**
 * Ciudadanos y Movilizadores, administrados desde Configuración.
 *
 * El padrón ya se trabaja en su propia pantalla, pero desde ahí se
 * llega buscando a alguien. Aquí se ve el catálogo como catálogo: de
 * dónde viene cada ficha y cuánto hay de cada cosa, que es lo que
 * necesita quien lo administra y no quien atiende a una persona.
 */
export async function SeccionCiudadanos({ tenantId }: { tenantId: string }) {
  const [resumen, porOrigen] = await conTenant(tenantId, async (tx) => [
    (
      await tx<{ total: number; con_curp: number; sin_peticiones: number; con_telefono: number }[]>`
        select count(*)::int as total,
               count(*) filter (where curp is not null)::int as con_curp,
               count(*) filter (where numero_peticiones = 0 or numero_peticiones is null)::int
                 as sin_peticiones,
               count(*) filter (where nullif(trim(telefono_movil), '') is not null)::int
                 as con_telefono
        from ciudadanos where activo`
    )[0],
    await tx<{ origen: string; n: number }[]>`
      select coalesce(origen, 'captura') as origen, count(*)::int as n
      from ciudadanos where activo group by 1 order by 2 desc`,
  ])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          El padrón se puede trabajar directo, sin pasar por una petición.
        </p>
        <div className="flex gap-2">
          <Link href="/ciudadanos/nuevo" className="boton boton-primario">
            Dar de alta a alguien
          </Link>
          <Link href="/ciudadanos" className="boton boton-neutro">
            Abrir el padrón
          </Link>
        </div>
      </div>

      <div className="franja">
        <Indicador etiqueta="En el padrón" valor={resumen.total} pie="Fichas activas" />
        <Indicador
          etiqueta="Sin ninguna petición"
          valor={resumen.sin_peticiones}
          pie="Están por afiliación o captura directa"
        />
        <Indicador
          etiqueta="Con teléfono"
          valor={resumen.con_telefono}
          tono="dato"
          pie="Con quién se puede hablar"
        />
        <Indicador
          etiqueta="Con CURP"
          valor={resumen.con_curp}
          tono={resumen.con_curp > 0 ? 'exito' : 'neutro'}
          pie="Se pueden cruzar con padrones externos"
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--color-borde)] px-4 py-3">
          <h3 className="text-[var(--text-base)] font-semibold">De dónde viene cada ficha</h3>
          <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Una ficha capturada en campo y una que llegó sola por la app no se verifican
            igual. Sin distinguirlas, el conteo de afiliación no se puede auditar.
          </p>
        </div>
        <Tabla>
          <thead>
            <tr>
              <th>Origen</th>
              <th>Qué significa</th>
              <th className="num">Fichas</th>
              <th className="num">Del padrón</th>
            </tr>
          </thead>
          <tbody>
            {ORIGENES.map((o) => {
              const n = porOrigen.find((x) => x.origen === o.clave)?.n ?? 0
              return (
                <tr key={o.clave}>
                  <td>
                    <Link
                      href={`/ciudadanos?origen=${o.clave}`}
                      className="hover:text-[var(--color-acento-fuerte)]"
                    >
                      <Distintivo tono={TONO_ORIGEN[o.clave] ?? 'neutro'}>
                        {o.etiqueta}
                      </Distintivo>
                    </Link>
                  </td>
                  <td className="w-full max-w-0 text-[var(--color-tinta-2)]">
                    <span className="block truncate">{o.ayuda}</span>
                  </td>
                  <td className="num font-medium">{cifra(n)}</td>
                  <td className="num text-[var(--color-tinta-2)]">
                    {resumen.total ? `${((n / resumen.total) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Tabla>
      </section>
    </div>
  )
}

/**
 * Los movilizadores son estructura de campaña, no usuarios del sistema:
 * no entran a ninguna pantalla. Por eso se administran aparte, aunque
 * tengan jerarquía propia igual que el organigrama.
 */
export async function SeccionMovilizadores({ tenantId }: { tenantId: string }) {
  const filas = await conTenant(tenantId, (tx) =>
    tx<{
      id: string
      nombre: string | null
      zona: string | null
      meta: number | null
      promovidos: number
      jefe: string | null
      tipo: string | null
    }[]>`
      -- El nombre y la zona salen del ciudadano, igual que en la ficha de
      -- Movilización: movilizadores.nombre y municipio_id vienen vacíos
      -- en toda la red, y esta pantalla los leía de ahí —por eso salían 40
      -- filas de «Sin nombre / Sin zona» que al abrirlas sí tenían datos.
      select m.id,
             coalesce(
               nullif(trim(c.nombre_completo), ''),
               nullif(trim(concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno)), '')
             ) as nombre,
             mu.nombre as zona,
             m.meta,
             (select count(*)::int from promovidos p
               where p.movilizador_id = m.id and p.activo) as promovidos,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as jefe,
             tm.descripcion as tipo
      from movilizadores m
      left join ciudadanos c on c.id = m.ciudadano_id
      left join secciones s on s.id = c.seccion_id
      left join municipios mu on mu.id = s.municipio_id
      left join tipos_movilizador tm on tm.id = m.tipo_movilizador_id
      -- responsable_id apunta a usuarios, no a movilizadores.
      left join usuarios u on u.id = m.responsable_id
      where m.activo
      order by 5 desc nulls last, 2`,
  )

  const conMeta = filas.filter((f) => (f.meta ?? 0) > 0).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Red de movilización: tiene su propia jerarquía y no entra al sistema.
        </p>
        <Link href="/movilizacion" className="boton boton-primario">
          Abrir Movilización
        </Link>
      </div>

      <div className="franja franja-3">
        <Indicador etiqueta="Movilizadores activos" valor={filas.length} pie="En la red" />
        <Indicador
          etiqueta="Con meta asignada"
          valor={conMeta}
          tono="dato"
          pie="El resto no tiene número que cumplir"
        />
        <Indicador
          etiqueta="Promovidos registrados"
          valor={filas.reduce((a, f) => a + f.promovidos, 0)}
          pie="Suma de toda la red"
        />
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay movilizadores"
          descripcion="La red se arma desde Movilización, dando de alta a quien se compromete a llevar gente a votar."
        />
      ) : (
        <section className="panel overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <th>Movilizador</th>
                <th>Zona</th>
                <th>Tipo</th>
                <th>Depende de</th>
                <th className="num">Meta</th>
                <th className="num">Promovidos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-medium">
                    <Link
                      href={`/movilizacion/${m.id}`}
                      className="hover:text-[var(--color-acento-fuerte)] hover:underline"
                    >
                      {m.nombre ?? 'Sin nombre'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {m.zona ?? <span className="text-[var(--color-tinta-3)]">Sin zona</span>}
                  </td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {m.tipo ?? <span className="text-[var(--color-tinta-3)]">Sin tipo</span>}
                  </td>
                  <td className="whitespace-nowrap text-[var(--color-tinta-2)]">
                    {m.jefe ?? <span className="text-[var(--color-tinta-3)]">Nadie</span>}
                  </td>
                  <td className="num">{cifra(m.meta)}</td>
                  <td className="num font-medium">{cifra(m.promovidos)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </section>
      )}
    </div>
  )
}
