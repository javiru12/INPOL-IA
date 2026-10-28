'use client'

import { useRef, useState } from 'react'
import {
  analizarArchivo,
  abrirImportacion,
  cargarLote,
  cerrarImportacion,
  type Analisis,
} from './acciones'
import { DESTINOS, destinoPorClave, proponerMapeo } from './destinos'
import { leerCabecera, recorrer, formatoDe, type Cabecera } from '@/lib/leer-tabla-cliente'
import { Tabla } from '@/components/tabla'

/**
 * Subir un archivo y decir a dónde va.
 *
 * Son dos pasos a propósito. Cargar a ciegas y enterarse después de que
 * la columna «teléfono» era la del patrón y no la de la persona
 * significa deshacer a mano miles de filas. Primero se enseña qué
 * entendió el sistema; solo entonces se carga.
 *
 * Para CSV y DBF el archivo NO sube. Lo lee este lado por rebanadas y
 * manda lotes de filas, porque el cuerpo de una petición se corta en
 * 4.5 MB y un padrón de dos gigas no cabe ni de lejos. El .xlsx sí
 * viaja entero: es un zip que hay que descomprimir completo antes de
 * leer una sola fila, y una hoja de Excel no pasa de un millón de
 * renglones, así que nunca llega a ese tamaño.
 */

const TOPE_XLSX = 8 * 1024 * 1024

/**
 * Cuántas filas van por petición.
 *
 * Hay dos fuerzas opuestas y las dos se midieron.
 *
 * Lotes más grandes van más rápido: con cinco mil filas por lote,
 * veinte mil tardaban siete segundos en producción, y bajarlas a un
 * solo lote de veinte mil las dejó en 3.8. El costo está en cada
 * llamada —una función sin servidor levanta conexión nueva a la base
 * cada vez— y eso se paga entero por invocación, no por fila.
 *
 * Pero pasado cierto punto la acción de servidor revienta con «The
 * destination stream closed early»: un lote de cuarenta mil filas, que
 * son 1.8 MB, falla de inmediato. Así que se apunta a 800 KB por
 * petición, que es el tamaño con el que se comprobó que aguanta, y el
 * número de filas sale del ancho real de las del archivo, porque un
 * padrón de tres columnas y uno de veinticinco no pesan igual.
 */
function filasPorLote(muestra: string[][]) {
  const bytes = muestra.length
    ? JSON.stringify(muestra).length / muestra.length
    : 200
  return Math.max(500, Math.min(15000, Math.floor((800 * 1024) / bytes)))
}

type Avance = {
  filas: number
  cargadas: number
  rechazadas: number
  porcentaje: number
  motivos: Record<string, number>
}

export function FormaImportar() {
  const [destino, setDestino] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cabecera, setCabecera] = useState<Cabecera | null>(null)
  const [mapeo, setMapeo] = useState<Record<string, number>>({})
  const [avisos, setAvisos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [avance, setAvance] = useState<Avance | null>(null)
  const [terminado, setTerminado] = useState<Avance | null>(null)
  const cancelar = useRef(false)

  const d = destinoPorClave(destino)

  async function revisar() {
    setError(null)
    setAvisos([])
    setCabecera(null)
    if (!d) return setError('Elige primero qué tipo de datos trae el archivo.')
    if (!archivo) return setError('Falta el archivo.')

    const formato = formatoDe(archivo.name)
    if (!formato) return setError('Solo se aceptan archivos .csv, .dbf y .xlsx.')
    if (formato === 'xlsx' && archivo.size > TOPE_XLSX) {
      return setError(
        `Este Excel pesa ${(archivo.size / 1024 ** 2).toFixed(1)} MB y por ser Excel tiene que ` +
          `viajar entero, con tope de ${TOPE_XLSX / 1024 ** 2} MB. Guárdalo como CSV y súbelo así: ` +
          'en CSV no hay tope porque se lee aquí mismo.',
      )
    }

    setLeyendo(true)
    try {
      if (formato === 'xlsx') {
        // El servidor ya sabe leer xlsx; se manda y devuelve lo mismo.
        const datos = new FormData()
        datos.set('destino', destino)
        datos.set('archivo', archivo)
        const r: Analisis = await analizarArchivo({}, datos)
        if (r.error) return setError(r.error)
        setCabecera({
          formato,
          encabezados: r.encabezados ?? [],
          muestra: r.muestra ?? [],
          filasEstimadas: r.totalFilas ?? 0,
          exacto: true,
        })
        setMapeo(r.mapeo ?? {})
        setAvisos(r.avisos ?? [])
        return
      }

      const c = await leerCabecera(archivo)
      const m = proponerMapeo(d, c.encabezados)
      setCabecera(c)
      setMapeo(m)

      const faltan = d.campos
        .filter((x) => x.requerido && m[x.clave] === undefined)
        .map((x) => `«${x.etiqueta}»`)
      const sinUsar = c.encabezados.filter((_, i) => !Object.values(m).includes(i))
      setAvisos([
        ...(faltan.length ? [`No encontré columna para ${faltan.join(', ')}, que es obligatoria.`] : []),
        ...(sinUsar.length ? [`Estas columnas no se van a usar: ${sinUsar.join(', ')}.`] : []),
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude leer el archivo.')
    } finally {
      setLeyendo(false)
    }
  }

  async function cargar(datos: FormData) {
    setError(null)
    if (!d || !archivo || !cabecera) return

    const fuente = String(datos.get('fuente') ?? '')
    const baseLegal = String(datos.get('baseLegal') ?? '')

    for (const c of d.campos) {
      if (c.requerido && mapeo[c.clave] === undefined) {
        return setError(`Falta decir qué columna trae «${c.etiqueta}».`)
      }
    }

    const abierta = await abrirImportacion({
      destino,
      archivo: archivo.name,
      bytes: archivo.size,
      filasEstimadas: cabecera.filasEstimadas,
      fuente,
      baseLegal,
    })
    if (abierta.error || !abierta.id) return setError(abierta.error ?? 'No se pudo abrir la carga.')

    cancelar.current = false
    const acumulado: Avance = { filas: 0, cargadas: 0, rechazadas: 0, porcentaje: 0, motivos: {} }
    setAvance({ ...acumulado })

    try {
      if (cabecera.formato === 'xlsx') {
        // Ya está en el servidor; se recorre allá en una sola pasada.
        const f = new FormData()
        f.set('destino', destino)
        f.set('archivo', archivo)
        f.set('fuente', fuente)
        f.set('baseLegal', baseLegal)
        for (const [k, v] of Object.entries(mapeo)) f.set(`col_${k}`, String(v))
        const { importar } = await import('./acciones')
        const r = await importar({}, f)
        await cerrarImportacion(abierta.id, r.error ? 'fallida' : 'completada')
        if (r.error) return setError(r.error)
        setTerminado({
          filas: (r.cargadas ?? 0) + (r.rechazadas ?? 0),
          cargadas: r.cargadas ?? 0,
          rechazadas: r.rechazadas ?? 0,
          porcentaje: 100,
          motivos: Object.fromEntries((r.motivos ?? []).map((m) => [m.motivo, m.cuantas])),
        })
        setAvance(null)
        return
      }

      const porLote = filasPorLote(cabecera.muestra)
      for await (const { filas, bytesLeidos } of recorrer(archivo, porLote)) {
        if (cancelar.current) {
          await cerrarImportacion(abierta.id, 'cancelada')
          setAvance(null)
          setError('Carga cancelada. Lo que ya entró se quedó.')
          return
        }

        // Se mandan solo las columnas que se van a usar, en el orden
        // de los campos del destino, y como una sola cadena.
        const proyectadas = filas.map((f) =>
          d.campos.map((c) => (mapeo[c.clave] === undefined ? '' : (f[mapeo[c.clave]] ?? ''))),
        )
        const r = await cargarLote(abierta.id, destino, JSON.stringify(proyectadas))
        if (r.error) {
          await cerrarImportacion(abierta.id, 'fallida')
          setAvance(null)
          return setError(r.error)
        }

        acumulado.filas += filas.length
        acumulado.cargadas += r.cargadas ?? 0
        acumulado.rechazadas += r.rechazadas ?? 0
        acumulado.porcentaje = Math.min(99, Math.round((bytesLeidos / archivo.size) * 100))
        for (const [m, n] of Object.entries(r.motivos ?? {})) {
          acumulado.motivos[m] = (acumulado.motivos[m] ?? 0) + n
        }
        setAvance({ ...acumulado, motivos: { ...acumulado.motivos } })
      }

      await cerrarImportacion(abierta.id, 'completada')
      setTerminado({ ...acumulado, porcentaje: 100 })
      setAvance(null)
    } catch (e) {
      await cerrarImportacion(abierta.id, 'fallida')
      setAvance(null)
      setError(e instanceof Error ? e.message : 'Se cortó la carga.')
    }
  }

  // ---- Cargando -----------------------------------------------------
  if (avance) {
    return (
      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">Cargando…</h2>
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--color-borde)]"
          role="progressbar"
          aria-valuenow={avance.porcentaje}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${avance.porcentaje}%`, background: 'var(--color-acento)' }}
          />
        </div>
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {avance.porcentaje}% · {avance.cargadas.toLocaleString('es-MX')} filas cargadas
          {avance.rechazadas > 0 && ` · ${avance.rechazadas.toLocaleString('es-MX')} fuera`}
        </p>
        <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          No cierres esta pestaña: el archivo se está leyendo desde aquí.
        </p>
        <button
          type="button"
          onClick={() => { cancelar.current = true }}
          className="boton boton-neutro"
        >
          Cancelar
        </button>
      </section>
    )
  }

  // ---- Terminado ----------------------------------------------------
  if (terminado) {
    return (
      <section className="panel space-y-2 px-4 py-4" style={{ borderColor: 'var(--color-exito)' }}>
        <h2 className="text-[var(--text-base)] font-semibold" style={{ color: 'var(--color-exito)' }}>
          Se cargaron {terminado.cargadas.toLocaleString('es-MX')} filas
        </h2>
        {terminado.rechazadas > 0 ? (
          <>
            <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {terminado.rechazadas.toLocaleString('es-MX')}{' '}
              {terminado.rechazadas === 1 ? 'se quedó fuera' : 'se quedaron fuera'}:
            </p>
            <ul className="space-y-0.5">
              {Object.entries(terminado.motivos).map(([m, n]) => (
                <li key={m} className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  · {m}: {n.toLocaleString('es-MX')}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            Ninguna fila se rechazó.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="boton boton-neutro"
        >
          Cargar otro archivo
        </button>
      </section>
    )
  }

  // ---- Captura ------------------------------------------------------
  // Los tres pasos se enseñan desde el principio, aunque dos estén
  // apagados: al abrir solo se veía «1 · Qué traes» y quien va a subir
  // un padrón entero no sabía si le faltaba un paso o siete.
  const paso = cabecera && d ? 2 : 1

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-[var(--text-menuda)]">
        {['Qué traes', 'Qué entendí', 'De dónde salió'].map((t, i) => {
          const n = i + 1
          const hecho = n < paso
          const aqui = n === paso
          return (
            <li key={t} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="w-6 border-t border-[var(--color-borde)]" />}
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[length:var(--text-micro)] font-semibold ${
                  aqui
                    ? 'bg-[var(--color-acento)] text-white'
                    : hecho
                      ? 'bg-[var(--color-exito-suave)] text-[var(--color-exito)]'
                      : 'bg-[var(--color-superficie-2)] text-[var(--color-tinta-3)] ring-1 ring-[var(--color-borde)]'
                }`}
              >
                {hecho ? '✓' : n}
              </span>
              <span className={aqui ? 'font-medium' : 'text-[var(--color-tinta-3)]'}>{t}</span>
            </li>
          )
        })}
      </ol>

      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">1 · Qué traes</h2>

        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Tipo de datos
          </span>
          <select
            name="destino"
            value={destino}
            onChange={(e) => { setDestino(e.target.value); setCabecera(null) }}
            className="campo"
          >
            <option value="">Elige qué trae el archivo…</option>
            {DESTINOS.map((x) => (
              <option key={x.clave} value={x.clave}>{x.etiqueta}</option>
            ))}
          </select>
        </label>

        {d && (
          <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">{d.descripcion}</p>
        )}

        {/* El control de archivo del navegador es gris, chico y dice
            «Sin archivos seleccionados». Es la acción más importante de
            la pantalla: merece sitio y aceptar que le arrastren encima. */}
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            const f = e.dataTransfer.files?.[0]
            if (f) { setArchivo(f); setCabecera(null) }
          }}
          className={`block cursor-pointer rounded-[var(--radius-md)] border border-dashed px-4 py-7 text-center transition-colors ${
            arrastrando
              ? 'border-[var(--color-acento)] bg-[var(--color-acento-suave)]'
              : 'border-[var(--color-borde-fuerte)] hover:border-[var(--color-acento-borde)] hover:bg-[var(--color-superficie-2)]'
          }`}
        >
          <input
            type="file"
            name="archivo"
            accept=".xlsx,.csv,.txt,.dbf"
            onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setCabecera(null) }}
            className="sr-only"
          />
          {archivo ? (
            <>
              <p className="font-medium">{archivo.name}</p>
              <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                {(archivo.size / 1024 ** 2).toFixed(1)} MB · elige otro si te equivocaste
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Arrastra el archivo aquí o haz clic para buscarlo</p>
              <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
                CSV o DBF sin límite de tamaño · Excel hasta {TOPE_XLSX / 1024 ** 2} MB
              </p>
            </>
          )}
        </label>

        <button
          type="button"
          onClick={revisar}
          disabled={leyendo || !archivo || !destino}
          className="boton boton-neutro"
        >
          {leyendo ? 'Leyendo…' : 'Revisar el archivo'}
        </button>

        {error && (
          <p className="text-[var(--text-menuda)]" style={{ color: 'var(--color-alerta)' }}>
            {error}
          </p>
        )}
      </section>

      {cabecera && d && (
        <form action={cargar} className="panel space-y-3 px-4 py-4">
          <div>
            <h2 className="text-[var(--text-base)] font-semibold">2 · Qué entendí</h2>
            <p className="mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
              {cabecera.exacto ? '' : 'Alrededor de '}
              {cabecera.filasEstimadas.toLocaleString('es-MX')} filas. Revisa que cada campo tome
              la columna correcta.
            </p>
          </div>

          {avisos.map((a) => (
            <p
              key={a}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-menuda)]"
              style={{ background: 'var(--color-aviso-suave)', color: 'var(--color-aviso)' }}
            >
              {a}
            </p>
          ))}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.campos.map((c) => {
              // El primer valor real de la columna elegida. Es lo único
              // que deja cachar que «TEL_CEL» acabó en el campo de CURP
              // antes de cargar el archivo entero.
              const col = mapeo[c.clave]
              const ejemplo =
                col === undefined
                  ? null
                  : cabecera.muestra.map((f) => f[col]).find((v) => v && v.trim() !== '')
              return (
                <label key={c.clave} className="block">
                  <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                    {c.etiqueta}{' '}
                    {c.requerido && <span style={{ color: 'var(--color-alerta)' }}>*</span>}
                  </span>
                  <select
                    value={mapeo[c.clave] ?? ''}
                    onChange={(e) =>
                      setMapeo((m) => {
                        const n = { ...m }
                        if (e.target.value === '') delete n[c.clave]
                        else n[c.clave] = Number(e.target.value)
                        return n
                      })
                    }
                    className="campo"
                  >
                    <option value="">— no viene en el archivo —</option>
                    {cabecera.encabezados.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>{h}</option>
                    ))}
                  </select>
                  <span className="mt-1 block truncate text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                    {col === undefined
                      ? 'No se va a llenar'
                      : ejemplo
                        ? `Va a entrar: ${ejemplo}`
                        : 'Esa columna viene vacía en las primeras filas'}
                  </span>
                </label>
              )
            })}
          </div>

          {/* Abierto, no escondido tras un desplegable: es lo que deja
              ver que una columna cayó en el campo equivocado, y nadie
              abre un desplegable que no sabe que necesita. */}
          {cabecera.muestra.length > 0 && (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-borde)]">
              <p className="border-b border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-3 py-2 text-[var(--text-menuda)] font-medium">
                Las primeras filas de tu archivo, tal como vienen
              </p>
              <Tabla>
                <thead>
                  <tr>
                    {cabecera.encabezados.map((h, i) => <th key={`${h}-${i}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cabecera.muestra.map((f, i) => (
                    <tr key={i}>
                      {cabecera.encabezados.map((_, j) => (
                        <td key={j} className="whitespace-nowrap">
                          {f[j] || <span className="text-[var(--color-tinta-3)]">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}

          <h2 className="pt-1 text-[var(--text-base)] font-semibold">3 · De dónde salió</h2>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Fuente <span style={{ color: 'var(--color-alerta)' }}>*</span>
            </span>
            <input
              name="fuente"
              required
              placeholder="Padrón de la Secretaría de…, corte de octubre 2026"
              className="campo"
            />
            <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Queda guardado en cada fila, para saber después de qué corte salió cada dato.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Referencia <span className="font-normal text-[var(--color-tinta-3)]">(opcional)</span>
            </span>
            <input
              name="baseLegal"
              placeholder="Convenio SG/2026/014, oficio, acuerdo…"
              className="campo"
            />
            <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Si este archivo viene de un convenio u oficio, anótalo y se guarda junto a la carga.
            </span>
          </label>

          <button type="submit" className="boton boton-primario">
            Cargar los datos
          </button>
        </form>
      )}
    </div>
  )
}
