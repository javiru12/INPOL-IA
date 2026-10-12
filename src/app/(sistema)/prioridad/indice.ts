/**
 * Índice de prioridad territorial.
 *
 * Responde la pregunta que se hace un coordinador cada mañana: **¿a dónde
 * mando a mi gente hoy?** Ni los resultados electorales por su cuenta ni las
 * peticiones por la suya la contestan; el índice las junta.
 *
 * Cinco factores, cada uno de 0 a 100, con pesos fijos. El desglose se
 * muestra siempre en pantalla: un número que nadie puede auditar no sirve
 * para defender una decisión ante quien paga la campaña.
 *
 * Los pesos son un punto de partida razonable, no una verdad. Están aquí,
 * en un solo lugar, para que se discutan con el cliente y se cambien.
 */

export const FACTORES = {
  competitividad: {
    peso: 30,
    etiqueta: 'Competitividad',
    ayuda: 'Qué tan cerrada quedó la elección. Un margen apretado es donde se decide.',
  },
  peso_electoral: {
    peso: 20,
    etiqueta: 'Votos en juego',
    ayuda: 'Tamaño del padrón frente al resto. Mover una sección grande rinde más.',
  },
  voto_dormido: {
    peso: 20,
    etiqueta: 'Voto dormido',
    ayuda: 'Participación baja frente al resto: gente que no salió y se puede activar.',
  },
  demanda: {
    peso: 20,
    etiqueta: 'Demanda sin atender',
    ayuda: 'Peticiones abiertas. Es deuda con la gente, y la palanca de la gestión.',
  },
  vacio: {
    peso: 10,
    etiqueta: 'Vacío de estructura',
    ayuda: 'Territorio sin un solo movilizador: nadie lo está trabajando.',
  },
} as const

export type Factor = keyof typeof FACTORES

export type SeccionCruda = {
  id: string
  clave: string
  municipio: string
  distrito: string | null
  cabecera: string | null
  lista_nominal: number | null
  participacion: number | null
  margen: number | null
  peticiones: number
  sin_resolver: number
  movilizadores: number
}

export type SeccionPriorizada = SeccionCruda & {
  indice: number
  factores: Record<Factor, number>
}

/** Un factor que vale casi lo mismo en todas partes no ordena nada. */
export type Diagnostico = { factor: Factor; iguales: number; total: number }

/**
 * Posición relativa dentro del conjunto, de 0 a 100.
 *
 * Se usa percentil y no una regla de tres contra el máximo porque las dos
 * distribuciones son muy sesgadas: el padrón por sección va de 121 a 15,910
 * electores, así que contra el máximo la sección mediana sacaría 8 de 100 y
 * el factor quedaría mudo. El percentil también absorbe los valores
 * imposibles —hay secciones con participación de 319%, que son casillas
 * especiales donde vota gente en tránsito— sin que arrastren la escala.
 */
function percentil(valores: number[]) {
  const ordenados = [...valores].sort((a, b) => a - b)
  const ultimo = Math.max(1, ordenados.length - 1)

  return (v: number) => {
    let bajo = 0
    let alto = ordenados.length
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1
      if (ordenados[medio] < v) bajo = medio + 1
      else alto = medio
    }
    return (bajo / ultimo) * 100
  }
}

/**
 * Un margen de 0 puntos vale 100; uno de 40 o más vale 0. Arriba de 40
 * puntos la elección no estuvo en disputa y da igual cuánto más amplia
 * fuera: no hay nada que recuperar ahí. Este sí va en escala absoluta,
 * porque los puntos de margen significan lo mismo en cualquier sección.
 */
const MARGEN_SIN_DISPUTA = 40

export function calcularPrioridad(filas: SeccionCruda[]): SeccionPriorizada[] {
  const pctPadron = percentil(filas.map((f) => f.lista_nominal ?? 0))
  const pctPendientes = percentil(filas.map((f) => f.sin_resolver))

  // Participación por encima de 100% es una casilla especial, no una sección
  // que votó de más: se acota antes de medir el voto dormido.
  const dormido = (f: SeccionCruda) =>
    f.participacion === null ? null : Math.max(0, 100 - Math.min(f.participacion, 100))
  const pctDormido = percentil(
    filas.map((f) => dormido(f)).filter((v): v is number => v !== null),
  )

  return filas.map((f) => {
    const competitividad =
      f.margen === null
        ? 0
        : Math.max(0, 100 - (Math.min(f.margen, MARGEN_SIN_DISPUTA) / MARGEN_SIN_DISPUTA) * 100)

    const d = dormido(f)

    const factores = {
      competitividad,
      peso_electoral: pctPadron(f.lista_nominal ?? 0),
      // Sin dato de participación no se premia ni se castiga.
      voto_dormido: d === null ? 0 : pctDormido(d),
      // Una sección sin pendientes no entra en el reparto por percentil.
      demanda: f.sin_resolver === 0 ? 0 : pctPendientes(f.sin_resolver),
      vacio: f.movilizadores === 0 ? 100 : 0,
    }

    const indice =
      (Object.keys(FACTORES) as Factor[]).reduce(
        (suma, k) => suma + factores[k] * FACTORES[k].peso,
        0,
      ) / 100

    return { ...f, indice: Math.round(indice * 10) / 10, factores }
  })
}

/**
 * Qué factores no están separando nada. Con los datos de demostración casi
 * ninguna sección tiene movilizador, así que «vacío de estructura» le da 100
 * a todo el mundo y deja de ordenar. Vale más decirlo en pantalla que dejar
 * que alguien tome una decisión con un número que no distingue.
 */
export function factoresQueNoDiscriminan(
  secciones: SeccionPriorizada[],
  umbral = 0.9,
): Diagnostico[] {
  const total = secciones.length
  if (total === 0) return []

  return (Object.keys(FACTORES) as Factor[]).flatMap((factor) => {
    const cuenta = new Map<number, number>()
    for (const s of secciones) {
      const v = Math.round(s.factores[factor])
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
    }
    const iguales = Math.max(...cuenta.values())
    return iguales / total >= umbral ? [{ factor, iguales, total }] : []
  })
}

/** Por qué esta sección está arriba: los dos factores que más aportan. */
export function razonesDe(s: SeccionPriorizada): string[] {
  const aportes = (Object.keys(FACTORES) as Factor[])
    .map((k) => ({ k, aporte: (s.factores[k] * FACTORES[k].peso) / 100 }))
    .sort((a, b) => b.aporte - a.aporte)
    .filter((a) => a.aporte > 0)
    .slice(0, 2)

  return aportes.map(({ k }) => {
    if (k === 'competitividad' && s.margen !== null) {
      return `se decidió por ${s.margen.toFixed(1)} puntos`
    }
    if (k === 'peso_electoral') {
      return `${(s.lista_nominal ?? 0).toLocaleString('es-MX')} electores`
    }
    if (k === 'voto_dormido' && s.participacion !== null) {
      return `participación de ${Math.min(s.participacion, 100).toFixed(0)}%`
    }
    if (k === 'demanda') {
      return `${s.sin_resolver} petición(es) sin resolver`
    }
    return 'sin movilizador asignado'
  })
}
