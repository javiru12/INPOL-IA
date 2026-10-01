'use server'

import { conTenant, sinTenant } from '@/lib/db'
import { tenantDeLaPeticion } from '@/lib/sesion'

export type Hallazgo = {
  tipo: 'ciudadano' | 'peticion' | 'seccion' | 'colonia'
  id: string
  titulo: string
  apoyo: string | null
  ruta: string
}

/**
 * Búsqueda transversal para el atajo de teclado.
 *
 * Devuelve pocos resultados de cada tipo en vez de muchos de uno: quien
 * busca «Mitras» puede estar buscando la colonia o a alguien que vive ahí,
 * y es más rápido enseñarle ambas cosas que hacerle elegir antes.
 */
export async function buscarEnTodo(termino: string): Promise<Hallazgo[]> {
  const q = termino.trim()
  if (q.length < 2) return []

  const tenant = await tenantDeLaPeticion()
  if (!tenant) return []

  const patron = `%${q}%`

  const [propios, secciones] = await Promise.all([
    conTenant(tenant.id, async (tx) => {
      const [ciudadanos, peticiones, colonias] = await Promise.all([
        tx<{ id: string; nombre: string; colonia: string | null; telefono: string | null }[]>`
          select id,
                 coalesce(nombre_completo, concat_ws(' ', nombre, apellido_paterno)) as nombre,
                 colonia, telefono_movil as telefono
          from ciudadanos
          where coalesce(nombre_completo, concat_ws(' ', nombre, apellido_paterno)) ilike ${patron}
             or telefono_movil ilike ${patron}
          order by nombre limit 5`,

        tx<{ id: string; folio: string; descripcion: string | null; problematica: string | null }[]>`
          select p.id,
                 upper(substr(p.id::text, 1, 6)) as folio,
                 p.descripcion,
                 pr.titulo as problematica
          from peticiones p
          left join problematicas pr on pr.id = p.problematica_id
          where p.descripcion ilike ${patron}
             or upper(substr(p.id::text, 1, 6)) like ${q.toUpperCase() + '%'}
          order by p.fecha_apertura desc limit 5`,

        tx<{ colonia: string; n: number }[]>`
          select colonia, count(*)::int as n
          from ciudadanos
          where colonia ilike ${patron}
          group by 1 order by 2 desc limit 3`,
      ])
      return { ciudadanos, peticiones, colonias }
    }),

    // Catálogo global: la geografía electoral no pertenece a un cliente.
    sinTenant<{ clave: string; municipio: string | null; lista_nominal: number | null }[]>`
      select s.clave, m.nombre as municipio, s.lista_nominal
      from secciones s
      left join municipios m on m.id = s.municipio_id
      where s.clave like ${q + '%'}
      order by s.clave limit 4`,
  ])

  const hallazgos: Hallazgo[] = []

  for (const c of propios.ciudadanos) {
    hallazgos.push({
      tipo: 'ciudadano',
      id: c.id,
      titulo: c.nombre,
      apoyo: [c.colonia, c.telefono].filter(Boolean).join(' · ') || null,
      ruta: `/ciudadanos/${c.id}`,
    })
  }

  for (const p of propios.peticiones) {
    hallazgos.push({
      tipo: 'peticion',
      id: p.id,
      titulo: p.descripcion?.slice(0, 80) ?? `Petición ${p.folio}`,
      apoyo: [p.folio, p.problematica].filter(Boolean).join(' · '),
      ruta: `/peticiones/${p.id}`,
    })
  }

  for (const c of propios.colonias) {
    hallazgos.push({
      tipo: 'colonia',
      id: c.colonia,
      titulo: c.colonia,
      apoyo: `${c.n} ${c.n === 1 ? 'ciudadano' : 'ciudadanos'}`,
      ruta: `/ciudadanos?colonia=${encodeURIComponent(c.colonia)}`,
    })
  }

  for (const s of secciones) {
    hallazgos.push({
      tipo: 'seccion',
      id: s.clave,
      titulo: `Sección ${s.clave}`,
      apoyo: [s.municipio, s.lista_nominal ? `${s.lista_nominal.toLocaleString('es-MX')} electores` : null]
        .filter(Boolean)
        .join(' · '),
      ruta: `/territorio?q=${s.clave}`,
    })
  }

  return hallazgos
}
