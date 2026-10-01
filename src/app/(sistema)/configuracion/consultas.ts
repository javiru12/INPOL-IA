import { conTenant, sinTenant } from '@/lib/db'
import {
  CATALOGOS,
  CLAVES_CATALOGO,
  columnaNombre,
  type ClaveCatalogo,
} from './catalogo'

export type Perfil = { clave: string; nombre: string; descripcion: string | null }

/** Catálogo global de perfiles: es el mismo para todos los clientes. */
export function perfilesActivos() {
  return sinTenant<Perfil[]>`
    select clave, nombre, descripcion
    from perfiles
    where activo
    order by orden`
}

// --- Usuarios -----------------------------------------------------------

export type FilaUsuario = {
  id: string
  nombre: string | null
  correo: string
  perfil_clave: string
  puesto: string | null
  telefono_movil: string | null
  ultimo_acceso: string | null
  activo: boolean
}

export function listarUsuarios(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx<FilaUsuario[]>`
      select u.id,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno, u.apellido_materno)), '')
               as nombre,
             u.correo, u.perfil_clave, u.puesto, u.telefono_movil,
             u.ultimo_acceso::text as ultimo_acceso,
             u.activo
      from usuarios u
      order by u.activo desc, u.nombre, u.apellido_paterno`,
  )
}

export type Usuario = {
  id: string
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  correo: string
  perfil_clave: string
  puesto: string | null
  telefono_movil: string | null
  telefono_fijo: string | null
  ultimo_acceso: string | null
  creado_en: string | null
  activo: boolean
}

export async function usuarioPorId(tenantId: string, id: string) {
  const [u] = await conTenant(tenantId, (tx) =>
    tx<Usuario[]>`
      select id, nombre, apellido_paterno, apellido_materno, correo, perfil_clave,
             puesto, telefono_movil, telefono_fijo,
             ultimo_acceso::text as ultimo_acceso,
             creado_en::text as creado_en,
             activo
      from usuarios
      where id = ${id}`,
  )
  return u ?? null
}

/** Cuántos Súper Administradores activos quedan. Nunca puede llegar a cero. */
export async function superAdministradoresActivos(tenantId: string) {
  const [{ total }] = await conTenant(tenantId, (tx) =>
    tx<{ total: number }[]>`
      select count(*)::int as total
      from usuarios
      where perfil_clave = 'super_admin' and activo`,
  )
  return total
}

// --- Campañas y candidatos ---------------------------------------------

export type FilaCampania = {
  id: string
  nombre: string
  tipo: string | null
  fecha_inicia: string | null
  fecha_termina: string | null
  fecha_jornada: string | null
  responsable: string | null
  candidatos: number
  activo: boolean
}

export function listarCampanias(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx<FilaCampania[]>`
      select c.id, c.nombre, c.tipo,
             c.fecha_inicia::text as fecha_inicia,
             c.fecha_termina::text as fecha_termina,
             c.fecha_jornada::text as fecha_jornada,
             nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as responsable,
             (select count(*)::int from candidatos k
               where k.campania_id = c.id and k.activo) as candidatos,
             c.activo
      from campanias c
      left join usuarios u on u.id = c.responsable_id
      order by c.activo desc, c.fecha_jornada desc nulls last, c.nombre`,
  )
}

export type Campania = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: string | null
  fecha_inicia: string | null
  fecha_termina: string | null
  fecha_jornada: string | null
  responsable_id: string | null
  activo: boolean
}

export type Candidato = {
  id: string
  nombre: string
  cargo: string | null
  partido: string | null
  activo: boolean
}

export async function campaniaPorId(tenantId: string, id: string) {
  return conTenant(tenantId, async (tx) => {
    const [campania] = await tx<Campania[]>`
      select id, nombre, descripcion, tipo,
             fecha_inicia::text as fecha_inicia,
             fecha_termina::text as fecha_termina,
             fecha_jornada::text as fecha_jornada,
             responsable_id, activo
      from campanias
      where id = ${id}`

    if (!campania) return null

    const candidatos = await tx<Candidato[]>`
      select id, nombre, cargo, partido, activo
      from candidatos
      where campania_id = ${id}
      order by activo desc, nombre`

    return { campania, candidatos }
  })
}

export type Responsable = { id: string; nombre: string }

/** Quién puede quedar como responsable de una campaña: alguien que entra. */
export function responsablesPosibles(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx<Responsable[]>`
      select id,
             trim(concat_ws(' ', nombre, apellido_paterno)) as nombre
      from usuarios
      where activo
      order by nombre, apellido_paterno`,
  )
}

/**
 * Tipos de campaña ofrecidos. Salen del catálogo `tipos_campania` y de lo
 * que ya se haya escrito antes: la columna es texto libre, así que lo
 * honesto es sugerir sin obligar.
 */
export async function tiposCampania(tenantId: string) {
  const filas = await conTenant(tenantId, (tx) =>
    tx<{ tipo: string }[]>`
      select descripcion as tipo from tipos_campania where activo
      union
      select distinct tipo from campanias where tipo is not null and trim(tipo) <> ''
      order by tipo`,
  )
  return filas.map((f) => f.tipo)
}

// --- Catálogos de la operación -----------------------------------------

export type FilaCatalogo = {
  id: string
  activo: boolean
  usos: number
  padre: string | null
} & Record<string, string | boolean | number | null>

/**
 * Una sola consulta sirve a los seis catálogos: la tabla y las columnas
 * salen de `CATALOGOS`, nunca de la URL, y postgres.js las escapa como
 * identificadores.
 *
 * `usos` cuenta las peticiones que apuntan al registro. Sin ese número,
 * desactivar un término es una decisión a ciegas.
 */
export function listarCatalogo(tenantId: string, clave: ClaveCatalogo) {
  const def = CATALOGOS[clave]
  const columnas = ['id', 'activo', ...def.campos.map((c) => c.nombre)]
  const orden = columnaNombre(def)

  return conTenant(tenantId, async (tx) => {
    // La sub-problemática es la única que cuelga de otra: trae el nombre
    // de su problemática para que la tabla no sea una lista de huérfanas.
    if (clave === 'subproblematicas') {
      return tx<FilaCatalogo[]>`
        select ${tx(columnas)},
               (select count(*)::int from peticiones p
                 where p.subproblematica_id = t.id) as usos,
               (select titulo from problematicas m where m.id = t.problematica_id) as padre
        from subproblematicas t
        order by t.activo desc, t.titulo`
    }

    return tx<FilaCatalogo[]>`
      select ${tx(columnas)},
             (select count(*)::int from peticiones p
               where p.${tx(def.columnaUso)} = t.id) as usos,
             null::text as padre
      from ${tx(def.tabla)} t
      order by t.activo desc, t.${tx(orden)}`
  })
}

/** Para el selector de «a qué problemática pertenece». */
export function problematicasVigentes(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx<{ id: string; titulo: string }[]>`
      select id, titulo from problematicas where activo order by titulo`,
  )
}

// --- Resumen de la pantalla --------------------------------------------

export type Resumen = {
  usuariosActivos: number
  usuariosTotales: number
  superAdmins: number
  campaniasActivas: number
}

export function resumenConfiguracion(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const [fila] = await tx<Resumen[]>`
      select
        (select count(*)::int from usuarios where activo) as "usuariosActivos",
        (select count(*)::int from usuarios) as "usuariosTotales",
        (select count(*)::int from usuarios
          where activo and perfil_clave = 'super_admin') as "superAdmins",
        (select count(*)::int from campanias where activo) as "campaniasActivas"`
    return fila
  })
}

/** Cuántos registros activos tiene cada catálogo, para las pestañas. */
export function conteosCatalogos(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const pares = await Promise.all(
      CLAVES_CATALOGO.map(async (clave) => {
        const [{ total }] = await tx<{ total: number }[]>`
          select count(*)::int as total
          from ${tx(CATALOGOS[clave].tabla)}
          where activo`
        return [clave, total] as const
      }),
    )
    return Object.fromEntries(pares) as Record<ClaveCatalogo, number>
  })
}

// --- Datos del cliente --------------------------------------------------

export type DatosCliente = {
  clave: string
  nombre: string
  nombre_corto: string | null
  color_acento: string | null
  licencia_inicia: string | null
  licencia_vence: string | null
}

/**
 * La fila del cliente, completa.
 *
 * `tenantDeLaPeticion()` no trae la fecha de inicio de la licencia porque
 * ninguna otra pantalla la necesita; el formulario sí, y publicar un campo
 * vacío lo borraría al guardar.
 */
export async function datosDelCliente(tenantId: string) {
  const [t] = await conTenant(tenantId, (tx) =>
    tx<DatosCliente[]>`
      select clave, nombre, nombre_corto, color_acento,
             licencia_inicia::text as licencia_inicia,
             licencia_vence::text as licencia_vence
      from tenants
      where id = ${tenantId}`,
  )
  return t ?? null
}
