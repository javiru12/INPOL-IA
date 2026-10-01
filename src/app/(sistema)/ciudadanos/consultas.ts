import 'server-only'
import { conTenant } from '@/lib/db'

export const POR_PAGINA = 25

/**
 * Rangos de edad del filtro. El último queda abierto por arriba con un
 * tope alto en vez de `is null`, para que el predicado sea uno solo.
 */
export const RANGOS_EDAD = {
  '18-29': [18, 29],
  '30-44': [30, 44],
  '45-59': [45, 59],
  '60+': [60, 130],
} as const

export type ClaveRangoEdad = keyof typeof RANGOS_EDAD

export type FiltrosCiudadanos = {
  q?: string
  colonia?: string
  sexo?: string
  edad?: string
  peticiones?: string
  pagina?: number
}

export type FilaCiudadano = {
  id: string
  nombre: string | null
  edad: number | null
  sexo: string | null
  colonia: string | null
  seccion: string | null
  telefono_movil: string | null
  peticiones: number
}

export type ResumenCiudadanos = {
  total: number
  conPeticiones: number
  mujeres: number
  hombres: number
}

const FEMENINO = ['F', 'FEMENINO', 'MUJER']
const MASCULINO = ['M', 'H', 'MASCULINO', 'HOMBRE']

/**
 * El padrón importado guarda el sexo como texto libre ('F', 'MUJER'…).
 * Si el valor no se reconoce se devuelve tal cual: más vale mostrar lo
 * que hay en la base que inventar una categoría.
 */
export function etiquetaSexo(sexo: string | null): string {
  const v = sexo?.trim()
  if (!v) return '—'
  if (FEMENINO.includes(v.toUpperCase())) return 'Mujer'
  if (MASCULINO.includes(v.toUpperCase())) return 'Hombre'
  return v
}

export async function listarCiudadanos(tenantId: string, f: FiltrosCiudadanos) {
  const pagina = Math.max(1, f.pagina ?? 1)
  const salto = (pagina - 1) * POR_PAGINA
  const rango = f.edad && f.edad in RANGOS_EDAD ? RANGOS_EDAD[f.edad as ClaveRangoEdad] : null
  const como = f.q ? `%${f.q}%` : null

  return conTenant(tenantId, async (tx) => {
    // `nombre_completo` llega nulo en parte del padrón importado: se arma
    // con las partes cuando falta. La misma expresión sirve para mostrar,
    // para buscar y para ordenar, así nunca se desalinean.
    const nombre = tx`nullif(trim(coalesce(c.nombre_completo,
      concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno))), '')`

    // La edad capturada manda; si falta, se deduce de la fecha de nacimiento.
    const edad = tx`coalesce(c.edad, extract(year from age(c.fecha_nacimiento))::int)`

    // Las peticiones se cuentan una sola vez, agregadas, no por fila.
    const desde = tx`
      from ciudadanos c
      left join secciones s on s.id = c.seccion_id
      left join (
        select ciudadano_id, count(*)::int as n
        from peticiones
        group by 1
      ) pe on pe.ciudadano_id = c.id`

    // Un solo predicado para las filas, el total y los indicadores: lo que
    // dice la cabecera y lo que se ve en la tabla no pueden contradecirse.
    const donde = tx`
      where (${como}::text is null or (
              ${nombre} ilike ${como}
              or c.colonia ilike ${como}
              or c.telefono_movil ilike ${como}))
        and (${f.colonia ?? null}::text is null or c.colonia = ${f.colonia ?? null})
        and (${f.sexo ?? null}::text is null
             or (${f.sexo ?? null}::text = 'mujer' and upper(trim(c.sexo)) = any(${FEMENINO}))
             or (${f.sexo ?? null}::text = 'hombre' and upper(trim(c.sexo)) = any(${MASCULINO})))
        and (${rango?.[0] ?? null}::int is null
             or ${edad} between ${rango?.[0] ?? null} and ${rango?.[1] ?? null})
        and (${f.peticiones ?? null}::text is null
             or (${f.peticiones ?? null}::text = 'con' and coalesce(pe.n, 0) > 0)
             or (${f.peticiones ?? null}::text = 'sin' and coalesce(pe.n, 0) = 0))`

    const [filas, [{ total }], [resumen], colonias] = await Promise.all([
      tx<FilaCiudadano[]>`
        select c.id,
               ${nombre} as nombre,
               ${edad} as edad,
               c.sexo,
               c.colonia,
               s.clave as seccion,
               c.telefono_movil,
               coalesce(pe.n, 0) as peticiones
        ${desde} ${donde}
        order by ${nombre} asc nulls last
        limit ${POR_PAGINA} offset ${salto}`,

      tx<{ total: number }[]>`select count(*)::int as total ${desde} ${donde}`,

      tx<ResumenCiudadanos[]>`
        select count(*)::int as total,
               count(*) filter (where coalesce(pe.n, 0) > 0)::int as "conPeticiones",
               count(*) filter (where upper(trim(c.sexo)) = any(${FEMENINO}))::int as mujeres,
               count(*) filter (where upper(trim(c.sexo)) = any(${MASCULINO}))::int as hombres
        ${desde} ${donde}`,

      tx<{ valor: string; etiqueta: string; conteo: number }[]>`
        select colonia as valor, colonia as etiqueta, count(*)::int as conteo
        from ciudadanos
        where colonia is not null
        group by 1, 2
        order by 3 desc, 1`,
    ])

    return {
      filas,
      total,
      pagina,
      colonias,
      resumen: resumen ?? { total: 0, conPeticiones: 0, mujeres: 0, hombres: 0 },
    }
  })
}

export type Ciudadano = {
  id: string
  nombre: string | null
  sexo: string | null
  edad: number | null
  fecha_nacimiento: string | null
  telefono_movil: string | null
  telefono_fijo: string | null
  correo: string | null
  calle: string | null
  numero_ext: string | null
  numero_int: string | null
  direccion: string | null
  colonia: string | null
  codigo_postal: string | null
  municipio: string | null
  seccion: string | null
}

export type PeticionDelCiudadano = {
  id: string
  folio: string
  problematica: string | null
  descripcion: string | null
  estatus: string | null
  fecha: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ficha de una persona con su historial. Devuelve null si el id no existe
 * o si pertenece a otro cliente: el RLS filtra la fila y aquí no se
 * distingue un caso del otro, que es justo lo que se quiere.
 */
export async function obtenerCiudadano(tenantId: string, id: string) {
  // Un id con otra forma nunca va a existir; se corta antes de que
  // Postgres falle al convertirlo a uuid.
  if (!UUID.test(id)) return null

  return conTenant(tenantId, async (tx) => {
    // Nota sobre `fecha_nacimiento`: es un `date`, y enviado como
    // '1975-02-13' se parsea en UTC, de modo que al formatearlo en hora de
    // México retrocede un día. Con la hora pegada se lee como medianoche
    // local y no se mueve. `fecha_apertura` es timestamptz y no sufre esto.
    const [ciudadano] = await tx<Ciudadano[]>`
      select c.id,
             nullif(trim(coalesce(c.nombre_completo,
               concat_ws(' ', c.nombre, c.apellido_paterno, c.apellido_materno))), '') as nombre,
             c.sexo,
             coalesce(c.edad, extract(year from age(c.fecha_nacimiento))::int) as edad,
             (c.fecha_nacimiento::text || 'T00:00:00') as fecha_nacimiento,
             c.telefono_movil,
             c.telefono_fijo,
             c.correo,
             c.calle,
             c.numero_ext,
             c.numero_int,
             c.direccion,
             c.colonia,
             c.codigo_postal,
             m.nombre as municipio,
             s.clave as seccion
      from ciudadanos c
      left join municipios m on m.id = c.municipio_id
      left join secciones s on s.id = c.seccion_id
      where c.id = ${id}`

    if (!ciudadano) return null

    const peticiones = await tx<PeticionDelCiudadano[]>`
      select p.id,
             upper(substr(p.id::text, 1, 6)) as folio,
             pr.titulo as problematica,
             p.descripcion,
             e.descripcion as estatus,
             p.fecha_apertura::text as fecha
      from peticiones p
      left join problematicas pr on pr.id = p.problematica_id
      left join estatus_peticiones e on e.id = p.estatus_id
      where p.ciudadano_id = ${id}
      order by p.fecha_apertura desc nulls last`

    return { ciudadano, peticiones }
  })
}
