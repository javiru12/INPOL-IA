/**
 * Datos de demostración operativa: ciudadanos, peticiones, seguimientos,
 * recorridos y eventos para los clientes ya existentes, de modo que el
 * sistema se navegue —y se analice— como algo en uso real y no como una
 * maqueta vacía.
 *
 * La serie cuenta una historia: 18 meses de operación con tendencia de
 * crecimiento, estacionalidad por problemática, picos atribuibles a una
 * contingencia o a una jornada, tiempos de atención desiguales según la
 * naturaleza del caso y un equipo que mejora su mediana de resolución.
 *
 * Idempotente: antes de insertar borra lo que haya sembrado una corrida
 * previa (por tenant) y vuelve a insertar. Determinista: usa un generador
 * pseudoaleatorio con semilla fija (mulberry32), no Math.random(), e incluso
 * los UUID salen de ese generador, así que dos corridas producen exactamente
 * los mismos datos, con los mismos identificadores.
 *
 *   npx tsx --env-file=.env.local db/seed-demo.mts
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

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

// Semilla fija por tenant, para que cada cliente tenga datos distintos
// pero igual de reproducibles entre corridas.
function semillaDesdeTexto(texto: string) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const SEMILLA_BASE = 987654321

type Rng = () => number
const entero = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const elegir = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]
function elegirPeso<T>(rng: Rng, pares: [T, number][]): T {
  const total = pares.reduce((s, [, p]) => s + p, 0)
  let r = rng() * total
  for (const [valor, peso] of pares) {
    if (r < peso) return valor
    r -= peso
  }
  return pares[pares.length - 1][0]
}
/** Elige un índice de un arreglo de pesos ya acumulados (búsqueda binaria). */
function elegirAcumulado(rng: Rng, acumulado: Float64Array) {
  const objetivo = rng() * acumulado[acumulado.length - 1]
  let bajo = 0
  let alto = acumulado.length - 1
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1
    if (acumulado[medio] < objetivo) bajo = medio + 1
    else alto = medio
  }
  return bajo
}
/** Normal estándar por Box–Muller; alimenta la dispersión de los tiempos. */
function normalEstandar(rng: Rng) {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * UUID v4 derivado del generador determinista. Permite armar las tablas
 * puente (seguimientos, recorrido_peticiones…) sin depender del orden en
 * que la base devuelva los RETURNING de una inserción multi-fila.
 */
const HEX = '0123456789abcdef'
function uuid(rng: Rng) {
  let s = ''
  for (let i = 0; i < 32; i++) s += HEX[Math.floor(rng() * 16)]
  const variante = HEX[(parseInt(s[16], 16) & 0x3) | 0x8]
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${variante}${s.slice(17, 20)}-${s.slice(20, 32)}`
}

/** Toma `cantidad` elementos distintos de un arreglo, sin repetir. */
function muestrear<T>(rng: Rng, origen: T[], cantidad: number): T[] {
  if (cantidad >= origen.length) return [...origen]
  const copia = [...origen]
  const salida: T[] = []
  for (let i = 0; i < cantidad; i++) {
    const j = Math.floor(rng() * copia.length)
    salida.push(copia[j])
    copia[j] = copia[copia.length - 1]
    copia.pop()
  }
  return salida
}

const DIA_MS = 86400000

// ------------------------------------------------------------------
// Catálogos estáticos de contenido (listas de donde el generador elige)
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
const CALLES = [
  'Morelos', 'Hidalgo', 'Juárez', 'Allende', 'Zaragoza', 'Independencia',
  'Matamoros', 'Ocampo', 'Guerrero', '5 de Mayo', 'Las Palmas', 'Revolución',
  'Colón', 'Madero', 'Niños Héroes', 'Abasolo',
]
const PARENTESCOS = ['madre', 'padre', 'hijo', 'hija', 'esposa', 'esposo', 'abuela', 'abuelo', 'hermano', 'hermana', 'suegra']
const NIVELES = ['primaria', 'secundaria', 'preparatoria', 'nivel medio superior']
const DIAS_FRASES = ['tres días', 'una semana', 'dos semanas', 'un mes', 'varios días']
const PUESTOS_CONTACTO = ['Director', 'Coordinadora', 'Jefe de Departamento', 'Encargada de Atención Ciudadana', 'Subdirector']

const COLONIAS_POR_TENANT: Record<string, string[]> = {
  monterrey: ['Cumbres', 'San Bernabé', 'Independencia', 'Mitras', 'Valle Verde', 'Moderna', 'Centro', 'Lázaro Cárdenas', 'Topo Chico', 'La Alianza', 'Fomerrey', 'Del Paseo Residencial'],
  chihuahua: ['Centro', 'Nombre de Dios', 'Villa Juárez', 'Santo Niño', 'Panamericana', 'Mármol', 'Rosario', 'Universidad', 'Zootecnia', 'Fuentes del Valle', 'Cuauhtémoc Sur', 'Satélite'],
}
const LADA_POR_TENANT: Record<string, string> = { monterrey: '81', chihuahua: '614' }
const CP_BASE_POR_TENANT: Record<string, number> = { monterrey: 64000, chihuahua: 31000 }

// Problemáticas, subproblemáticas y plantillas de descripción de peticiones.
// Las plantillas aceptan placeholders {colonia} {calle1} {calle2} {dias}
// {parentesco} {nivel} que se rellenan al momento de generar cada petición.
const PROBLEMATICAS = [
  {
    titulo: 'Salud', color: '#9c6b63',
    subs: [
      { titulo: 'Consulta médica', plantillas: [
        'Solicita apoyo para consulta médica, no cuenta con servicio médico.',
        'Pide canalización a consulta médica general para su {parentesco}.',
        'Reporta que no ha podido conseguir cita médica desde hace {dias}.',
      ]},
      { titulo: 'Medicamento', plantillas: [
        'Solicita apoyo con medicamento para su {parentesco}, es de uso constante.',
        'Pide medicamento para control de presión, no lo encuentra en la farmacia del Seguro.',
        'Solicita apoyo con medicamento, no cuenta con los recursos para comprarlo.',
      ]},
      { titulo: 'Silla de ruedas y aparatos ortopédicos', plantillas: [
        'Solicita apoyo con silla de ruedas para su {parentesco}.',
        'Pide apoyo con bastón y andadera, su {parentesco} tiene movilidad reducida.',
        'Solicita aparato auditivo para su {parentesco}, adulto mayor.',
      ]},
      { titulo: 'Traslado a hospital', plantillas: [
        'Solicita apoyo con traslado a hospital para consulta de especialidad.',
        'Pide apoyo con ambulancia, su {parentesco} requiere traslado urgente.',
      ]},
      { titulo: 'Atención dental', plantillas: [
        'Solicita apoyo con atención dental, no cuenta con los recursos.',
        'Pide jornada de atención dental para su {parentesco}.',
      ]},
    ],
  },
  {
    titulo: 'Educación', color: '#6b8f8a',
    subs: [
      { titulo: 'Beca escolar', plantillas: [
        'Pide beca escolar para su hijo de {nivel}.',
        'Solicita apoyo con beca para continuar estudios de {nivel}.',
        'Pide beca escolar para su {parentesco}, cursa {nivel}.',
      ]},
      { titulo: 'Útiles y uniformes escolares', plantillas: [
        'Solicita apoyo con útiles escolares para el ciclo que inicia.',
        'Pide apoyo con uniforme escolar para su {parentesco}.',
      ]},
      { titulo: 'Falta de cupo escolar', plantillas: [
        'Reporta que no encontró cupo en escuela pública de la colonia {colonia}.',
        'Solicita apoyo para conseguir lugar en escuela de {nivel}.',
      ]},
      { titulo: 'Rehabilitación de escuela', plantillas: [
        'Reporta escuela de la colonia {colonia} con techumbre dañada.',
        'Solicita apoyo para rehabilitar baños de la escuela primaria de la colonia {colonia}.',
      ]},
      { titulo: 'Transporte escolar', plantillas: [
        'Solicita apoyo con transporte escolar, la escuela está retirada de su domicilio.',
      ]},
    ],
  },
  {
    titulo: 'Desarrollo Social', color: '#b08968',
    subs: [
      { titulo: 'Apoyo alimentario', plantillas: [
        'Solicita apoyo con despensa, situación económica difícil.',
        'Pide apoyo alimentario para su familia, quedó sin empleo.',
      ]},
      { titulo: 'Apoyo para vivienda', plantillas: [
        'Solicita apoyo con láminas para su vivienda, se llueve en temporada de lluvias.',
        'Pide apoyo con piso firme, su vivienda tiene piso de tierra.',
        'Solicita apoyo con material para bardear su domicilio.',
      ]},
      { titulo: 'Apoyo funerario', plantillas: [
        'Solicita apoyo funerario, falleció su {parentesco}.',
      ]},
      { titulo: 'Apoyo a personas con discapacidad', plantillas: [
        'Solicita apoyo para su {parentesco} con discapacidad, requiere terapias.',
      ]},
      { titulo: 'Apoyo a adultos mayores', plantillas: [
        'Pide apoyo del programa para adultos mayores para su {parentesco}.',
      ]},
    ],
  },
  {
    titulo: 'Deportes', color: '#5e7ca0',
    subs: [
      { titulo: 'Mantenimiento de canchas', plantillas: [
        'Reporta cancha de la colonia {colonia} en mal estado, pide mantenimiento.',
      ]},
      { titulo: 'Uniformes y balones', plantillas: [
        'Solicita apoyo con uniformes y balones para equipo de la colonia {colonia}.',
      ]},
      { titulo: 'Ligas y torneos comunitarios', plantillas: [
        'Pide apoyo para organizar torneo comunitario en la colonia {colonia}.',
      ]},
      { titulo: 'Alumbrado en unidad deportiva', plantillas: [
        'Reporta falta de alumbrado en unidad deportiva de la colonia {colonia}, hay inseguridad.',
      ]},
    ],
  },
  {
    titulo: 'Arte y Cultura', color: '#8a6d9c',
    subs: [
      { titulo: 'Talleres culturales', plantillas: [
        'Solicita se abra taller cultural en la colonia {colonia}.',
      ]},
      { titulo: 'Apoyo a grupos artísticos', plantillas: [
        'Pide apoyo con vestuario para grupo de danza de la colonia {colonia}.',
      ]},
      { titulo: 'Mantenimiento de casa de cultura', plantillas: [
        'Reporta casa de cultura de la colonia {colonia} con goteras, pide mantenimiento.',
      ]},
      { titulo: 'Eventos y festivales comunitarios', plantillas: [
        'Solicita apoyo para organizar festival del día del niño en la colonia {colonia}.',
      ]},
    ],
  },
  {
    titulo: 'Seguridad', color: '#a85c5c',
    subs: [
      { titulo: 'Rondines de vigilancia', plantillas: [
        'Solicita más rondines de vigilancia en la colonia {colonia} por las noches.',
      ]},
      { titulo: 'Robo a casa habitación', plantillas: [
        'Reporta robo a casa habitación la semana pasada, pide refuerzo de vigilancia.',
      ]},
      { titulo: 'Violencia familiar', plantillas: [
        'Solicita orientación por violencia intrafamiliar, pide canalización a módulo correspondiente.',
      ]},
      { titulo: 'Alumbrado por inseguridad', plantillas: [
        'Reporta calle oscura en la colonia {colonia}, pide alumbrado por inseguridad.',
      ]},
      { titulo: 'Cámaras de videovigilancia', plantillas: [
        'Solicita instalación de cámaras de videovigilancia en cruce de {calle1} y {calle2}.',
      ]},
    ],
  },
  {
    titulo: 'Participación Ciudadana', color: '#7a8c5c',
    subs: [
      { titulo: 'Consulta vecinal', plantillas: [
        'Solicita se convoque a consulta vecinal sobre obra en la colonia {colonia}.',
      ]},
      { titulo: 'Queja por atención en oficina de gobierno', plantillas: [
        'Presenta queja por mala atención recibida en oficina de gobierno municipal.',
      ]},
      { titulo: 'Solicitud de audiencia con autoridad', plantillas: [
        'Solicita audiencia con autoridad municipal para exponer caso de su colonia.',
      ]},
      { titulo: 'Trámite de documento oficial', plantillas: [
        'Solicita apoyo para trámite de acta de nacimiento.',
        'Pide orientación para trámite de CURP.',
      ]},
    ],
  },
  {
    titulo: 'Obra Pública', color: '#8c8370',
    subs: [
      { titulo: 'Bacheo de calles', plantillas: [
        'Reporta baches en calle {calle1}, colonia {colonia}.',
      ]},
      { titulo: 'Pavimentación', plantillas: [
        'Solicita pavimentación de calle {calle1} en la colonia {colonia}.',
      ]},
      { titulo: 'Construcción de banquetas', plantillas: [
        'Pide construcción de banquetas en calle {calle1}, colonia {colonia}.',
      ]},
      { titulo: 'Rehabilitación de parque', plantillas: [
        'Reporta parque de la colonia {colonia} abandonado, solicita rehabilitación.',
      ]},
    ],
  },
  {
    titulo: 'Transporte', color: '#5c8c87',
    subs: [
      { titulo: 'Ruta de camión insuficiente', plantillas: [
        'Reporta que la ruta de camión no pasa seguido por la colonia {colonia}.',
      ]},
      { titulo: 'Parada de autobús en mal estado', plantillas: [
        'Solicita rehabilitación de parada de autobús en cruce de {calle1} y {calle2}.',
      ]},
      { titulo: 'Semáforo descompuesto', plantillas: [
        'Reporta semáforo descompuesto en cruce de {calle1} y {calle2} desde hace {dias}.',
      ]},
      { titulo: 'Tope faltante', plantillas: [
        'Solicita instalación de tope en calle {calle1}, colonia {colonia}, por exceso de velocidad.',
      ]},
    ],
  },
  {
    titulo: 'Servicios', color: '#7d7d9c',
    subs: [
      { titulo: 'Fuga de agua', plantillas: [
        'Reporta fuga de agua en cruce de {calle1} y {calle2} desde hace {dias}.',
        'Reporta fuga de agua frente a su domicilio en calle {calle1}, colonia {colonia}.',
      ]},
      { titulo: 'Alumbrado público', plantillas: [
        'Reporta luminaria fundida en calle {calle1}, colonia {colonia}.',
      ]},
      { titulo: 'Recolección de basura', plantillas: [
        'Reporta que el camión de basura no ha pasado desde hace {dias} en la colonia {colonia}.',
      ]},
      { titulo: 'Drenaje colapsado', plantillas: [
        'Reporta drenaje colapsado en calle {calle1}, colonia {colonia}.',
      ]},
      { titulo: 'Poda de árboles', plantillas: [
        'Solicita poda de árboles en calle {calle1}, colonia {colonia}, raíces levantan la banqueta.',
      ]},
    ],
  },
]

/**
 * Perfil analítico de cada problemática. Es la tabla que hace que los
 * tableros digan algo: cuánto pesa en el total, en qué meses se dispara,
 * cuántos días tarda en resolverse y con qué urgencia llega.
 *
 *  · peso        — participación en el total de peticiones.
 *  · dependencia — a quién se turna (una o dos, con su reparto).
 *  · estacion    — multiplicador por mes, índice 0 = enero.
 *  · diasBase    — mediana de días de resolución en prioridad Normal,
 *                  antes de los ajustes por urgencia, operador y aprendizaje.
 *  · prioridad   — reparto [Urgente, Alta, Normal, Baja].
 *  · apoyo       — si lo que se entrega es un apoyo a una persona (beca,
 *                  despensa, medicamento) o una obra o servicio en la vía
 *                  pública. Cambia el texto de las visitas y del cierre.
 */
const PERFIL_PROBLEMATICA: Record<string, {
  peso: number
  dependencias: [string, number][]
  estacion: number[]
  diasBase: number
  prioridad: [number, number, number, number]
  apoyo: boolean
}> = {
  // Invierno: infecciones respiratorias, adultos mayores, medicamento.
  'Salud': {
    peso: 13, apoyo: true,  dependencias: [['SALUD', 100]], diasBase: 10, prioridad: [18, 30, 42, 10],
    estacion: [1.70, 1.50, 1.10, 0.85, 0.75, 0.70, 0.70, 0.75, 0.90, 1.10, 1.35, 1.60],
  },
  // Regreso a clases en agosto y arranque de ciclo en enero.
  'Educación': {
    peso: 11, apoyo: true,  dependencias: [['EDUC', 100]], diasBase: 28, prioridad: [3, 18, 57, 22],
    estacion: [1.30, 1.00, 0.85, 0.80, 0.80, 0.90, 1.50, 2.00, 1.45, 0.95, 0.80, 0.70],
  },
  // Cierre de año y cuesta de enero.
  'Desarrollo Social': {
    peso: 14, apoyo: true,  dependencias: [['DESOC', 100]], diasBase: 46, prioridad: [6, 22, 52, 20],
    estacion: [1.25, 1.00, 0.90, 0.90, 0.90, 0.90, 0.90, 0.95, 1.00, 1.10, 1.40, 1.60],
  },
  'Deportes': {
    peso: 5, apoyo: false, dependencias: [['DEPORTE', 100]], diasBase: 24, prioridad: [2, 12, 56, 30],
    estacion: [0.70, 0.90, 1.20, 1.35, 1.40, 1.30, 1.10, 1.00, 1.05, 1.00, 0.85, 0.70],
  },
  'Arte y Cultura': {
    peso: 3, apoyo: false, dependencias: [['CULTURA', 100]], diasBase: 21, prioridad: [2, 12, 54, 32],
    estacion: [0.80, 0.90, 1.05, 1.40, 1.10, 1.00, 1.00, 0.95, 1.15, 1.10, 1.30, 1.50],
  },
  'Seguridad': {
    peso: 9, apoyo: false, dependencias: [['SEG', 100]], diasBase: 7, prioridad: [20, 32, 38, 10],
    estacion: [1.00, 0.95, 0.95, 1.00, 1.05, 1.00, 1.10, 1.10, 1.00, 1.05, 1.20, 1.40],
  },
  'Participación Ciudadana': {
    peso: 4, apoyo: true,  dependencias: [['ATNCIUD', 100]], diasBase: 15, prioridad: [5, 20, 55, 20],
    estacion: [1.00, 1.05, 1.10, 1.05, 1.00, 1.00, 0.95, 0.95, 1.05, 1.10, 1.05, 0.95],
  },
  // Lo que deja la temporada de lluvias: baches, socavones, parques rotos.
  'Obra Pública': {
    peso: 14, apoyo: false, dependencias: [['OBRAS', 100]], diasBase: 72, prioridad: [4, 20, 55, 21],
    estacion: [0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.10, 1.35, 1.80, 1.90, 1.50, 0.95],
  },
  'Transporte': {
    peso: 7, apoyo: false, dependencias: [['TRANSITO', 100]], diasBase: 14, prioridad: [7, 24, 52, 17],
    estacion: [0.90, 0.95, 1.00, 1.00, 1.00, 1.05, 1.10, 1.35, 1.25, 1.10, 0.95, 0.90],
  },
  // Calor: fugas, desabasto, drenaje y basura. Es la problemática más viva.
  'Servicios': {
    peso: 20, apoyo: false, dependencias: [['SERV', 80], ['MEDAMB', 20]], diasBase: 4, prioridad: [14, 30, 44, 12],
    estacion: [0.65, 0.70, 0.85, 1.05, 1.60, 1.90, 2.00, 1.80, 1.25, 0.90, 0.70, 0.65],
  },
}

/**
 * Picos puntuales atribuibles a un hecho concreto, no ruido. Se busca la
 * ocurrencia más reciente de ese día del año dentro de la ventana de 18
 * meses; si cae fuera, el pico simplemente no aparece.
 */
const PICOS = [
  {
    nombre: 'Contingencia por lluvias',
    mes: 8, dia: 14, duracion: 6, factor: 7,
    problematicas: ['Obra Pública', 'Servicios'],
    actividad: { tipo: 'recorrido' as const, titulo: 'Brigada de emergencia por lluvias en {colonia}', asistentes: [120, 260] as [number, number] },
  },
  {
    nombre: 'Mega jornada de atención ciudadana',
    mes: 1, dia: 21, duracion: 2, factor: 14,
    problematicas: ['Desarrollo Social', 'Salud', 'Educación'],
    actividad: { tipo: 'evento' as const, titulo: 'Mega jornada de atención ciudadana en {colonia}', asistentes: [600, 900] as [number, number] },
  },
  {
    nombre: 'Desabasto de agua',
    mes: 5, dia: 8, duracion: 5, factor: 6,
    problematicas: ['Servicios'],
    actividad: { tipo: 'evento' as const, titulo: 'Módulo de atención por desabasto de agua en {colonia}', asistentes: [180, 400] as [number, number] },
  },
]

const ESTATUS = ['Abierta', 'En proceso', 'En gestión', 'Completada', 'No interpretada', 'Cancelada']
const PRIORIDADES = ['Urgente', 'Alta', 'Normal', 'Baja']
/** Cuánto acorta o alarga la urgencia el tiempo de resolución. */
const FACTOR_PRIORIDAD: Record<string, number> = { Urgente: 0.10, Alta: 0.42, Normal: 1.0, Baja: 1.75 }

const FUENTES = ['Recorrido', 'Evento', 'Llamada', 'WhatsApp', 'Programa Social', 'Oficina', 'Redes sociales', 'Portal ciudadano']
const FUENTES_ESPONTANEAS: [string, number][] = [
  ['Llamada', 26], ['WhatsApp', 24], ['Oficina', 22], ['Programa Social', 14], ['Redes sociales', 14],
]
const DEPENDENCIAS_BASE = [
  { clave: 'SERV', descripcion: 'Servicios Públicos' },
  { clave: 'OBRAS', descripcion: 'Obras Públicas' },
  { clave: 'DESOC', descripcion: 'Desarrollo Social' },
  { clave: 'SEG', descripcion: 'Seguridad Pública' },
  { clave: 'SALUD', descripcion: 'Salud Municipal' },
  { clave: 'TRANSITO', descripcion: 'Tránsito y Vialidad' },
  { clave: 'MEDAMB', descripcion: 'Medio Ambiente' },
  { clave: 'ATNCIUD', descripcion: 'Atención Ciudadana' },
  { clave: 'EDUC', descripcion: 'Educación Municipal' },
  { clave: 'DEPORTE', descripcion: 'Instituto del Deporte' },
  { clave: 'CULTURA', descripcion: 'Cultura y Casas de Cultura' },
]

const TITULOS_RECORRIDO = [
  'Recorrido casa por casa en {colonia}',
  'Brigada de gestión social en {colonia}',
  'Recorrido de escucha ciudadana en {colonia}',
  'Caminata vecinal en {colonia}',
  'Verificación de reportes de servicios en {colonia}',
]
const TITULOS_EVENTO = [
  'Evento comunitario en {colonia}',
  'Brigada de salud en {colonia}',
  'Feria de servicios municipales en {colonia}',
  'Jornada de regularización en {colonia}',
  'Posada vecinal en {colonia}',
  'Mega jornada social en {colonia}',
  'Audiencia pública con vecinos de {colonia}',
]

/**
 * Perfil de cada gestor. El equipo es chico (cinco usuarios por cliente,
 * los que siembra db/seed.mts), así que las diferencias deben notarse:
 * quien más carga no es quien más rápido resuelve.
 *
 *  · carga  — peso relativo en el reparto de peticiones.
 *  · tiempo — multiplicador sobre la mediana de días de resolución.
 */
const PERFIL_OPERADOR = [
  { carga: 1.9, tiempo: 1.30 },  // mucho volumen, va saturado
  { carga: 2.1, tiempo: 0.72 },  // el que saca el trabajo
  { carga: 1.2, tiempo: 0.95 },
  { carga: 0.9, tiempo: 1.62 },  // poca carga y aun así lento
  { carga: 0.7, tiempo: 1.08 },
]

// ------------------------------------------------------------------
// Textos de seguimiento: gestión real, no relleno.
// Admiten {dependencia} {colonia} {folio}.
// ------------------------------------------------------------------
const SEG_TURNADO = [
  'Turnado a {dependencia} con folio interno {folio}.',
  'Se capturó el reporte y se turnó a {dependencia}, folio interno {folio}.',
  'Recibido en ventanilla y remitido a {dependencia} mediante oficio {folio}.',
]
const SEG_NOTA = [
  'Se integró expediente con copia de identificación y comprobante de domicilio.',
  'Se solicitó a {dependencia} informe de avance; quedaron de responder esta semana.',
  'Segundo recordatorio a {dependencia}, el reporte lleva tres semanas sin movimiento.',
  'Se adjunta croquis de ubicación levantado por el gestor de la zona.',
  'Caso priorizado por tratarse de adulto mayor que vive solo.',
  'Se corrigió la clasificación del reporte y se remitió de nuevo a {dependencia}.',
]
const SEG_NOTA_OBRA = [
  'Cuadrilla programada para la próxima semana, sujeta a disponibilidad de material.',
  'Se anexa reporte fotográfico del sitio levantado en campo.',
  'Pendiente de autorización de presupuesto, el material no está en almacén.',
  'El reporte se acumuló con otros cinco de la misma calle en la colonia {colonia}.',
  '{dependencia} informa que el tramo entra en el programa de obra del siguiente trimestre.',
]
const SEG_NOTA_APOYO = [
  'Se cruzó el domicilio con el padrón: el ciudadano sí cumple los requisitos del programa.',
  'Falta el comprobante de ingresos para completar el expediente del programa.',
  'Se incluyó al ciudadano en la lista de la próxima entrega de {dependencia}.',
  'El apoyo quedó condicionado a que haya disponibilidad en el padrón de este ejercicio.',
]
const SEG_LLAMADA = [
  'Se marcó al ciudadano, no contestó. Se reintenta en dos días.',
  'Llamada al ciudadano para confirmar domicilio y referencias de la calle.',
  'Llamada a {dependencia}: informan que el reporte ya está en ruta.',
  'El ciudadano reporta que el problema persiste, se reabre la gestión con {dependencia}.',
  'El ciudadano pide que se le avise un día antes, trabaja fuera de casa.',
  'Se llamó a {dependencia} para pedir folio de atención, quedaron de enviarlo por correo.',
  'El número proporcionado está fuera de servicio, se buscará por el contacto alterno.',
]
const SEG_LLAMADA_OBRA = [
  'Se contactó al ciudadano, confirma que la cuadrilla ya pasó.',
  'Se avisó al ciudadano la fecha en que acude la cuadrilla.',
  'El vecino avisa que la calle sigue igual, se insiste con {dependencia}.',
]
const SEG_LLAMADA_APOYO = [
  'Se notificó al ciudadano que el apoyo está listo para entrega en el módulo.',
  'Se citó al ciudadano en el módulo de {dependencia} para la firma del expediente.',
  'El ciudadano confirma que ya acudió a la cita que se le programó.',
]
// Las visitas y los cierres se separan en dos familias: un bacheo no se
// cierra "entregando un apoyo", y una beca no se cierra "con la cuadrilla".
const SEG_VISITA = [
  'Visita de verificación en el domicilio, se confirma lo reportado.',
  'Se acudió al sitio con personal de {dependencia} para levantar medidas.',
  'Visita al domicilio, no se encontró a nadie. Se dejó aviso con los datos del gestor.',
  'Recorrido por la zona con el comité de vecinos para priorizar el caso.',
]
const SEG_VISITA_OBRA = [
  'Se visitó la calle reportada, el trabajo ya está ejecutado. Se toma evidencia.',
  'Se verificó en campo: el reporte abarca media cuadra, no solo el domicilio.',
  'Se midió el tramo afectado junto con el supervisor de {dependencia}.',
]
const SEG_VISITA_APOYO = [
  'Visita domiciliaria: se aplicó el estudio socioeconómico.',
  'Entrega del apoyo en el domicilio, firma de recibido en expediente.',
  'Se acudió al domicilio a recoger la documentación que faltaba en el expediente.',
]
const SEG_CIERRE_OBRA = [
  'Atendido por {dependencia}. Se cierra con evidencia fotográfica.',
  'Cuadrilla de {dependencia} ejecutó el trabajo, el ciudadano confirma por teléfono.',
  'Trabajo concluido y validado con el vecino que lo reportó. Se cierra la petición.',
  'Se repuso el servicio y se verificó en sitio. Se cierra con acta de la cuadrilla.',
]
const SEG_CIERRE_APOYO = [
  'Apoyo entregado al ciudadano, firma de recibido en expediente. Se cierra.',
  'Se concluye la gestión: el ciudadano recibió el apoyo solicitado.',
  'Trámite resuelto por {dependencia}, el ciudadano ya fue notificado. Se cierra.',
  'Canalización concluida, el ciudadano confirma que ya fue atendido.',
]
const SEG_CIERRE_CANCELA = [
  'El ciudadano desiste de la solicitud, se cancela a petición suya.',
  'No procede: el domicilio corresponde a otro municipio. Se orientó al ciudadano.',
  'Se cancela por duplicidad, el caso ya se atiende en otro folio.',
  'Se cancela: tras la visita se constató que el problema ya no existe.',
  'Sin respuesta del ciudadano tras tres intentos de contacto. Se cierra sin atender.',
]
const SEG_ABIERTA = [
  'Petición registrada, pendiente de clasificar y turnar.',
  'Se recibió el reporte, falta confirmar el domicilio con el ciudadano.',
  'En revisión por el área de atención ciudadana antes de turnar.',
]
const SEG_NO_INTERPRETADA = [
  'El audio llegó incompleto, no se entiende la solicitud. Se pedirá al ciudadano que lo repita.',
  'El mensaje no especifica domicilio ni problema. Pendiente de contactar al remitente.',
  'Reporte recibido por redes sin datos suficientes para clasificarlo.',
]

// ------------------------------------------------------------------
// Utilidades de generación
// ------------------------------------------------------------------
function generarTelefono(rng: Rng, lada: string) {
  const faltan = 10 - lada.length
  let numero = lada
  for (let i = 0; i < faltan; i++) numero += entero(rng, 0, 9)
  return numero
}

function nombreCompleto(rng: Rng) {
  const sexo = rng() < 0.5 ? 'M' : 'F'
  const nombre = elegir(rng, sexo === 'M' ? NOMBRES_M : NOMBRES_F)
  const apellidoPaterno = elegir(rng, APELLIDOS)
  const apellidoMaterno = elegir(rng, APELLIDOS)
  return { sexo, nombre, apellidoPaterno, apellidoMaterno }
}

function rellenarPlantilla(rng: Rng, plantilla: string, colonia: string) {
  const calle1 = elegir(rng, CALLES)
  let calle2 = elegir(rng, CALLES)
  let intentos = 0
  while (calle2 === calle1 && intentos++ < 5) calle2 = elegir(rng, CALLES)
  return plantilla
    .replaceAll('{colonia}', colonia)
    .replaceAll('{calle1}', calle1)
    .replaceAll('{calle2}', calle2)
    .replaceAll('{dias}', elegir(rng, DIAS_FRASES))
    .replaceAll('{parentesco}', elegir(rng, PARENTESCOS))
    .replaceAll('{nivel}', elegir(rng, NIVELES))
}

/**
 * `usados` evita que una misma petición repita textualmente el mismo
 * movimiento dos veces: en una ficha de seis renglones se nota mucho.
 */
function textoSeguimiento(rng: Rng, pool: string[], dependencia: string, colonia: string, usados?: Set<string>) {
  let base = elegir(rng, pool)
  for (let intento = 0; usados?.has(base) && intento < 4; intento++) base = elegir(rng, pool)
  usados?.add(base)
  return base
    .replaceAll('{dependencia}', dependencia)
    .replaceAll('{colonia}', colonia)
    .replaceAll('{folio}', String(entero(rng, 1000, 9999)))
}

const aMedianoche = (f: Date) => new Date(f.getFullYear(), f.getMonth(), f.getDate())

/**
 * Lleva un movimiento de seguimiento a horario de oficina del mismo día,
 * sin salirse de la vida de la petición. Un gestor no registra una visita
 * a las 03:40 de la mañana, y en la ficha se nota.
 */
function momentoHabil(rng: Rng, instante: number, desde: number, hasta: number) {
  const d = new Date(instante)
  d.setHours(entero(rng, 8, 18), entero(rng, 0, 59), 0, 0)
  return new Date(Math.min(Math.max(d.getTime(), desde), hasta))
}

/**
 * Inserción multi-fila por lotes. Con 1,400 peticiones por cliente y sus
 * seguimientos, fila por fila no es opción; y de un solo golpe se rebasa
 * el tope de parámetros de un statement de Postgres.
 */
async function insertarPorLotes(tabla: string, filas: Record<string, unknown>[], tamano = 500) {
  for (let i = 0; i < filas.length; i += tamano) {
    await sql`insert into ${sql(tabla)} ${sql(filas.slice(i, i + tamano))}`
  }
}

// ------------------------------------------------------------------
// Calendario de 18 meses
// ------------------------------------------------------------------
const MESES_HISTORIA = 18
const TOTAL_PETICIONES = 1400
const TOTAL_CIUDADANOS = 400
const TOTAL_RECORRIDOS = 60
const TOTAL_EVENTOS = 45
/** Parte de las peticiones que nace de un recorrido o un evento concreto. */
const PARTE_DESDE_ACTIVIDAD = 0.22

type Dia = { fecha: Date; mes: number; base: number }

/**
 * Un día por cada uno de los últimos 18 meses, con su peso base:
 * tendencia de crecimiento (el programa se va conociendo), caída en fin
 * de semana y en la primera quincena de enero, más un poco de ruido para
 * que la serie no se vea dibujada con regla.
 *
 * El avance de día se hace sumando al número de día del mes, no sumando
 * 86,400,000 ms: con horario de verano el segundo camino se corre de hora
 * y termina saltándose o repitiendo fechas.
 */
function construirCalendario(rng: Rng, inicio: Date, hoy: Date): Dia[] {
  const dias: Dia[] = []
  const limite = aMedianoche(hoy).getTime()
  for (let i = 0; ; i++) {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)
    if (fecha.getTime() > limite) break
    dias.push({ fecha, mes: fecha.getMonth(), base: 0 })
  }
  const ultimo = Math.max(1, dias.length - 1)
  for (let i = 0; i < dias.length; i++) {
    const { fecha } = dias[i]
    const dow = fecha.getDay()
    const finde = dow === 0 ? 0.22 : dow === 6 ? 0.40 : 1
    const quincenaEnero = fecha.getMonth() === 0 && fecha.getDate() <= 15 ? 0.35 : 1
    const tendencia = 0.45 + 1.15 * (i / ultimo)
    const ruido = 0.80 + 0.40 * rng()
    dias[i].base = tendencia * finde * quincenaEnero * ruido
  }
  return dias
}

/** Resuelve cada pico a su ocurrencia más reciente dentro de la ventana. */
function resolverPicos(calendario: Dia[]) {
  const indicePorFecha = new Map<string, number>()
  calendario.forEach((d, i) => indicePorFecha.set(`${d.fecha.getFullYear()}-${d.fecha.getMonth()}-${d.fecha.getDate()}`, i))

  const resueltos: { pico: (typeof PICOS)[number]; desde: number; hasta: number }[] = []
  const anioFinal = calendario[calendario.length - 1].fecha.getFullYear()
  const anioInicial = calendario[0].fecha.getFullYear()
  for (const pico of PICOS) {
    for (let anio = anioFinal; anio >= anioInicial; anio--) {
      const desde = indicePorFecha.get(`${anio}-${pico.mes}-${pico.dia}`)
      if (desde !== undefined) {
        resueltos.push({ pico, desde, hasta: Math.min(desde + pico.duracion - 1, calendario.length - 1) })
        break
      }
    }
  }
  return resueltos
}

// ------------------------------------------------------------------
// Clientes a sembrar
// ------------------------------------------------------------------
const tenants = await sql<{ id: string; clave: string; nombre: string; nombre_corto: string | null }[]>`
  select id, clave, nombre, nombre_corto from tenants where clave in ('monterrey', 'chihuahua') order by clave`

const hoy = new Date()
const inicioVentana = aMedianoche(new Date(hoy.getFullYear(), hoy.getMonth() - MESES_HISTORIA, hoy.getDate()))

for (const tenant of tenants) {
  const corto = tenant.nombre_corto ?? tenant.nombre
  // El script corre con el rol dueño, que en local es superusuario y por
  // tanto NO está sujeto a Row Level Security: `set_config` queda como
  // declaración de intención, pero el aislamiento real lo da el
  // `where tenant_id = ...` explícito de cada consulta de abajo.
  await sql`select set_config('app.tenant_id', ${tenant.id}, false)`

  console.log(`\n  ${corto} — borrando datos de demostración previos...`)

  // Orden de borrado respetando llaves foráneas: lo que depende va primero.
  await sql`delete from peticion_seguimientos where tenant_id = ${tenant.id}`
  await sql`delete from recorrido_peticiones where tenant_id = ${tenant.id}`
  await sql`delete from evento_peticiones where tenant_id = ${tenant.id}`
  await sql`delete from recorrido_asistentes where tenant_id = ${tenant.id}`
  await sql`delete from evento_asistentes where tenant_id = ${tenant.id}`
  await sql`delete from recorrido_responsables where tenant_id = ${tenant.id}`
  await sql`delete from evento_responsables where tenant_id = ${tenant.id}`
  await sql`delete from peticiones where tenant_id = ${tenant.id}`
  await sql`delete from eventos where tenant_id = ${tenant.id}`
  await sql`delete from recorridos where tenant_id = ${tenant.id}`
  await sql`delete from ciudadanos where tenant_id = ${tenant.id}`
  await sql`delete from operadores where tenant_id = ${tenant.id}`
  await sql`delete from subproblematicas where tenant_id = ${tenant.id}`
  await sql`delete from problematicas where tenant_id = ${tenant.id}`
  await sql`delete from estatus_peticiones where tenant_id = ${tenant.id}`
  await sql`delete from prioridades where tenant_id = ${tenant.id}`
  await sql`delete from fuentes where tenant_id = ${tenant.id}`
  await sql`delete from dependencias where tenant_id = ${tenant.id}`
  await sql`delete from vestimentas where tenant_id = ${tenant.id}`
  await sql`delete from tipos_visita where tenant_id = ${tenant.id}`

  const rng = mulberry32((semillaDesdeTexto(tenant.clave) ^ SEMILLA_BASE) >>> 0)
  const colonias = COLONIAS_POR_TENANT[tenant.clave] ?? COLONIAS_POR_TENANT.monterrey
  const lada = LADA_POR_TENANT[tenant.clave] ?? '55'
  const cpBase = CP_BASE_POR_TENANT[tenant.clave] ?? 60000

  // --- Catálogos de operación -----------------------------------------
  const problematicasInsertadas = await sql<{ id: string; titulo: string }[]>`
    insert into problematicas ${sql(
      PROBLEMATICAS.map((p) => ({ tenant_id: tenant.id, titulo: p.titulo, descripcion: null, color_rgb: p.color })),
    )}
    returning id, titulo`
  const idProblematica = new Map(problematicasInsertadas.map((p) => [p.titulo, p.id]))

  const filasSubproblematicas = PROBLEMATICAS.flatMap((p) =>
    p.subs.map((s) => ({ tenant_id: tenant.id, problematica_id: idProblematica.get(p.titulo)!, titulo: s.titulo, descripcion: null })),
  )
  const subproblematicasInsertadas = await sql<{ id: string; problematica_id: string; titulo: string }[]>`
    insert into subproblematicas ${sql(filasSubproblematicas)}
    returning id, problematica_id, titulo`

  // Mapa: título de problemática -> lista de { id, titulo, plantillas } de sus subproblemáticas
  const subsPorProblematica = new Map<string, { id: string; titulo: string; plantillas: string[] }[]>()
  for (const p of PROBLEMATICAS) {
    const filas = subproblematicasInsertadas
      .filter((s) => s.problematica_id === idProblematica.get(p.titulo))
      .map((s) => ({ id: s.id, titulo: s.titulo, plantillas: p.subs.find((sub) => sub.titulo === s.titulo)!.plantillas }))
    subsPorProblematica.set(p.titulo, filas)
  }

  const estatusInsertados = await sql<{ id: string; descripcion: string }[]>`
    insert into estatus_peticiones ${sql(ESTATUS.map((descripcion) => ({ tenant_id: tenant.id, descripcion })))}
    returning id, descripcion`
  const idEstatus = new Map(estatusInsertados.map((e) => [e.descripcion, e.id]))

  const prioridadesInsertadas = await sql<{ id: string; descripcion: string }[]>`
    insert into prioridades ${sql(PRIORIDADES.map((descripcion) => ({ tenant_id: tenant.id, descripcion })))}
    returning id, descripcion`
  const idPrioridad = new Map(prioridadesInsertadas.map((p) => [p.descripcion, p.id]))

  const fuentesInsertadas = await sql<{ id: string; descripcion: string }[]>`
    insert into fuentes ${sql(FUENTES.map((descripcion) => ({ tenant_id: tenant.id, descripcion })))}
    returning id, descripcion`
  const idFuente = new Map(fuentesInsertadas.map((f) => [f.descripcion, f.id]))

  const dependenciasInsertadas = await sql<{ id: string; clave: string; descripcion: string }[]>`
    insert into dependencias ${sql(
      DEPENDENCIAS_BASE.map((d) => {
        const persona = nombreCompleto(rng)
        return {
          tenant_id: tenant.id,
          clave: d.clave,
          descripcion: d.descripcion,
          contacto: `${persona.nombre} ${persona.apellidoPaterno} ${persona.apellidoMaterno}`,
          contacto_puesto: elegir(rng, PUESTOS_CONTACTO),
          telefono_fijo: generarTelefono(rng, lada),
        }
      }),
    )}
    returning id, clave, descripcion`
  const dependenciaPorClave = new Map(dependenciasInsertadas.map((d) => [d.clave, d]))

  // --- Operadores -------------------------------------------------------
  // `peticiones.operador_id` apunta a `operadores`, y `operadores.usuario_id`
  // es NOT NULL contra `usuarios`: no hay forma de colgar la petición
  // directamente de un usuario. Así que se siembra un `operador` por cada
  // usuario del cliente —los cinco que crea db/seed.mts— y la petición se
  // asigna a través de él. No se crean usuarios nuevos a propósito: la
  // prueba de aislamiento exige exactamente cinco por cliente.
  const usuarios = await sql<{ id: string; nombre: string; apellido_paterno: string | null }[]>`
    select id, nombre, apellido_paterno from usuarios
    where tenant_id = ${tenant.id} order by correo`

  const filasOperadores = usuarios.map((u) => ({ id: uuid(rng), tenant_id: tenant.id, usuario_id: u.id, activo: true }))
  if (filasOperadores.length) await insertarPorLotes('operadores', filasOperadores)

  const operadores = filasOperadores.map((o, i) => ({
    id: o.id,
    usuarioId: o.usuario_id,
    nombre: `${usuarios[i].nombre} ${usuarios[i].apellido_paterno ?? ''}`.trim(),
    ...PERFIL_OPERADOR[i % PERFIL_OPERADOR.length],
  }))
  const pesosOperador: [typeof operadores[number], number][] = operadores.map((o) => [o, o.carga])

  // --- Enlaces blandos con datos ya sembrados por db/seed.mts ----------
  const [campania] = await sql<{ id: string }[]>`select id from campanias where tenant_id = ${tenant.id} limit 1`

  // --- Calendario, estacionalidad y picos -------------------------------
  const calendario = construirCalendario(rng, inicioVentana, hoy)
  const picos = resolverPicos(calendario)

  // Un acumulado de pesos por problemática: la estacionalidad de cada una
  // deforma el mismo calendario base, y encima se aplican los picos.
  const acumuladoPorProblematica = new Map<string, Float64Array>()
  for (const p of PROBLEMATICAS) {
    const perfil = PERFIL_PROBLEMATICA[p.titulo]
    const acumulado = new Float64Array(calendario.length)
    let suma = 0
    for (let i = 0; i < calendario.length; i++) {
      let peso = calendario[i].base * perfil.estacion[calendario[i].mes]
      for (const { pico, desde, hasta } of picos) {
        if (i >= desde && i <= hasta && pico.problematicas.includes(p.titulo)) peso *= pico.factor
      }
      suma += peso
      acumulado[i] = suma
    }
    acumuladoPorProblematica.set(p.titulo, acumulado)
  }
  // Calendario genérico (sin estacionalidad) para recorridos y eventos.
  const acumuladoGenerico = new Float64Array(calendario.length)
  {
    let suma = 0
    for (let i = 0; i < calendario.length; i++) {
      suma += calendario[i].base
      acumuladoGenerico[i] = suma
    }
  }

  const pesosProblematica: [(typeof PROBLEMATICAS)[number], number][] =
    PROBLEMATICAS.map((p) => [p, PERFIL_PROBLEMATICA[p.titulo].peso])
  /** Reparto de problemáticas ponderado por la estacionalidad de ese mes. */
  function problematicaDelMes(rng: Rng, mes: number) {
    return elegirPeso(rng, PROBLEMATICAS.map((p) => [p, PERFIL_PROBLEMATICA[p.titulo].peso * PERFIL_PROBLEMATICA[p.titulo].estacion[mes]] as [(typeof PROBLEMATICAS)[number], number]))
  }

  // --- Ciudadanos --------------------------------------------------------
  // Cola larga por colonia: unas pocas concentran la demanda y el resto
  // aporta poco. Sin esto, un mapa o un ranking no tienen nada que mostrar.
  const pesosColonia: [string, number][] = colonias.map((c, i) => [c, 1 / Math.pow(i + 1, 0.9)])

  const filasCiudadanos = Array.from({ length: TOTAL_CIUDADANOS }, () => {
    const persona = nombreCompleto(rng)
    const edad = entero(rng, 18, 85)
    const fechaNacimiento = new Date(hoy.getFullYear() - edad, entero(rng, 0, 11), entero(rng, 1, 28))
    const colonia = elegirPeso(rng, pesosColonia)
    const calle = elegir(rng, CALLES)
    const numeroExt = String(entero(rng, 100, 4890))
    return {
      id: uuid(rng),
      tenant_id: tenant.id,
      nombre: persona.nombre,
      apellido_paterno: persona.apellidoPaterno,
      apellido_materno: persona.apellidoMaterno,
      nombre_completo: `${persona.nombre} ${persona.apellidoPaterno} ${persona.apellidoMaterno}`,
      sexo: persona.sexo,
      fecha_nacimiento: fechaNacimiento,
      edad,
      calle,
      numero_ext: numeroExt,
      direccion: `${calle} ${numeroExt}, Col. ${colonia}`,
      colonia,
      codigo_postal: String(cpBase + ((colonias.indexOf(colonia) * 13 + 7) % 900)),
      telefono_movil: generarTelefono(rng, lada),
      telefono_fijo: rng() < 0.40 ? generarTelefono(rng, lada) : null,
      activo: true,
      seccion_id: null,
    }
  })
  await insertarPorLotes('ciudadanos', filasCiudadanos)

  // Unos vecinos son recurrentes y otros levantan una sola petición en 18
  // meses: así el padrón también tiene cola larga, no solo el territorio.
  const ciudadanos = filasCiudadanos.map((c) => ({
    id: c.id,
    colonia: c.colonia,
    peso: rng() < 0.04 ? 8 : rng() < 0.16 ? 3 : 1,
  }))
  const pesosCiudadano: [typeof ciudadanos[number], number][] = ciudadanos.map((c) => [c, c.peso])
  const ciudadanosPorColonia = new Map<string, typeof ciudadanos>()
  for (const c of ciudadanos) {
    const lista = ciudadanosPorColonia.get(c.colonia) ?? []
    lista.push(c)
    ciudadanosPorColonia.set(c.colonia, lista)
  }

  // --- Recorridos y eventos ---------------------------------------------
  // Se generan antes que las peticiones: una parte de la demanda nace
  // justamente de haber salido a la calle ese día.
  type Actividad = {
    id: string
    tipo: 'recorrido' | 'evento'
    colonia: string
    fecha: Date
    horaInicia: Date
    horaTermina: Date
    reales: number
    usuarioId: string
  }

  function generarActividades(
    tipo: 'recorrido' | 'evento',
    cantidad: number,
    titulos: string[],
    rangoProgramados: [number, number],
  ) {
    const filas: Record<string, unknown>[] = []
    const meta: Actividad[] = []
    const forzadas = picos.filter((p) => p.pico.actividad.tipo === tipo)

    for (let i = 0; i < cantidad; i++) {
      const forzada = i < forzadas.length ? forzadas[i] : null
      const indiceDia = forzada ? forzada.desde : elegirAcumulado(rng, acumuladoGenerico)
      const dia = calendario[indiceDia].fecha
      const colonia = elegirPeso(rng, pesosColonia)
      const horaInicia = new Date(dia)
      horaInicia.setHours(entero(rng, 9, 13), entero(rng, 0, 59), 0, 0)
      const horaTermina = new Date(horaInicia.getTime() + entero(rng, 2, 5) * 3600000)
      const programados = forzada
        ? entero(rng, forzada.pico.actividad.asistentes[0], forzada.pico.actividad.asistentes[1])
        : entero(rng, rangoProgramados[0], rangoProgramados[1])
      const reales = Math.max(5, Math.round(programados * (0.55 + rng() * 0.55)))
      const usuario = elegir(rng, usuarios)
      const titulo = (forzada ? forzada.pico.actividad.titulo : elegir(rng, titulos)).replaceAll('{colonia}', colonia)
      const id = uuid(rng)

      const comun = {
        id,
        tenant_id: tenant.id,
        campania_id: campania?.id ?? null,
        usuario_responsable_id: usuario.id,
        titulo,
        descripcion: forzada
          ? `${forzada.pico.nombre}: atención extraordinaria a vecinos de la colonia ${colonia}.`
          : `Actividad de gestión social con atención a vecinos de la colonia ${colonia}.`,
        colonia,
        hora_inicia: horaInicia,
        hora_termina: horaTermina,
        asistentes_programados: programados,
        asistentes_reales: reales,
        prensa: rng() < 0.3,
        montaje: rng() < 0.45,
        detalle_logistica: `Módulo de atención, lona institucional y ${entero(rng, 2, 8)} gestores en sitio.`,
        notas_adicionales: forzada ? 'Operativo extraordinario, se reforzó con personal de otras zonas.' : null,
        activo: true,
      }

      filas.push(
        tipo === 'recorrido'
          ? {
              ...comun,
              fecha_recorrido: aMedianoche(dia),
              punto_inicia: `Cruce de ${elegir(rng, CALLES)} y ${elegir(rng, CALLES)}`,
              punto_finaliza: `Plaza de la colonia ${colonia}`,
            }
          : {
              ...comun,
              fecha_evento: aMedianoche(dia),
              calle: elegir(rng, CALLES),
              numero: String(entero(rng, 100, 2800)),
              entre_calle_1: elegir(rng, CALLES),
              entre_calle_2: elegir(rng, CALLES),
              codigo_postal: String(cpBase + ((colonias.indexOf(colonia) * 13 + 7) % 900)),
            },
      )
      meta.push({ id, tipo, colonia, fecha: dia, horaInicia, horaTermina, reales, usuarioId: usuario.id })
    }
    return { filas, meta }
  }

  const recorridos = generarActividades('recorrido', TOTAL_RECORRIDOS, TITULOS_RECORRIDO, [25, 90])
  const eventos = generarActividades('evento', TOTAL_EVENTOS, TITULOS_EVENTO, [80, 400])
  await insertarPorLotes('recorridos', recorridos.filas, 200)
  await insertarPorLotes('eventos', eventos.filas, 200)

  // Asistentes: se arman con vecinos de la propia colonia cuando los hay,
  // y se completan con el resto del padrón.
  function filasAsistentes(meta: Actividad[], rango: [number, number], llaveActividad: string, tabla: string) {
    const filas: Record<string, unknown>[] = []
    for (const a of meta) {
      const locales = ciudadanosPorColonia.get(a.colonia) ?? []
      const cuantos = Math.min(entero(rng, rango[0], rango[1]), ciudadanos.length)
      const deLaColonia = muestrear(rng, locales, Math.min(cuantos, Math.ceil(cuantos * 0.7)))
      const vistos = new Set(deLaColonia.map((c) => c.id))
      for (const extra of muestrear(rng, ciudadanos, cuantos * 2)) {
        if (vistos.size >= cuantos) break
        vistos.add(extra.id)
      }
      for (const id of vistos) {
        filas.push({ id: uuid(rng), tenant_id: tenant.id, [llaveActividad]: a.id, ciudadano_id: id, activo: true })
      }
    }
    return { tabla, filas }
  }

  const asistentesRecorrido = filasAsistentes(recorridos.meta, [6, 22], 'recorrido_id', 'recorrido_asistentes')
  const asistentesEvento = filasAsistentes(eventos.meta, [12, 40], 'evento_id', 'evento_asistentes')
  await insertarPorLotes(asistentesRecorrido.tabla, asistentesRecorrido.filas, 800)
  await insertarPorLotes(asistentesEvento.tabla, asistentesEvento.filas, 800)

  // Responsables adicionales: el titular más uno o dos de apoyo.
  function filasResponsables(meta: Actividad[], llaveActividad: string) {
    const filas: Record<string, unknown>[] = []
    for (const a of meta) {
      const vistos = new Set<string>([a.usuarioId])
      for (const u of muestrear(rng, usuarios, entero(rng, 1, 2))) vistos.add(u.id)
      for (const usuarioId of vistos) {
        filas.push({ id: uuid(rng), tenant_id: tenant.id, [llaveActividad]: a.id, usuario_id: usuarioId, activo: true })
      }
    }
    return filas
  }
  await insertarPorLotes('recorrido_responsables', filasResponsables(recorridos.meta, 'recorrido_id'), 500)
  await insertarPorLotes('evento_responsables', filasResponsables(eventos.meta, 'evento_id'), 500)

  // Las actividades grandes derraman más peticiones que las chicas, pero
  // la raíz amortigua la diferencia: con el peso crudo los eventos —que
  // convocan diez veces más gente— se quedaban con todo y los recorridos
  // aparecían sin una sola petición en su ficha.
  const pesosActividad: [Actividad, number][] = [...recorridos.meta, ...eventos.meta].map((a) => [a, Math.sqrt(a.reales)])
  // Antes de repartir por peso, cada actividad se lleva una petición: así
  // ninguna ficha de recorrido o evento queda sin nada que mostrar.
  const actividadesSinPeticion = muestrear(rng, [...recorridos.meta, ...eventos.meta], recorridos.meta.length + eventos.meta.length)

  // --- Peticiones --------------------------------------------------------
  type Contexto = {
    id: string
    apertura: Date
    cierre: Date | null
    estatus: string
    dependencia: string
    colonia: string
    operadorUsuarioId: string
    diasPrevistos: number
    apoyo: boolean
  }

  const filasPeticiones: Record<string, unknown>[] = []
  const contextos: Contexto[] = []
  const filasRecorridoPeticiones: Record<string, unknown>[] = []
  const filasEventoPeticiones: Record<string, unknown>[] = []
  const peticionesPorCiudadano = new Map<string, number>()

  const hoyMs = hoy.getTime()
  const ventanaMs = hoyMs - inicioVentana.getTime()

  for (let i = 0; i < TOTAL_PETICIONES; i++) {
    const desdeActividad = rng() < PARTE_DESDE_ACTIVIDAD
    let actividad: Actividad | null = null
    let apertura: Date
    let problematica: (typeof PROBLEMATICAS)[number]
    let ciudadano: (typeof ciudadanos)[number]
    let fuenteId: string

    if (desdeActividad) {
      actividad = actividadesSinPeticion.pop() ?? elegirPeso(rng, pesosActividad)
      // La petición se levanta durante la actividad o en las horas siguientes.
      apertura = new Date(actividad.horaInicia.getTime() + entero(rng, 0, 7) * 3600000 + entero(rng, 0, 59) * 60000)
      if (apertura.getTime() > hoyMs) apertura = new Date(hoyMs - 3600000)
      problematica = problematicaDelMes(rng, apertura.getMonth())
      const locales = ciudadanosPorColonia.get(actividad.colonia) ?? []
      ciudadano = locales.length ? elegir(rng, locales) : elegirPeso(rng, pesosCiudadano)
      fuenteId = idFuente.get(actividad.tipo === 'recorrido' ? 'Recorrido' : 'Evento')!
    } else {
      problematica = elegirPeso(rng, pesosProblematica)
      const indiceDia = elegirAcumulado(rng, acumuladoPorProblematica.get(problematica.titulo)!)
      apertura = new Date(calendario[indiceDia].fecha)
      apertura.setHours(entero(rng, 8, 19), entero(rng, 0, 59), 0, 0)
      if (apertura.getTime() > hoyMs) apertura = new Date(hoyMs - 3600000)
      ciudadano = elegirPeso(rng, pesosCiudadano)
      fuenteId = idFuente.get(elegirPeso(rng, FUENTES_ESPONTANEAS))!
    }

    const perfil = PERFIL_PROBLEMATICA[problematica.titulo]
    const sub = elegir(rng, subsPorProblematica.get(problematica.titulo)!)
    const descripcion = rellenarPlantilla(rng, elegir(rng, sub.plantillas), ciudadano.colonia)
    const prioridad = elegirPeso(rng, [
      ['Urgente', perfil.prioridad[0]], ['Alta', perfil.prioridad[1]],
      ['Normal', perfil.prioridad[2]], ['Baja', perfil.prioridad[3]],
    ] as [string, number][])
    const dependencia = dependenciaPorClave.get(elegirPeso(rng, perfil.dependencias))!
    const operador = elegirPeso(rng, pesosOperador)

    // Tiempo de resolución: naturaleza del caso × urgencia × gestor que lo
    // lleva × curva de aprendizaje del equipo, con dispersión lognormal.
    const progreso = Math.min(1, Math.max(0, (apertura.getTime() - inicioVentana.getTime()) / ventanaMs))
    // Curva de aprendizaje: se mejora rápido al principio y luego se llega
    // a un piso. Tiene que ser lo bastante pronunciada para que la mejora
    // se vea en la serie trimestral aun contra la estacionalidad, que en
    // otoño carga la mezcla de Obra Pública y Desarrollo Social —las dos
    // problemáticas más lentas— y por sí sola empujaría la mediana arriba.
    const factorAprendizaje = 0.55 + 1.15 * Math.exp(-3.0 * progreso)
    const diasPrevistos = Math.min(
      420,
      Math.max(0.08, perfil.diasBase * FACTOR_PRIORIDAD[prioridad] * factorAprendizaje * operador.tiempo * Math.exp(0.6 * normalEstandar(rng))),
    )

    const antiguedadDias = (hoyMs - apertura.getTime()) / DIA_MS
    const sorteo = rng()
    let estatus: string
    let cierre: Date | null = null

    if (sorteo < 0.030) {
      // Se canceló: desistimiento, duplicidad o no procedía.
      estatus = 'Cancelada'
      const tope = Math.min(entero(rng, 1, 14) * DIA_MS, Math.max(DIA_MS * 0.1, (hoyMs - apertura.getTime()) * 0.8))
      cierre = new Date(apertura.getTime() + Math.max(3600000, tope))
    } else if (sorteo < 0.062) {
      // Llegó por audio o por redes y nunca se pudo clasificar.
      estatus = 'No interpretada'
    } else {
      // Rezago: casos viejos que se quedaron trabados. Son los que un
      // director quiere ver antes que ningún otro. Unos se atoraron en la
      // dependencia ('En gestión') y otros ni siquiera avanzaron de ahí
      // ('En proceso').
      const rezagada = antiguedadDias > 100 && rng() < 0.11
      if (!rezagada && apertura.getTime() + diasPrevistos * DIA_MS <= hoyMs) {
        estatus = 'Completada'
        cierre = new Date(apertura.getTime() + diasPrevistos * DIA_MS)
      } else if (rezagada) {
        estatus = rng() < 0.7 ? 'En gestión' : 'En proceso'
      } else {
        const avance = antiguedadDias / diasPrevistos
        estatus = avance < 0.3 ? 'Abierta' : avance < 0.75 ? 'En proceso' : 'En gestión'
      }
    }
    // El cierre se captura en horario de oficina, igual que el resto de los
    // movimientos; nunca antes de la apertura ni en el futuro.
    if (cierre) {
      cierre = momentoHabil(rng, cierre.getTime(), apertura.getTime() + 3600000, hoyMs)
    }

    const id = uuid(rng)
    filasPeticiones.push({
      id,
      tenant_id: tenant.id,
      ciudadano_id: ciudadano.id,
      problematica_id: idProblematica.get(problematica.titulo)!,
      subproblematica_id: sub.id,
      descripcion,
      fecha_apertura: apertura,
      fecha_cierre: cierre,
      fuente_id: fuenteId,
      operador_id: operador.id,
      estatus_id: idEstatus.get(estatus)!,
      prioridad_id: idPrioridad.get(prioridad)!,
      dependencia_id: dependencia.id,
      activo: true,
    })
    contextos.push({
      id, apertura, cierre, estatus,
      dependencia: dependencia.descripcion,
      colonia: ciudadano.colonia,
      operadorUsuarioId: operador.usuarioId,
      diasPrevistos,
      apoyo: perfil.apoyo,
    })
    peticionesPorCiudadano.set(ciudadano.id, (peticionesPorCiudadano.get(ciudadano.id) ?? 0) + 1)

    if (actividad) {
      const fila = { id: uuid(rng), tenant_id: tenant.id, peticion_id: id, activo: true }
      if (actividad.tipo === 'recorrido') filasRecorridoPeticiones.push({ ...fila, recorrido_id: actividad.id })
      else filasEventoPeticiones.push({ ...fila, evento_id: actividad.id })
    }
  }

  await insertarPorLotes('peticiones', filasPeticiones, 400)
  await insertarPorLotes('recorrido_peticiones', filasRecorridoPeticiones, 500)
  await insertarPorLotes('evento_peticiones', filasEventoPeticiones, 500)

  // El padrón guarda su propio contador; se cuadra con lo recién sembrado.
  await sql`
    update ciudadanos c
    set numero_peticiones = (
      select count(*) from peticiones p
      where p.ciudadano_id = c.id and p.tenant_id = ${tenant.id}
    )
    where c.tenant_id = ${tenant.id}`

  // --- Seguimientos -------------------------------------------------------
  // Entre 1 y 6 movimientos por petición, con fechas dentro de la vida del
  // caso y más movimiento en los que tardaron más.
  const filasSeguimientos: Record<string, unknown>[] = []
  for (const ctx of contextos) {
    const usuarioPrincipal = ctx.operadorUsuarioId
    const quien = () => (rng() < 0.8 ? usuarioPrincipal : elegir(rng, usuarios).id)
    const fin = (ctx.cierre ?? hoy).getTime()
    const inicio = ctx.apertura.getTime() + 60000
    const ventana = Math.max(fin - ctx.apertura.getTime(), 3600000)

    if (ctx.estatus === 'No interpretada') {
      filasSeguimientos.push({
        id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: quien(),
        tipo: 'nota', detalle: elegir(rng, SEG_NO_INTERPRETADA),
        estatus_anterior: null, estatus_nuevo: null,
        recordar_el: rng() < 0.4 ? new Date(fin + entero(rng, 2, 10) * DIA_MS) : null,
        creado_en: momentoHabil(rng, ctx.apertura.getTime() + Math.min(ventana * 0.3, 2 * DIA_MS), inicio, fin),
      })
      continue
    }

    if (ctx.estatus === 'Abierta') {
      const cuantos = entero(rng, 1, 2)
      const recien: Record<string, unknown>[] = []
      for (let k = 0; k < cuantos; k++) {
        const tipo = k === 0 ? 'nota' : 'llamada'
        recien.push({
          id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: quien(),
          tipo,
          detalle: k === 0
            ? elegir(rng, SEG_ABIERTA)
            : textoSeguimiento(rng, [...SEG_LLAMADA, ...(ctx.apoyo ? SEG_LLAMADA_APOYO : SEG_LLAMADA_OBRA)], ctx.dependencia, ctx.colonia),
          estatus_anterior: null, estatus_nuevo: null,
          recordar_el: k === cuantos - 1 && rng() < 0.45 ? new Date(fin + entero(rng, 2, 9) * DIA_MS) : null,
          creado_en: momentoHabil(rng, ctx.apertura.getTime() + ventana * (0.15 + 0.5 * k + 0.2 * rng()), inicio, fin),
        })
      }
      recien.sort((a, b) => (a.creado_en as Date).getTime() - (b.creado_en as Date).getTime())
      filasSeguimientos.push(...recien)
      continue
    }

    // Caso normal: turnado, gestión intermedia y, si cerró, cambio final.
    const movimientos: Record<string, unknown>[] = []
    movimientos.push({
      id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: usuarioPrincipal,
      tipo: 'cambio_estatus',
      detalle: textoSeguimiento(rng, SEG_TURNADO, ctx.dependencia, ctx.colonia),
      estatus_anterior: 'Abierta', estatus_nuevo: 'En proceso',
      recordar_el: null,
      creado_en: momentoHabil(rng, ctx.apertura.getTime() + Math.min(ventana * 0.08, 1.5 * DIA_MS), inicio, fin),
    })

    const cerrada = ctx.cierre !== null
    const maximosIntermedios = cerrada ? 4 : 5
    const intermedios = Math.min(
      maximosIntermedios,
      Math.max(0, Math.round(ctx.diasPrevistos / 16) + (rng() < 0.45 ? 1 : 0)),
    )
    const fracciones = Array.from({ length: intermedios }, () => 0.15 + 0.72 * rng()).sort((a, b) => a - b)
    const textosUsados = new Set<string>()
    for (let k = 0; k < intermedios; k++) {
      const tipo = elegirPeso(rng, [['llamada', 45], ['nota', 38], ['visita', 17]] as [string, number][])
      const pool = tipo === 'llamada'
        ? [...SEG_LLAMADA, ...(ctx.apoyo ? SEG_LLAMADA_APOYO : SEG_LLAMADA_OBRA)]
        : tipo === 'visita'
          ? [...SEG_VISITA, ...(ctx.apoyo ? SEG_VISITA_APOYO : SEG_VISITA_OBRA)]
          : [...SEG_NOTA, ...(ctx.apoyo ? SEG_NOTA_APOYO : SEG_NOTA_OBRA)]
      movimientos.push({
        id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: quien(),
        tipo,
        detalle: textoSeguimiento(rng, pool, ctx.dependencia, ctx.colonia, textosUsados),
        estatus_anterior: null, estatus_nuevo: null,
        recordar_el: !cerrada && k === intermedios - 1 && rng() < 0.35
          ? new Date(fin + entero(rng, 3, 12) * DIA_MS)
          : null,
        creado_en: momentoHabil(rng, ctx.apertura.getTime() + ventana * fracciones[k], inicio, fin),
      })
    }

    if (cerrada) {
      const cancelada = ctx.estatus === 'Cancelada'
      movimientos.push({
        id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: usuarioPrincipal,
        tipo: 'cambio_estatus',
        detalle: textoSeguimiento(
          rng,
          cancelada ? SEG_CIERRE_CANCELA : ctx.apoyo ? SEG_CIERRE_APOYO : SEG_CIERRE_OBRA,
          ctx.dependencia,
          ctx.colonia,
        ),
        estatus_anterior: intermedios > 1 ? 'En gestión' : 'En proceso',
        estatus_nuevo: cancelada ? 'Cancelada' : 'Completada',
        recordar_el: null,
        creado_en: new Date(fin),
      })
    } else if (intermedios === 0) {
      // Sin movimientos intermedios al menos queda el cambio de estatus a
      // la etapa en la que se quedó parada.
      movimientos.push({
        id: uuid(rng), tenant_id: tenant.id, peticion_id: ctx.id, usuario_id: usuarioPrincipal,
        tipo: 'cambio_estatus',
        detalle: `Sin respuesta de ${ctx.dependencia}; el caso permanece en ${ctx.estatus.toLowerCase()}.`,
        estatus_anterior: 'En proceso', estatus_nuevo: ctx.estatus,
        recordar_el: new Date(fin + entero(rng, 3, 12) * DIA_MS),
        creado_en: momentoHabil(rng, ctx.apertura.getTime() + ventana * 0.6, inicio, fin),
      })
    }

    movimientos.sort((a, b) => (a.creado_en as Date).getTime() - (b.creado_en as Date).getTime())
    filasSeguimientos.push(...movimientos)
  }
  await insertarPorLotes('peticion_seguimientos', filasSeguimientos, 600)

  // --- Resumen ------------------------------------------------------------
  const finPrimerTrimestre = new Date(inicioVentana.getFullYear(), inicioVentana.getMonth() + 3, inicioVentana.getDate())
  const inicioUltimoTrimestre = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate())

  const [{ n: totalCiudadanos }] = await sql<{ n: string }[]>`select count(*) as n from ciudadanos where tenant_id = ${tenant.id}`
  const porEstatus = await sql<{ descripcion: string; n: string }[]>`
    select e.descripcion, count(*) as n
    from peticiones p join estatus_peticiones e on e.id = p.estatus_id
    where p.tenant_id = ${tenant.id}
    group by e.descripcion order by count(*) desc`
  const [tramos] = await sql<{ primero: number | null; ultimo: number | null }[]>`
    select
      percentile_cont(0.5) within group (
        order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
      ) filter (where p.fecha_apertura < ${finPrimerTrimestre}) as primero,
      percentile_cont(0.5) within group (
        order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
      ) filter (where p.fecha_apertura >= ${inicioUltimoTrimestre}) as ultimo
    from peticiones p join estatus_peticiones e on e.id = p.estatus_id
    where p.tenant_id = ${tenant.id} and e.descripcion = 'Completada' and p.fecha_cierre is not null`
  const [conteos] = await sql<{ seguimientos: string; recorridos: string; eventos: string; vinculos: string; asistentes: string }[]>`
    select
      (select count(*) from peticion_seguimientos where tenant_id = ${tenant.id}) as seguimientos,
      (select count(*) from recorridos where tenant_id = ${tenant.id}) as recorridos,
      (select count(*) from eventos where tenant_id = ${tenant.id}) as eventos,
      (select count(*) from recorrido_peticiones where tenant_id = ${tenant.id})
        + (select count(*) from evento_peticiones where tenant_id = ${tenant.id}) as vinculos,
      (select count(*) from recorrido_asistentes where tenant_id = ${tenant.id})
        + (select count(*) from evento_asistentes where tenant_id = ${tenant.id}) as asistentes`
  const cargaOperador = await sql<{ gestor: string; n: string; mediana: number | null }[]>`
    select nullif(trim(concat_ws(' ', u.nombre, u.apellido_paterno)), '') as gestor,
           count(*) as n,
           percentile_cont(0.5) within group (
             order by extract(epoch from (p.fecha_cierre - p.fecha_apertura)) / 86400
           ) filter (where p.fecha_cierre is not null) as mediana
    from peticiones p
    join operadores o on o.id = p.operador_id
    join usuarios u on u.id = o.usuario_id
    where p.tenant_id = ${tenant.id}
    group by 1 order by count(*) desc`
  const topColonias = await sql<{ colonia: string; n: string }[]>`
    select c.colonia, count(*) as n
    from peticiones p join ciudadanos c on c.id = p.ciudadano_id
    where p.tenant_id = ${tenant.id}
    group by 1 order by count(*) desc limit 3`

  // --- Vestimenta y tipo de visita --------------------------------------
  // La ficha de actividad los muestra; sin ellos salía «—» en ambos campos.
  const vestimentas = ['Casual', 'Formal', 'Camisa de campaña', 'Deportiva']
  const tiposVisita = ['Gira', 'Casa por casa', 'Reunión vecinal', 'Entrega de apoyos', 'Supervisión de obra']

  await sql`
    insert into vestimentas ${sql(vestimentas.map((d) => ({ tenant_id: tenant.id, descripcion: d })))}`
  await sql`
    insert into tipos_visita ${sql(tiposVisita.map((d) => ({ tenant_id: tenant.id, descripcion: d })))}`

  // Reparto estable por posición: la misma actividad siempre recibe lo mismo.
  await sql`
    update recorridos r set vestimenta_id = v.id
    from (select id, row_number() over (order by descripcion) - 1 as n
          from vestimentas where tenant_id = ${tenant.id}) v
    where r.tenant_id = ${tenant.id}
      and v.n = abs(hashtext(r.id::text)) % ${vestimentas.length}`

  await sql`
    update eventos e set vestimenta_id = v.id
    from (select id, row_number() over (order by descripcion) - 1 as n
          from vestimentas where tenant_id = ${tenant.id}) v
    where e.tenant_id = ${tenant.id}
      and v.n = abs(hashtext(e.id::text)) % ${vestimentas.length}`

  await sql`
    update eventos e set tipo_visita_id = t.id
    from (select id, row_number() over (order by descripcion) - 1 as n
          from tipos_visita where tenant_id = ${tenant.id}) t
    where e.tenant_id = ${tenant.id}
      and t.n = abs(hashtext(e.id::text || 'visita')) % ${tiposVisita.length}`

  const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} d`)
  console.log(`  ${corto}:`)
  console.log(`    ciudadanos: ${totalCiudadanos} · peticiones: ${filasPeticiones.length} · 18 meses`)
  console.log(`    peticiones por estatus: ${porEstatus.map((f) => `${f.descripcion} ${f.n}`).join(', ')}`)
  console.log(`    mediana de resolución: 1er trimestre ${fmt(tramos.primero)} → último trimestre ${fmt(tramos.ultimo)}`)
  console.log(`    seguimientos: ${conteos.seguimientos} · recorridos: ${conteos.recorridos} · eventos: ${conteos.eventos}`)
  console.log(`    peticiones ligadas a una actividad: ${conteos.vinculos} · asistentes registrados: ${conteos.asistentes}`)
  console.log(`    carga por gestor: ${cargaOperador.map((f) => `${f.gestor} ${f.n} (${fmt(f.mediana)})`).join(', ')}`)
  console.log(`    colonias que más concentran: ${topColonias.map((f) => `${f.colonia} ${f.n}`).join(', ')}`)
}

console.log('\n  Datos de demostración listos.\n')
await sql.end()
