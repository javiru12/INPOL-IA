/**
 * Datos de demostración del módulo de Movilización: la red de
 * movilizadores, los ciudadanos que cada uno promueve y los prospectos
 * a quienes se está invitando a sumarse.
 *
 * Lo que busca reproducir es la única pregunta que importa en campaña:
 * cuánto le falta a cada quien para su meta. Por eso el cumplimiento se
 * genera desigual a propósito —unos rebasan, varios rondan su número y
 * un grupo se quedó muy abajo—: con todos al 70% la pantalla no sirve
 * para decidir a quién llamar.
 *
 * Idempotente: borra lo que sembró una corrida previa (por tenant) antes
 * de volver a insertar. Determinista: generador con semilla fija
 * (mulberry32), nunca Math.random(), y los UUID salen del mismo
 * generador, así que dos corridas producen las mismas filas con los
 * mismos identificadores.
 *
 * Sobre los ciudadanos: los movilizadores salen del padrón que ya existe
 * (no se duplica a nadie). Los promovidos salen primero de ese mismo
 * padrón y, cuando se agota, el script da de alta ciudadanos nuevos en la
 * colonia del movilizador —que es justo lo que hace un movilizador: traer
 * gente que el sistema no tenía—. Esos quedan marcados con
 * `codigo_adicional = 'MOV-SEED'`, que es la marca por la que se borran
 * al volver a correr.
 *
 *   npm run db:movilizacion
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

/** Marca de autoría del script en `ciudadanos`, para poder revertirlo. */
const MARCA = 'MOV-SEED'

// ------------------------------------------------------------------
// Generador pseudoaleatorio determinista (mulberry32)
// ------------------------------------------------------------------
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

function semillaDesdeTexto(texto: string) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Distinta de la de seed-demo: si no, los dos scripts sortean igual. */
const SEMILLA_BASE = 20260607

type Rng = () => number

const entero = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const real = (rng: Rng, min: number, max: number) => min + rng() * (max - min)
const elegir = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

function elegirPeso<T>(rng: Rng, pares: readonly (readonly [T, number])[]): T {
  const total = pares.reduce((s, [, p]) => s + p, 0)
  let r = rng() * total
  for (const [valor, peso] of pares) {
    if (r < peso) return valor
    r -= peso
  }
  return pares[pares.length - 1][0]
}

const HEX = '0123456789abcdef'
function uuid(rng: Rng) {
  let s = ''
  for (let i = 0; i < 32; i++) s += HEX[Math.floor(rng() * 16)]
  const variante = HEX[(parseInt(s[16], 16) & 0x3) | 0x8]
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${variante}${s.slice(17, 20)}-${s.slice(20, 32)}`
}

/** Baraja determinista (Fisher–Yates) sobre una copia. */
function barajar<T>(rng: Rng, origen: readonly T[]): T[] {
  const copia = [...origen]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Una columna `date` se escribe como texto 'AAAA-MM-DD' armado con los
 * componentes locales. Pasarla por toISOString() la correría al día
 * anterior en cualquier huso al oeste de Greenwich.
 */
function comoFecha(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Día dentro de los últimos `dias`, contado por número de día del mes
 *  para que el horario de verano no salte ni repita fechas. */
function haceDias(hoy: Date, dias: number) {
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias, 12, 0, 0)
}

async function insertarPorLotes(tabla: string, filas: Record<string, unknown>[], tamano = 500) {
  for (let i = 0; i < filas.length; i += tamano) {
    await sql`insert into ${sql(tabla)} ${sql(filas.slice(i, i + tamano))}`
  }
}

// ------------------------------------------------------------------
// Catálogos de contenido
// ------------------------------------------------------------------
const NOMBRES_M = [
  'Javier', 'Alejandro', 'Ricardo', 'Eduardo', 'Francisco', 'Roberto', 'Fernando',
  'Miguel', 'Jorge', 'Arturo', 'Raúl', 'Sergio', 'Daniel', 'Gerardo', 'Rodrigo',
  'Óscar', 'Iván', 'Gustavo', 'Mario', 'Hugo', 'Adrián', 'Emilio', 'Rubén',
  'Salvador', 'Víctor', 'Jesús', 'Pedro', 'Antonio', 'Manuel', 'Carlos',
]
const NOMBRES_F = [
  'María', 'Guadalupe', 'Alejandra', 'Patricia', 'Verónica', 'Claudia', 'Leticia',
  'Rosa', 'Martha', 'Silvia', 'Gabriela', 'Elena', 'Araceli', 'Beatriz', 'Diana',
  'Mónica', 'Teresa', 'Laura', 'Karla', 'Adriana', 'Lourdes', 'Norma', 'Yolanda',
  'Esperanza', 'Blanca', 'Irma', 'Nora', 'Cecilia', 'Sandra', 'Elizabeth',
]
const APELLIDOS = [
  'García', 'Hernández', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez',
  'Sánchez', 'Ramírez', 'Flores', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Jiménez',
  'Ruiz', 'Torres', 'Vázquez', 'Castillo', 'Ortiz', 'Gutiérrez', 'Chávez', 'Ramos',
  'Mendoza', 'Aguilar', 'Vargas', 'Medina', 'Guerrero', 'Rojas', 'Herrera',
  'Contreras', 'Cervantes', 'Domínguez', 'Ibarra', 'Salazar', 'Cortés', 'Núñez',
  'Delgado', 'Fuentes', 'Soto', 'Treviño', 'Elizondo', 'Garza', 'Cantú',
  'Villarreal', 'Holguín', 'Portillo', 'Quezada', 'Terrazas', 'Sáenz', 'Baeza',
]
const LADA_POR_TENANT: Record<string, string> = { monterrey: '81', chihuahua: '614' }

const TIPOS_MOVILIZADOR = [
  'Movilizador territorial',
  'Promotor de voto',
  'Promotor de encuesta',
] as const

const NOTAS_PROMOVIDO = [
  'Pidió que le confirmen la casilla un día antes.',
  'Necesita transporte el día de la jornada.',
  'Trabaja turno nocturno: solo puede votar temprano.',
  'Se compromete también por su esposa y su hija.',
  'Tiene credencial vencida, se le canalizó al módulo.',
  'Prefiere que le marquen por la tarde.',
  'Ya votó por el proyecto en la elección pasada.',
]

const NOTAS_MOVILIZADOR = [
  'Lleva años organizando la colonia, conoce a todos en su calle.',
  'Entrega listas en papel, se le capturan los lunes.',
  'Pidió apoyo con lonas para su cuadra.',
  'Coordina a dos personas más que todavía no están dadas de alta.',
  'Responde mejor por WhatsApp que por llamada.',
]

const LLAMADAS = [
  'Se le marcó y no contestó; se deja mensaje de voz.',
  'Contestó: pidió que le marcaran más tarde en la semana.',
  'Se le explicó en qué consiste ser movilizador y qué apoyo recibe.',
  'Interesado, pero quiere saber primero cuánta gente tendría que juntar.',
  'Acordó una reunión en la casa de enlace de su colonia.',
  'Dice que lo va a platicar con su familia antes de decidir.',
  'Confirmó que sí entra y pidió formatos para empezar a registrar.',
  'No está interesado por ahora; pide que no le vuelvan a marcar.',
  'Se le visitó en su domicilio, no se encontraba.',
  'Ya trae gente apuntada de la vez pasada, se le toma el dato.',
]

// ------------------------------------------------------------------
// Distribuciones que dan forma a la pantalla
// ------------------------------------------------------------------

type Tramo = readonly [readonly [number, number], number]

/** Metas entre 10 y 60, cargadas hacia abajo: pocos se comprometen a 50. */
const TRAMOS_META: readonly Tramo[] = [
  [[10, 18], 38],
  [[18, 28], 30],
  [[28, 42], 22],
  [[42, 60], 10],
]

/**
 * Cumplimiento. Este es el corazón del seed: sin dispersión, la columna
 * de avance es una sola barra repetida cuarenta veces.
 */
const TRAMOS_AVANCE: readonly Tramo[] = [
  [[1.05, 1.45], 12], // rebasaron su meta
  [[0.85, 1.05], 20], // ahí la llevan
  [[0.6, 0.85], 28], // les falta un tramo
  [[0.3, 0.6], 25], // muy abajo
  [[0.05, 0.3], 15], // prácticamente no arrancaron
]

/**
 * Embudo de prospección. Muchos prospectos y pocos confirmados, y el
 * reparto además depende de qué tan bien va el movilizador: el que ya
 * rebasó su meta no solo trae más gente, la trae más adelantada.
 */
function embudo(calidad: number) {
  const b = Math.min(Math.max(calidad, 0), 1.2)
  return [
    ['prospecto', 46 - 18 * b],
    ['contactado', 28 + 2 * b],
    ['comprometido', 17 + 9 * b],
    ['confirmado', 9 + 7 * b],
  ] as const
}

// ------------------------------------------------------------------
// Tipos auxiliares
// ------------------------------------------------------------------
type Ciudadano = {
  id: string
  colonia: string | null
  seccion_id: string | null
  codigo_postal: string | null
}

// ------------------------------------------------------------------
// Clientes a sembrar
// ------------------------------------------------------------------
const TOTAL_MOVILIZADORES = 40
const TOTAL_PROSPECTOS = 15

const tenants = await sql<{ id: string; clave: string; nombre: string; nombre_corto: string | null }[]>`
  select id, clave, nombre, nombre_corto from tenants
  where clave in ('monterrey', 'chihuahua')
  order by clave`

const hoy = new Date()

for (const tenant of tenants) {
  const corto = tenant.nombre_corto ?? tenant.nombre

  // El rol dueño es superusuario en local y no está sujeto a RLS: fijar el
  // tenant es declaración de intención, el aislamiento real lo da el
  // `where tenant_id = ...` explícito de cada consulta de abajo.
  await sql`select set_config('app.tenant_id', ${tenant.id}, false)`

  console.log(`\n  ${corto} — borrando movilización previa...`)

  // Orden de borrado respetando llaves foráneas: lo que depende va primero.
  await sql`delete from prospecto_seguimientos where tenant_id = ${tenant.id}`
  await sql`delete from prospectos_movilizador where tenant_id = ${tenant.id}`
  await sql`delete from promovidos where tenant_id = ${tenant.id}`
  await sql`delete from movilizador_campanias where tenant_id = ${tenant.id}`
  await sql`delete from movilizadores where tenant_id = ${tenant.id}`
  await sql`delete from tipos_movilizador where tenant_id = ${tenant.id}`
  await sql`delete from ciudadanos where tenant_id = ${tenant.id} and codigo_adicional = ${MARCA}`

  const rng = mulberry32((semillaDesdeTexto(tenant.clave) ^ SEMILLA_BASE) >>> 0)
  const lada = LADA_POR_TENANT[tenant.clave] ?? '55'

  // --- Catálogo de tipos ------------------------------------------------
  const tipos = await sql<{ id: string; descripcion: string }[]>`
    insert into tipos_movilizador ${sql(
      TIPOS_MOVILIZADOR.map((descripcion) => ({ tenant_id: tenant.id, descripcion })),
    )}
    returning id, descripcion`
  const idTipo = new Map(tipos.map((t) => [t.descripcion, t.id]))

  // --- Gente y equipo que ya existe -------------------------------------
  const padron = await sql<Ciudadano[]>`
    select id, colonia, seccion_id, codigo_postal
    from ciudadanos
    where tenant_id = ${tenant.id} and activo = true
    order by id`

  const usuarios = await sql<{ id: string; perfil_clave: string }[]>`
    select id, perfil_clave from usuarios
    where tenant_id = ${tenant.id} and activo = true
    order by correo`

  const [campania] = await sql<{ id: string }[]>`
    select id from campanias where tenant_id = ${tenant.id} order by creado_en, id limit 1`

  // Cuatro responsables de movilización: la campaña reparte la red entre
  // unos pocos coordinadores, no entre toda la plantilla.
  const responsables = barajar(rng, usuarios).slice(0, 4)
  const capturista = usuarios[0]?.id ?? null

  if (padron.length < TOTAL_MOVILIZADORES + TOTAL_PROSPECTOS) {
    throw new Error(
      `${corto}: el padrón trae ${padron.length} ciudadanos y no alcanza. Corre antes npm run db:demo.`,
    )
  }

  // --- 1 · Los movilizadores salen del padrón ---------------------------
  const barajado = barajar(rng, padron)
  const elegidos = barajado.slice(0, TOTAL_MOVILIZADORES)
  const disponibles = barajado.slice(TOTAL_MOVILIZADORES)

  const movilizadores = elegidos.map((c, i) => {
    const [minMeta, maxMeta] = elegirPeso(rng, TRAMOS_META)
    const meta = entero(rng, minMeta, maxMeta)
    const [minAv, maxAv] = elegirPeso(rng, TRAMOS_AVANCE)
    const factor = real(rng, minAv, maxAv)
    const promovidos = Math.max(0, Math.round(meta * factor))

    return {
      id: uuid(rng),
      ciudadano: c,
      meta,
      objetivo: promovidos,
      // La calidad normaliza el avance a 0–1.2 para repartir el embudo.
      calidad: Math.min(factor / 1.2, 1.2),
      tipo: elegirPeso(rng, [
        ['Movilizador territorial', 60],
        ['Promotor de voto', 30],
        ['Promotor de encuesta', 10],
      ] as const),
      responsable: responsables[i % Math.max(responsables.length, 1)]?.id ?? null,
      alta: haceDias(hoy, entero(rng, 70, 210)),
      notas: rng() < 0.28 ? elegir(rng, NOTAS_MOVILIZADOR) : null,
    }
  })

  await insertarPorLotes(
    'movilizadores',
    movilizadores.map((m) => ({
      id: m.id,
      tenant_id: tenant.id,
      ciudadano_id: m.ciudadano.id,
      meta: m.meta,
      responsable_id: m.responsable,
      tipo_movilizador_id: idTipo.get(m.tipo) ?? null,
      colonia: m.ciudadano.colonia,
      notas: m.notas,
      activo: true,
      creado_en: m.alta,
      creado_por: capturista,
    })),
  )

  if (campania) {
    await insertarPorLotes(
      'movilizador_campanias',
      movilizadores.map((m) => ({
        id: uuid(rng),
        tenant_id: tenant.id,
        movilizador_id: m.id,
        campania_id: campania.id,
        usuario_id: m.responsable,
        activo: true,
      })),
    )
  }

  // --- 2 · A quién lleva cada uno ---------------------------------------
  // Primero se gasta el padrón que ya existe, empezando por la colonia del
  // propio movilizador: nadie promueve a desconocidos del otro extremo de
  // la ciudad. Cuando se acaba, se dan de alta ciudadanos nuevos.
  const porColonia = new Map<string, Ciudadano[]>()
  for (const c of disponibles) {
    const llave = c.colonia ?? ''
    const lista = porColonia.get(llave)
    if (lista) lista.push(c)
    else porColonia.set(llave, [c])
  }
  const sobrantes = [...disponibles]
  const usados = new Set<string>()

  function tomarDelPadron(colonia: string | null): Ciudadano | null {
    const cercanos = porColonia.get(colonia ?? '')
    while (cercanos?.length) {
      const c = cercanos.pop()!
      if (!usados.has(c.id)) {
        usados.add(c.id)
        return c
      }
    }
    while (sobrantes.length) {
      const c = sobrantes.pop()!
      if (!usados.has(c.id)) {
        usados.add(c.id)
        return c
      }
    }
    return null
  }

  const nuevosCiudadanos: Record<string, unknown>[] = []

  function altaCiudadano(modelo: Ciudadano): Ciudadano {
    const mujer = rng() < 0.54
    const nombre = elegir(rng, mujer ? NOMBRES_F : NOMBRES_M)
    const paterno = elegir(rng, APELLIDOS)
    const materno = elegir(rng, APELLIDOS)
    const edad = entero(rng, 18, 84)
    const id = uuid(rng)

    nuevosCiudadanos.push({
      id,
      tenant_id: tenant.id,
      nombre,
      apellido_paterno: paterno,
      apellido_materno: materno,
      nombre_completo: `${nombre} ${paterno} ${materno}`,
      sexo: mujer ? 'F' : 'M',
      edad,
      colonia: modelo.colonia,
      codigo_postal: modelo.codigo_postal,
      seccion_id: modelo.seccion_id,
      telefono_movil: `${lada}${entero(rng, 10, 99)}${entero(rng, 100000, 999999)}`,
      contactar: true,
      codigo_adicional: MARCA,
      activo: true,
      creado_por: capturista,
    })

    return { id, colonia: modelo.colonia, seccion_id: modelo.seccion_id, codigo_postal: modelo.codigo_postal }
  }

  const filasPromovidos: Record<string, unknown>[] = []

  for (const m of movilizadores) {
    for (let i = 0; i < m.objetivo; i++) {
      const persona = tomarDelPadron(m.ciudadano.colonia) ?? altaCiudadano(m.ciudadano)
      const estado = elegirPeso(rng, embudo(m.calidad))

      // Las fechas se encadenan: no se confirma antes de comprometerse ni
      // se compromete antes del primer contacto.
      const diasContacto = entero(rng, 12, 150)
      const contacto = haceDias(hoy, diasContacto)
      const compromiso = haceDias(hoy, Math.max(2, diasContacto - entero(rng, 3, 25)))
      const confirmacion = haceDias(hoy, Math.max(1, diasContacto - entero(rng, 26, 45)))

      const avanzado = estado === 'comprometido' || estado === 'confirmado'

      filasPromovidos.push({
        id: uuid(rng),
        tenant_id: tenant.id,
        movilizador_id: m.id,
        ciudadano_id: persona.id,
        estado,
        simpatizante: avanzado ? rng() < 0.86 : rng() < 0.38,
        afinidad: elegirPeso(
          rng,
          avanzado
            ? ([['alta', 58], ['media', 32], ['baja', 8], ['nula', 2]] as const)
            : estado === 'contactado'
              ? ([['alta', 22], ['media', 46], ['baja', 24], ['nula', 8]] as const)
              : ([['alta', 10], ['media', 34], ['baja', 36], ['nula', 20]] as const),
        ),
        fecha_contacto: estado === 'prospecto' ? null : comoFecha(contacto),
        fecha_compromiso: avanzado ? comoFecha(compromiso) : null,
        fecha_confirmacion: estado === 'confirmado' ? comoFecha(confirmacion) : null,
        notas: rng() < 0.12 ? elegir(rng, NOTAS_PROMOVIDO) : null,
        activo: true,
        creado_en: haceDias(hoy, Math.min(diasContacto + entero(rng, 0, 20), 240)),
        creado_por: m.responsable ?? capturista,
      })
    }
  }

  if (nuevosCiudadanos.length) await insertarPorLotes('ciudadanos', nuevosCiudadanos, 400)
  await insertarPorLotes('promovidos', filasPromovidos, 400)

  // --- 3 · Prospectos de movilizador ------------------------------------
  // Dos salen de los movilizadores que ya se dieron de alta —quedan como
  // 'convertido', que es el final natural del embudo— y el resto de los
  // promovidos que más se comprometieron: a esos es a quienes se invita.
  const candidatos = filasPromovidos
    .filter((p) => p.estado === 'comprometido' || p.estado === 'confirmado')
    .map((p) => p.ciudadano_id as string)

  const convertidos = barajar(rng, movilizadores).slice(0, 2)
  const invitados = barajar(rng, [...new Set(candidatos)]).slice(0, TOTAL_PROSPECTOS - convertidos.length)

  const ESTADOS_PROSPECTO = [
    ['nuevo', 26],
    ['contactado', 30],
    ['interesado', 26],
    ['rechazado', 18],
  ] as const

  const filasProspectos: Record<string, unknown>[] = []
  const filasSeguimientos: Record<string, unknown>[] = []

  function sembrarProspecto(
    ciudadanoId: string,
    estado: string,
    movilizadorId: string | null,
  ) {
    const id = uuid(rng)
    const responsable = elegir(rng, responsables)?.id ?? capturista
    const dias = entero(rng, 10, 120)

    filasProspectos.push({
      id,
      tenant_id: tenant.id,
      ciudadano_id: ciudadanoId,
      estado,
      meta_propuesta: entero(rng, 10, 40),
      responsable_id: responsable,
      proximo_contacto:
        estado === 'contactado' || estado === 'interesado'
          ? comoFecha(haceDias(hoy, -entero(rng, 1, 18)))
          : null,
      movilizador_id: movilizadorId,
      notas: rng() < 0.35 ? elegir(rng, NOTAS_MOVILIZADOR) : null,
      activo: true,
      creado_en: haceDias(hoy, dias),
      creado_por: responsable,
    })

    // El historial de llamadas: entre una y cinco, siempre de la más
    // antigua a la más reciente dentro de la vida del prospecto.
    const cuantas = estado === 'nuevo' ? entero(rng, 1, 2) : entero(rng, 2, 5)
    for (let i = 0; i < cuantas; i++) {
      const cuando = haceDias(hoy, Math.max(0, Math.round(dias - (dias * (i + 1)) / (cuantas + 1))))
      const ultima = i === cuantas - 1
      filasSeguimientos.push({
        id: uuid(rng),
        tenant_id: tenant.id,
        prospecto_id: id,
        usuario_id: responsable,
        tipo: elegirPeso(rng, [['llamada', 70], ['visita', 15], ['mensaje', 10], ['nota', 5]] as const),
        detalle: elegir(rng, LLAMADAS),
        estado_anterior: null,
        estado_nuevo: null,
        recordar_el:
          ultima && (estado === 'contactado' || estado === 'interesado')
            ? haceDias(hoy, -entero(rng, 1, 18))
            : null,
        creado_en: cuando,
      })
    }

    if (estado === 'convertido') {
      filasSeguimientos.push({
        id: uuid(rng),
        tenant_id: tenant.id,
        prospecto_id: id,
        usuario_id: responsable,
        tipo: 'cambio_estatus',
        detalle: 'Aceptó: queda dado de alta como movilizador con su meta.',
        estado_anterior: 'interesado',
        estado_nuevo: 'convertido',
        recordar_el: null,
        creado_en: haceDias(hoy, entero(rng, 1, 8)),
      })
    }
  }

  for (const m of convertidos) sembrarProspecto(m.ciudadano.id, 'convertido', m.id)
  for (const id of invitados) sembrarProspecto(id, elegirPeso(rng, ESTADOS_PROSPECTO), null)

  await insertarPorLotes('prospectos_movilizador', filasProspectos)
  await insertarPorLotes('prospecto_seguimientos', filasSeguimientos)

  // --- 4 · Resumen de lo sembrado ---------------------------------------
  const [resumen] = await sql<
    {
      movilizadores: number
      meta: number
      promovidos: number
      confirmados: number
      rebasaron: number
      rezagados: number
      nuevos: number
    }[]
  >`
    with avance as (
      select m.id,
             m.meta,
             count(p.id)::int as promovidos,
             count(p.id) filter (where p.estado = 'confirmado')::int as confirmados
      from movilizadores m
      left join promovidos p on p.movilizador_id = m.id and p.tenant_id = ${tenant.id}
      where m.tenant_id = ${tenant.id}
      group by m.id, m.meta
    )
    select count(*)::int as movilizadores,
           coalesce(sum(meta), 0)::int as meta,
           coalesce(sum(promovidos), 0)::int as promovidos,
           coalesce(sum(confirmados), 0)::int as confirmados,
           count(*) filter (where promovidos >= meta)::int as rebasaron,
           count(*) filter (where meta > 0 and promovidos::float8 / meta < 0.5)::int as rezagados,
           (select count(*) from ciudadanos
             where tenant_id = ${tenant.id} and codigo_adicional = ${MARCA})::int as nuevos
    from avance`

  const porEstado = await sql<{ estado: string; n: number }[]>`
    select estado, count(*)::int as n from promovidos
    where tenant_id = ${tenant.id} group by 1 order by 2 desc`

  const [prospectos] = await sql<{ prospectos: number; seguimientos: number }[]>`
    select (select count(*) from prospectos_movilizador where tenant_id = ${tenant.id})::int as prospectos,
           (select count(*) from prospecto_seguimientos where tenant_id = ${tenant.id})::int as seguimientos`

  console.log(`  ${corto}:`)
  console.log(
    `    movilizadores: ${resumen.movilizadores} · meta total: ${resumen.meta} · promovidos: ${resumen.promovidos} (${Math.round((resumen.promovidos / resumen.meta) * 100)}% de avance)`,
  )
  console.log(
    `    cumplimiento: ${resumen.rebasaron} alcanzaron o rebasaron su meta · ${resumen.rezagados} por debajo del 50%`,
  )
  console.log(`    prospección: ${porEstado.map((f) => `${f.estado} ${f.n}`).join(' · ')}`)
  console.log(
    `    prospectos de movilizador: ${prospectos.prospectos} con ${prospectos.seguimientos} seguimientos`,
  )
  console.log(`    ciudadanos dados de alta por la red: ${resumen.nuevos}`)
}

console.log('\n  Movilización lista.\n')
await sql.end()
