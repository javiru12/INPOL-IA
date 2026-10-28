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

  const rechazos = new Map<string, number>()
  const rechazar = (motivo: string) => rechazos.set(motivo, (rechazos.get(motivo) ?? 0) + 1)

  const registros: Record<string, string | null>[] = []
  for (const fila of tabla.filas) {
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
        const v = /^\d{4}-\d{2}-\d{2}$/.test(bruto)
          ? bruto
          : (/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto)
              ? `${RegExp.$3}-${RegExp.$2}-${RegExp.$1}`
              : null)
        if (!v) { rechazar(`${c.etiqueta} no es una fecha`); valida = false; break }
        r[c.clave] = v
      } else r[c.clave] = bruto
    }
    if (valida) registros.push(r)
  }

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

    for (let i = 0; i < registros.length; i += 300) {
      const tanda = registros.slice(i, i + 300)
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
