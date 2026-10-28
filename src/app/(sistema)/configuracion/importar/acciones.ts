'use server'

import { revalidatePath } from 'next/cache'
import { conTenant } from '@/lib/db'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { puede } from '@/lib/permisos'
import { leerTabla, MAXIMO_FILAS } from '@/lib/leer-tabla'
import { destinoPorClave, proponerMapeo, type Destino } from './destinos'

export type Analisis = {
  error?: string
  encabezados?: string[]
  muestra?: string[][]
  totalFilas?: number
  mapeo?: Record<string, number>
  avisos?: string[]
}

const CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/

/** Primer paso: leer el archivo y proponer a qué campo va cada columna. */
export async function analizarArchivo(_previo: Analisis, datos: FormData): Promise<Analisis> {
  if (!(await puede('configuracion.importacion_de_datos'))) {
    return { error: 'Tu perfil no puede importar datos.' }
  }

  const destino = destinoPorClave(String(datos.get('destino') ?? ''))
  if (!destino) return { error: 'Elige primero qué tipo de datos trae el archivo.' }

  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Falta el archivo.' }

  try {
    const tabla = leerTabla(archivo.name, Buffer.from(await archivo.arrayBuffer()))
    if (tabla.filas.length === 0) return { error: 'El archivo no trae ninguna fila de datos.' }

    const mapeo = proponerMapeo(destino, tabla.encabezados)
    const avisos: string[] = []

    for (const c of destino.campos) {
      if (c.requerido && mapeo[c.clave] === undefined) {
        avisos.push(`No encontré una columna para «${c.etiqueta}», que es obligatoria.`)
      }
    }
    const sinUsar = tabla.encabezados.filter((_, i) => !Object.values(mapeo).includes(i))
    if (sinUsar.length) {
      avisos.push(`Estas columnas no se van a usar: ${sinUsar.join(', ')}.`)
    }
    if (tabla.totalFilas > MAXIMO_FILAS) {
      avisos.push(
        `El archivo trae ${tabla.totalFilas.toLocaleString('es-MX')} filas y por la web se ` +
          `cargan las primeras ${MAXIMO_FILAS.toLocaleString('es-MX')}.`,
      )
    }

    return {
      encabezados: tabla.encabezados,
      muestra: tabla.filas.slice(0, 5),
      totalFilas: tabla.totalFilas,
      mapeo,
      avisos,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No pude leer el archivo.' }
  }
}

export type Resultado = {
  error?: string
  ok?: boolean
  cargadas?: number
  rechazadas?: number
  motivos?: { motivo: string; cuantas: number }[]
}

/** Lo que de verdad entra a la base, ya con el mapeo confirmado. */
export async function importar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró.' }
  if (!(await puede('configuracion.importacion_de_datos'))) {
    return { error: 'Tu perfil no puede importar datos.' }
  }

  const destino = destinoPorClave(String(datos.get('destino') ?? ''))
  if (!destino) return { error: 'Destino desconocido.' }

  const archivo = datos.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Falta el archivo.' }

  const fuente = String(datos.get('fuente') ?? '').trim()
  if (fuente.length < 3) return { error: 'Di de dónde salió este archivo.' }

  const baseLegal = String(datos.get('baseLegal') ?? '').trim()
  if (destino.personal && baseLegal.length < 5) {
    return {
      error:
        'Este archivo trae datos personales. Escribe con qué autorización se tratan ' +
        '—convenio, acuerdo o la facultad legal que lo ampara— antes de cargarlo.',
    }
  }

  // El mapeo viaja como «campo:columna» por cada campo asignado.
  const mapeo: Record<string, number> = {}
  for (const c of destino.campos) {
    const v = datos.get(`col_${c.clave}`)
    if (typeof v === 'string' && v !== '') mapeo[c.clave] = Number(v)
  }
  for (const c of destino.campos) {
    if (c.requerido && mapeo[c.clave] === undefined) {
      return { error: `Falta decir qué columna trae «${c.etiqueta}».` }
    }
  }

  let tabla
  try {
    tabla = leerTabla(archivo.name, Buffer.from(await archivo.arrayBuffer()))
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No pude leer el archivo.' }
  }

  const { validas: registros, rechazos } = validar(destino, mapeo, tabla.filas)

  if (registros.length === 0) {
    return {
      error: 'Ninguna fila pasó la validación. Revisa el mapeo de columnas.',
      rechazadas: tabla.filas.length,
      motivos: [...rechazos].map(([motivo, cuantas]) => ({ motivo, cuantas })),
    }
  }

  const cargadas = await conTenant(tenant.id, async (tx) => {
    const marca = `${fuente}${baseLegal ? ` · ${baseLegal}` : ''}`
    let n = 0

    const porVez = porSentencia(destino)
    for (let i = 0; i < registros.length; i += porVez) {
      const tanda = registros.slice(i, i + porVez)
      n += await meter(tx, destino, tanda, tenant.id, tenant.estado_id, marca, sesion.usuarioId)
    }

    await tx`
      insert into importaciones
        (tenant_id, destino, archivo, bytes, fuente, base_legal,
         filas_leidas, filas_cargadas, filas_rechazadas, detalle, usuario_id)
      values (${tenant.id}, ${destino.clave}, ${archivo.name}, ${archivo.size},
              ${fuente}, ${baseLegal || null}, ${tabla.totalFilas}, ${n},
              ${tabla.filas.length - registros.length},
              ${tx.json({ motivos: [...rechazos] })}, ${sesion.usuarioId})`

    return n
  })

  revalidatePath('/configuracion')
  return {
    ok: true,
    cargadas,
    rechazadas: tabla.filas.length - registros.length,
    motivos: [...rechazos].map(([motivo, cuantas]) => ({ motivo, cuantas })),
  }
}

/**
 * Convierte filas crudas en registros listos, apartando las que no
 * pasan. Lo usan tanto la carga de un archivo chico como la de lotes,
 * para que una fila se rechace por la misma razón en los dos caminos.
 */
/**
 * Cuántos registros entran en una sentencia.
 *
 * El límite duro es el de parámetros del protocolo de Postgres, 65,535.
 * Se deja la mitad de margen y se divide entre las columnas del
 * destino, porque cada columna de cada fila es un parámetro.
 *
 * El número anterior era 300 fijo, y eso costaba caro en la nube: un
 * lote de cinco mil filas hacía diecisiete viajes de ida y vuelta a la
 * base, y a cien milisegundos cada uno eso era casi todo el tiempo de
 * la carga. De 300 a varios miles por sentencia, los viajes bajan en la
 * misma proporción.
 */
function porSentencia(destino: Destino) {
  return Math.max(200, Math.floor(30000 / Math.max(1, destino.campos.length)))
}

function validar(destino: Destino, mapeo: Record<string, number>, filas: string[][]) {
  const rechazos = new Map<string, number>()
  const rechazar = (motivo: string) => rechazos.set(motivo, (rechazos.get(motivo) ?? 0) + 1)
  const validas: Record<string, string | null>[] = []

  for (const fila of filas) {
    const r: Record<string, string | null> = {}
    let valida = true

    for (const c of destino.campos) {
      const i = mapeo[c.clave]
      const bruto = i === undefined ? '' : (fila[i] ?? '').trim()

      if (!bruto) {
        if (c.requerido) { rechazar(`Sin ${c.etiqueta}`); valida = false; break }
        r[c.clave] = null
        continue
      }
      if (c.tipo === 'curp') {
        const v = bruto.toUpperCase()
        if (!CURP.test(v)) { rechazar('CURP con estructura inválida'); valida = false; break }
        r[c.clave] = v
      } else if (c.tipo === 'numero') {
        const n = Number(bruto.replace(/[^0-9.\-]/g, ''))
        if (!Number.isFinite(n)) { rechazar(`${c.etiqueta} no es un número`); valida = false; break }
        r[c.clave] = String(n)
      } else if (c.tipo === 'fecha') {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : null
        const mx = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto)
        const v = iso ?? (mx ? `${mx[3]}-${mx[2]}-${mx[1]}` : null)
        if (!v) { rechazar(`${c.etiqueta} no es una fecha`); valida = false; break }
        r[c.clave] = v
      } else r[c.clave] = bruto
    }
    if (valida) validas.push(r)
  }
  return { validas, rechazos }
}

type Tx = Parameters<Parameters<typeof conTenant>[1]>[0]

/**
 * Mete una tanda en la tabla que toca.
 *
 * Cada destino tiene su propia forma de resolver claves ajenas —la
 * sección y el municipio llegan como clave de texto y en la base son
 * uuid— así que no hay un insert genérico que sirva para todos.
 */
async function meter(
  tx: Tx,
  destino: Destino,
  filas: Record<string, string | null>[],
  tenantId: string,
  estadoId: string | null,
  fuente: string,
  usuarioId: string,
): Promise<number> {
  if (destino.clave === 'ciudadanos') {
    let n = 0
    for (const f of filas) {
      const r = await tx`
        insert into ciudadanos
          (tenant_id, curp, nombre, apellido_paterno, apellido_materno, nombre_completo,
           telefono_movil, colonia, codigo_postal, fecha_nacimiento, sexo,
           estado_id, seccion_id, origen, creado_por)
        values (
          ${tenantId}, ${f.curp}, ${f.nombre}, ${f.apellido_paterno}, ${f.apellido_materno},
          ${[f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ') || null},
          ${f.telefono_movil}, ${f.colonia}, ${f.codigo_postal},
          ${f.fecha_nacimiento}::date, ${f.sexo}, ${estadoId}::uuid,
          (select id from secciones
            where estado_id = ${estadoId}::uuid and clave = ${f.seccion_clave} limit 1),
          'importado', ${usuarioId})
        on conflict (tenant_id, curp) where curp is not null do update set
          -- Lo que ya estaba capturado gana: una carga masiva no debe
          -- borrar lo que alguien verificó con la persona enfrente.
          nombre = coalesce(ciudadanos.nombre, excluded.nombre),
          apellido_paterno = coalesce(ciudadanos.apellido_paterno, excluded.apellido_paterno),
          apellido_materno = coalesce(ciudadanos.apellido_materno, excluded.apellido_materno),
          telefono_movil = coalesce(ciudadanos.telefono_movil, excluded.telefono_movil),
          colonia = coalesce(ciudadanos.colonia, excluded.colonia),
          codigo_postal = coalesce(ciudadanos.codigo_postal, excluded.codigo_postal),
          fecha_nacimiento = coalesce(ciudadanos.fecha_nacimiento, excluded.fecha_nacimiento),
          seccion_id = coalesce(ciudadanos.seccion_id, excluded.seccion_id),
          actualizado_en = now()`
      n += r.count
    }
    return n
  }

  if (destino.clave === 'ext_telefonos') {
    const r = await tx`
      insert into ext_telefonos ${tx(
        filas.map((f) => ({
          tenant_id: tenantId, curp: f.curp!, telefono: f.telefono!, tipo: f.tipo, fuente,
        })),
      )} on conflict do nothing`
    return r.count
  }

  if (destino.clave === 'ext_vehiculos') {
    const r = await tx`
      insert into ext_vehiculos ${tx(
        filas.map((f) => ({
          tenant_id: tenantId, curp: f.curp!, placa: f.placa, licencia: f.licencia,
          tipo_vehiculo: f.tipo_vehiculo,
          modelo: f.modelo === null ? null : Number(f.modelo),
          fuente,
        })),
      )} on conflict do nothing`
    return r.count
  }

  if (destino.clave === 'ext_buro_credito') {
    const r = await tx`
      insert into ext_buro_credito ${tx(
        filas.map((f) => ({
          tenant_id: tenantId, curp: f.curp!, nivel: f.nivel,
          score: f.score === null ? null : Number(f.score), fuente,
        })),
      )}
      on conflict (tenant_id, curp) do update set
        nivel = excluded.nivel, score = excluded.score,
        fuente = excluded.fuente, cargado_en = now()`
    return r.count
  }

  if (destino.clave === 'ext_curp_zona') {
    let n = 0
    for (const f of filas) {
      const r = await tx`
        insert into ext_curp_zona (tenant_id, curp, estado_id, municipio_id, seccion_id, fuente)
        values (${tenantId}, ${f.curp}, ${estadoId}::uuid,
          (select id from municipios
            where estado_id = ${estadoId}::uuid and clave = ${f.municipio_clave} limit 1),
          (select id from secciones
            where estado_id = ${estadoId}::uuid and clave = ${f.seccion_clave} limit 1),
          ${fuente})
        on conflict (tenant_id, curp) do update set
          municipio_id = excluded.municipio_id, seccion_id = excluded.seccion_id,
          fuente = excluded.fuente, cargado_en = now()`
      n += r.count
    }
    return n
  }

  if (destino.clave === 'ext_salario_region') {
    let n = 0
    for (const f of filas) {
      const r = await tx`
        insert into ext_salario_region
          (tenant_id, estado_id, distrito_id, municipio_id, salario_promedio, trabajadores, fuente)
        values (${tenantId}, ${estadoId}::uuid,
          (select id from distritos
            where estado_id = ${estadoId}::uuid and ambito = 'local'
              and clave = lpad(${f.distrito_clave}, 2, '0') limit 1),
          (select id from municipios
            where estado_id = ${estadoId}::uuid
              and clave = lpad(${f.municipio_clave}, 3, '0') limit 1),
          ${f.salario_promedio}::numeric,
          ${f.trabajadores === null ? null : Number(f.trabajadores)}, ${fuente})
        on conflict do nothing`
      n += r.count
    }
    return n
  }

  return 0
}

// ---------------------------------------------------------------------------
// Carga por lotes, para archivos que no caben en una petición
// ---------------------------------------------------------------------------

export type InicioLote = { error?: string; id?: string }

/**
 * Abre una importación y devuelve su folio.
 *
 * El archivo no sube: lo lee el navegador y manda las filas por tandas,
 * cada una contra este folio. Así el avance queda en la base y una
 * carga interrumpida se distingue de una terminada.
 */
export async function abrirImportacion(datos: {
  destino: string
  archivo: string
  bytes: number
  filasEstimadas: number
  fuente: string
  baseLegal: string
}): Promise<InicioLote> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró.' }
  if (!(await puede('configuracion.importacion_de_datos'))) {
    return { error: 'Tu perfil no puede importar datos.' }
  }

  const destino = destinoPorClave(datos.destino)
  if (!destino) return { error: 'Destino desconocido.' }
  if (datos.fuente.trim().length < 3) return { error: 'Di de dónde salió este archivo.' }
  if (destino.personal && datos.baseLegal.trim().length < 5) {
    return {
      error:
        'Este archivo trae datos personales. Escribe con qué autorización se tratan ' +
        '—convenio, acuerdo o la facultad legal que lo ampara— antes de cargarlo.',
    }
  }

  const [fila] = await conTenant(tenant.id, (tx) =>
    tx<{ id: string }[]>`
      insert into importaciones
        (tenant_id, destino, archivo, bytes, bytes_totales, fuente, base_legal,
         filas_totales, estado, usuario_id)
      values (${tenant.id}, ${destino.clave}, ${datos.archivo},
              ${Math.min(datos.bytes, 2147483647)}, ${datos.bytes},
              ${datos.fuente.trim()}, ${datos.baseLegal.trim() || null},
              ${datos.filasEstimadas}, 'en_curso', ${sesion.usuarioId})
      returning id`,
  )
  return { id: fila.id }
}

export type ResultadoLote = {
  error?: string
  cargadas?: number
  rechazadas?: number
  motivos?: Record<string, number>
}

/**
 * Una tanda de filas ya leídas por el navegador.
 *
 * Llega como una cadena y no como arreglo de arreglos por dos razones.
 * Next rechaza los arreglos anidados en una acción de servidor —«Maximum
 * array nesting exceeded»— y además el navegador manda solo las columnas
 * que de verdad se van a usar, en el orden de los campos del destino. En
 * un padrón de doce columnas de las que sirven tres, eso es la cuarta
 * parte del tráfico.
 */
export async function cargarLote(
  importacionId: string,
  destinoClave: string,
  loteJson: string,
): Promise<ResultadoLote> {
  const tenant = await tenantDeLaPeticion()
  const sesion = await leerSesion()
  if (!tenant || !sesion) return { error: 'La sesión expiró.' }
  if (!(await puede('configuracion.importacion_de_datos'))) {
    return { error: 'Tu perfil no puede importar datos.' }
  }

  const destino = destinoPorClave(destinoClave)
  if (!destino) return { error: 'Destino desconocido.' }

  let filas: string[][]
  try {
    filas = JSON.parse(loteJson)
    if (!Array.isArray(filas)) throw new Error('forma')
  } catch {
    return { error: 'El lote venía mal formado.' }
  }

  // El navegador ya proyectó las columnas al orden de los campos, así
  // que aquí el mapeo es la identidad.
  const mapeo = Object.fromEntries(destino.campos.map((c, i) => [c.clave, i]))
  const { validas, rechazos } = validar(destino, mapeo, filas)

  const cargadas = await conTenant(tenant.id, async (tx) => {
    // El folio tiene que ser de este cliente y estar vivo. Sin esto,
    // conocer un uuid bastaría para escribir en la carga de otro.
    const [imp] = await tx<{ id: string; fuente: string; base_legal: string | null }[]>`
      select id, fuente, base_legal from importaciones
      where id = ${importacionId} and estado = 'en_curso'`
    if (!imp) return -1

    const marca = `${imp.fuente}${imp.base_legal ? ` · ${imp.base_legal}` : ''}`
    let n = 0
    const porVez = porSentencia(destino)
    for (let i = 0; i < validas.length; i += porVez) {
      n += await meter(
        tx, destino, validas.slice(i, i + porVez),
        tenant.id, tenant.estado_id, marca, sesion.usuarioId,
      )
    }

    await tx`
      update importaciones set
        filas_leidas = filas_leidas + ${filas.length},
        filas_cargadas = filas_cargadas + ${n},
        filas_rechazadas = filas_rechazadas + ${filas.length - validas.length},
        lotes = lotes + 1
      where id = ${importacionId}`

    return n
  })

  if (cargadas < 0) return { error: 'Esa importación ya no está abierta.' }

  return {
    cargadas,
    rechazadas: filas.length - validas.length,
    motivos: Object.fromEntries(rechazos),
  }
}

/** Cierra la importación, haya terminado o la hayan cortado. */
export async function cerrarImportacion(
  importacionId: string,
  estado: 'completada' | 'cancelada' | 'fallida',
): Promise<void> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) return

  await conTenant(tenant.id, (tx) =>
    tx`update importaciones
       set estado = ${estado}, terminada_en = now()
       where id = ${importacionId} and estado = 'en_curso'`,
  )
  revalidatePath('/configuracion/importar')
}
