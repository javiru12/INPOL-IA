/**
 * Datos de demostración de la jornada electoral.
 *
 * Reproduce lo único que importa el día de la elección: cuánta de la
 * gente comprometida ya fue a votar, a qué hora y dónde se está quedando
 * corta la estructura.
 *
 * El avance se genera con forma de jornada real, no uniforme: un pico de
 * mañana cuando la gente vota antes de sus pendientes, una meseta a
 * mediodía y un repunte al cierre. Con un avance plano el tablero no
 * sirve para decidir a quién llamar a las dos de la tarde, que es
 * exactamente para lo que existe.
 *
 * El cumplimiento también sale desigual a propósito: hay movilizadores
 * que rebasan su meta y otros que no llegan ni a la mitad.
 *
 * Idempotente: borra la jornada previa del mismo tenant antes de sembrar.
 * Determinista: generador con semilla fija, nunca Math.random().
 *
 *   npm run db:diad
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

function mulberry32(semilla: number) {
  let a = semilla
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Cómo se reparte la asistencia entre las 8:00 y las 18:00. Suma 1.
 * Son diez tramos de una hora: arranque fuerte, caída al mediodía y
 * repunte en las dos últimas horas, que es la forma que tiene una
 * jornada en México.
 */
const CURVA = [0.14, 0.16, 0.12, 0.09, 0.07, 0.06, 0.07, 0.09, 0.1, 0.1]

const azar = mulberry32(20260607)

type Tenant = { id: string; clave: string; nombre_corto: string | null }

const tenants = await sql<Tenant[]>`
  select id, clave, nombre_corto from tenants where activo order by clave`

for (const t of tenants) {
  console.log(`\n  ${t.nombre_corto ?? t.clave} — borrando jornada previa...`)
  await sql`delete from jornadas where tenant_id = ${t.id}`

  // La jornada se fecha hoy para que el tablero tenga algo que enseñar
  // al abrirlo; en producción la captura el cliente.
  const [jornada] = await sql<{ id: string }[]>`
    insert into jornadas (tenant_id, nombre, fecha, activa)
    values (${t.id}, 'Elección local 2026', current_date, true)
    returning id`

  // Solo acude quien se había comprometido o confirmado: un prospecto
  // que nadie contactó no aparece el día de la elección.
  const promovidos = await sql<{ id: string; seccion_id: string | null }[]>`
    select p.id, c.seccion_id
    from promovidos p
    join ciudadanos c on c.id = p.ciudadano_id
    where p.tenant_id = ${t.id}
      and p.activo
      and p.estado in ('comprometido', 'confirmado')
    order by p.id`

  if (promovidos.length === 0) {
    console.log('    sin promovidos comprometidos: corre antes npm run db:movilizacion')
    continue
  }

  // A qué casilla va cada quien: la primera de su sección. En la vida
  // real lo dice la credencial; aquí basta para que el dato exista.
  const casillas = await sql<{ seccion_id: string; id: string }[]>`
    select distinct on (seccion_id) seccion_id, id
    from casillas
    where seccion_id is not null
    order by seccion_id, clave`
  const casillaDe = new Map(casillas.map((c) => [c.seccion_id, c.id]))

  const [usuario] = await sql<{ id: string }[]>`
    select id from usuarios where tenant_id = ${t.id} and activo order by correo limit 1`

  // Entre el 55% y el 75% de los comprometidos acaba acudiendo. Que no
  // sea 100% es el punto: el hueco es lo que el tablero tiene que hacer
  // visible mientras todavía se puede llamar a la gente.
  const objetivo = Math.round(promovidos.length * (0.55 + azar() * 0.2))
  const acuden = [...promovidos].sort(() => azar() - 0.5).slice(0, objetivo)

  const filas: { promovido_id: string; casilla_id: string | null; registrada_en: Date }[] = []
  let i = 0
  for (const [tramo, peso] of CURVA.entries()) {
    const cuantos = Math.round(objetivo * peso)
    for (let k = 0; k < cuantos && i < acuden.length; k++, i++) {
      const p = acuden[i]
      const hora = 8 + tramo
      const minuto = Math.floor(azar() * 60)
      const cuando = new Date()
      cuando.setHours(hora, minuto, Math.floor(azar() * 60), 0)
      filas.push({
        promovido_id: p.id,
        casilla_id: p.seccion_id ? (casillaDe.get(p.seccion_id) ?? null) : null,
        registrada_en: cuando,
      })
    }
  }

  for (const f of filas) {
    await sql`
      insert into jornada_asistencias
        (tenant_id, jornada_id, promovido_id, casilla_id, registrada_en, registrada_por)
      values (${t.id}, ${jornada.id}, ${f.promovido_id}, ${f.casilla_id},
              ${f.registrada_en}, ${usuario?.id ?? null})
      on conflict do nothing`
  }

  // Un puñado de incidencias, que es lo que de verdad pasa: casi todas
  // menores y una o dos que sí exigen mandar a alguien.
  const guion: [string, string, string][] = [
    ['apertura', 'atencion', 'La casilla abrió 40 minutos tarde: faltaba un funcionario.'],
    ['material', 'urgente', 'Reportan que se agotaron las boletas antes del mediodía.'],
    ['propaganda', 'normal', 'Propaganda a menos de 50 metros del acceso.'],
    ['acarreo', 'urgente', 'Camionetas trasladando gente desde fuera de la sección.'],
    ['intimidacion', 'atencion', 'Personas tomando fotos de la fila sin identificarse.'],
    ['otro', 'normal', 'Fila larga a media mañana, sin mayor problema.'],
  ]

  const conCasilla = await sql<{ id: string; seccion_id: string }[]>`
    select c.id, c.seccion_id
    from casillas c
    join secciones s on s.id = c.seccion_id
    where c.seccion_id is not null
    order by c.clave
    limit ${guion.length}`

  for (const [n, [tipo, gravedad, descripcion]] of guion.entries()) {
    const c = conCasilla[n]
    if (!c) break
    await sql`
      insert into jornada_incidencias
        (tenant_id, jornada_id, casilla_id, seccion_id, tipo, gravedad, descripcion,
         resuelta_en, creada_por)
      values (${t.id}, ${jornada.id}, ${c.id}, ${c.seccion_id}, ${tipo}, ${gravedad},
              ${descripcion}, ${gravedad === 'normal' ? new Date() : null},
              ${usuario?.id ?? null})`
  }

  const [resumen] = await sql<{ asistencias: number; incidencias: number }[]>`
    select (select count(*)::int from jornada_asistencias where jornada_id = ${jornada.id}) as asistencias,
           (select count(*)::int from jornada_incidencias where jornada_id = ${jornada.id}) as incidencias`

  console.log(`  ${t.nombre_corto ?? t.clave}:`)
  console.log(`    comprometidos: ${promovidos.length} · ya votaron: ${resumen.asistencias}` +
    ` (${Math.round((resumen.asistencias / promovidos.length) * 100)}%)`)
  console.log(`    incidencias: ${resumen.incidencias}`)
}

console.log('\n  Jornada lista.\n')
await sql.end()
