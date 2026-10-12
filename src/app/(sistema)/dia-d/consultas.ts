import 'server-only'
import { conTenant } from '@/lib/db'

/**
 * El tablero de la jornada electoral.
 *
 * Todo aquí está escrito para una sola pregunta, la que se hace el cuarto
 * de mando a las dos de la tarde: **¿a quién llamo ahora?** Por eso no hay
 * un solo número agregado sin su desglose de quién se está quedando corto:
 * saber que vas al 60% no sirve de nada si no sabes dónde está el 40%
 * restante mientras todavía se le puede marcar por teléfono.
 *
 * El dato no es el voto oficial —ese lo publica el INE horas después— sino
 * el promovido propio que ya acudió, marcado por quien está en la casilla.
 */

/** La jornada se mira en hora de México, no en la del servidor. */
const ZONA = 'America/Monterrey'

export type Jornada = {
  id: string
  nombre: string
  fecha: string
  hora_apertura: string
  hora_cierre: string
}

export type TotalesJornada = {
  comprometidos: number
  acudieron: number
  confirmados: number
  movilizadores: number
  secciones: number
}

export type TramoHorario = { etiqueta: string; valor: number; acumulado: number }

export type AvanceDistrito = {
  clave: string
  cabecera: string | null
  comprometidos: number
  acudieron: number
  avance: number
}

export type MovilizadorRezagado = {
  id: string
  nombre: string
  municipio: string | null
  seccion: string | null
  telefono: string | null
  comprometidos: number
  acudieron: number
  avance: number
}

export type Incidencia = {
  id: string
  tipo: string
  gravedad: string
  descripcion: string
  seccion: string | null
  casilla: string | null
  creada_en: string
  resuelta: boolean
}

export const ETIQUETA_TIPO: Record<string, string> = {
  apertura: 'Apertura',
  cierre: 'Cierre',
  material: 'Falta material',
  propaganda: 'Propaganda',
  intimidacion: 'Intimidación',
  acarreo: 'Acarreo',
  otro: 'Otro',
}

export async function jornadaActiva(tenantId: string): Promise<Jornada | null> {
  return conTenant(tenantId, async (tx) => {
    const [j] = await tx<Jornada[]>`
      select id, nombre, fecha::text, hora_apertura::text, hora_cierre::text
      from jornadas
      where activa
      limit 1`
    return j ?? null
  })
}

export async function tableroDeJornada(tenantId: string, jornadaId: string) {
  return conTenant(tenantId, async (tx) => {
    const [[totales], porHora, porDistrito, rezagados, incidencias] = await Promise.all([
      tx<TotalesJornada[]>`
        select count(*)::int as comprometidos,
               count(a.id)::int as acudieron,
               count(*) filter (where p.estado = 'confirmado')::int as confirmados,
               count(distinct p.movilizador_id)::int as movilizadores,
               count(distinct c.seccion_id)::int as secciones
        from promovidos p
        join ciudadanos c on c.id = p.ciudadano_id
        left join jornada_asistencias a
          on a.promovido_id = p.id and a.jornada_id = ${jornadaId}
        where p.activo and p.estado in ('comprometido', 'confirmado')`,

      // Hora por hora, como se lee una jornada: el acumulado se arma en
      // la pantalla para no repetir la suma en cada renglón.
      tx<{ hora: number; valor: number }[]>`
        select extract(hour from a.registrada_en at time zone ${ZONA})::int as hora,
               count(*)::int as valor
        from jornada_asistencias a
        where a.jornada_id = ${jornadaId}
        group by 1
        order by 1`,

      tx<AvanceDistrito[]>`
        select d.clave,
               d.cabecera,
               count(*)::int as comprometidos,
               count(a.id)::int as acudieron,
               (count(a.id)::float8 / nullif(count(*), 0)) as avance
        from promovidos p
        join ciudadanos c on c.id = p.ciudadano_id
        join secciones s on s.id = c.seccion_id
        join distritos d on d.id = s.distrito_local_id and d.ambito = 'local'
        left join jornada_asistencias a
          on a.promovido_id = p.id and a.jornada_id = ${jornadaId}
        where p.activo and p.estado in ('comprometido', 'confirmado')
        group by d.clave, d.cabecera
        order by avance asc nulls first, comprometidos desc`,

      // A quién llamar: los que más gente comprometida tienen todavía sin
      // acudir. Ordenar por porcentaje solo dejaría arriba a quien tiene
      // dos promovidos y ninguno fue.
      tx<MovilizadorRezagado[]>`
        select m.id,
               coalesce(m.nombre, cm.nombre_completo, 'Sin nombre') as nombre,
               mu.nombre as municipio,
               s.clave as seccion,
               coalesce(cm.telefono_movil, cm.telefono_fijo) as telefono,
               count(*)::int as comprometidos,
               count(a.id)::int as acudieron,
               (count(a.id)::float8 / nullif(count(*), 0)) as avance
        from promovidos p
        join movilizadores m on m.id = p.movilizador_id
        left join ciudadanos cm on cm.id = m.ciudadano_id
        left join secciones s on s.id = cm.seccion_id
        left join municipios mu on mu.id = s.municipio_id
        left join jornada_asistencias a
          on a.promovido_id = p.id and a.jornada_id = ${jornadaId}
        where p.activo and p.estado in ('comprometido', 'confirmado')
        group by m.id, m.nombre, cm.nombre_completo, mu.nombre, s.clave,
                 cm.telefono_movil, cm.telefono_fijo
        having count(*) - count(a.id) > 0
        order by (count(*) - count(a.id)) desc, avance asc
        limit 12`,

      tx<Incidencia[]>`
        select i.id, i.tipo, i.gravedad, i.descripcion,
               s.clave as seccion, c.clave as casilla,
               to_char(i.creada_en at time zone ${ZONA}, 'HH24:MI') as creada_en,
               (i.resuelta_en is not null) as resuelta
        from jornada_incidencias i
        left join secciones s on s.id = i.seccion_id
        left join casillas c on c.id = i.casilla_id
        where i.jornada_id = ${jornadaId}
        order by i.resuelta_en nulls first,
                 case i.gravedad when 'urgente' then 0 when 'atencion' then 1 else 2 end,
                 i.creada_en desc`,
    ])

    return {
      totales: totales ?? {
        comprometidos: 0,
        acudieron: 0,
        confirmados: 0,
        movilizadores: 0,
        secciones: 0,
      },
      porHora,
      porDistrito,
      rezagados,
      incidencias,
    }
  })
}
