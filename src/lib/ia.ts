
import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { consultar } from './ia-sql'
import { ESQUEMA } from './ia-esquema'
import { zonaDeEstado } from './zona'

/**
 * El asistente que responde preguntas sobre los datos del cliente.
 *
 * Trabaja escribiendo consultas y mirando lo que devuelven, no con un
 * juego de preguntas preparadas. La diferencia importa: un catálogo de
 * consultas fijas contesta bien lo que alguien previó y se queda mudo
 * ante «¿en qué colonias de Guadalupe se tarda más en cerrar una fuga
 * que en el resto del municipio?». Eso es justo lo que vale la pena
 * poder preguntar.
 *
 * Que pueda escribir SQL es seguro aquí por una razón de arquitectura,
 * no de confianza: el aislamiento entre clientes vive en la base —Row
 * Level Security con `force`, conectando con un rol que no es dueño— y
 * no en el código. Está comprobado: la misma consulta sin filtro
 * devuelve 762 fichas a Monterrey y 761 a Chihuahua, y pedir
 * explícitamente las del otro devuelve cero. El resto de los cercos
 * están en `ia-sql.ts`.
 */

export const MODELO = 'claude-opus-5-5'

export type Grafica = {
  tipo: 'barras' | 'lineas' | 'ranking'
  titulo: string
  pie?: string
  datos: { etiqueta: string; valor: number }[]
}

export type Paso =
  | { tipo: 'consulta'; sql: string; filas: number; error?: string }
  | { tipo: 'grafica'; grafica: Grafica }

export type Respuesta = {
  texto: string
  graficas: Grafica[]
  pasos: Paso[]
  error?: string
}

/** Lo que ya se dijo en esta conversación. */
export type Turno = { pregunta: string; respuesta: string }

const DatosGrafica = z.object({
  tipo: z
    .enum(['barras', 'lineas', 'ranking'])
    .describe(
      'barras para comparar categorías, lineas para una serie en el tiempo, ' +
        'ranking para un top con su magnitud relativa',
    ),
  titulo: z.string().describe('Qué se está midiendo, en una frase corta'),
  pie: z.string().optional().describe('Una aclaración si el dato la necesita'),
  datos: z
    .array(z.object({ etiqueta: z.string(), valor: z.number() }))
    .max(40)
    .describe('Como mucho 40 puntos: una gráfica con cien barras no se lee'),
})

export async function preguntar(
  pregunta: string,
  historial: Turno[],
  tenant: { id: string; nombre: string; estado_nombre: string | null; estado_clave: string | null },
  quien: { nombre: string; perfil: string },
): Promise<Respuesta> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      texto: '',
      graficas: [],
      pasos: [],
      error:
        'Falta la llave de Anthropic (ANTHROPIC_API_KEY) en el entorno. ' +
        'Sin ella el asistente no puede trabajar.',
    }
  }

  // Next parcha el `fetch` global para poder cachear. Una petición
  // larga a la API se quedaba colgada ahí: la traza llegaba a «esperando»
  // y no salía nunca. Decirle que no la cachee la deja pasar.
  const cliente = new Anthropic({ fetchOptions: { cache: 'no-store' } })
  const pasos: Paso[] = []
  const graficas: Grafica[] = []

  const herramientaConsultar = betaZodTool({
    name: 'consultar',
    description:
      'Ejecuta una consulta SQL de solo lectura sobre los datos de este cliente ' +
      'y devuelve las filas. Úsala tantas veces como haga falta: está bien mirar ' +
      'primero qué valores existen en una columna y después contar sobre ellos.',
    inputSchema: z.object({
      sql: z.string().describe('Una sola sentencia select o with'),
      porque: z
        .string()
        .describe('Qué estás averiguando con esta consulta, en pocas palabras'),
    }),
    run: async ({ sql }) => {
      const r = await consultar(tenant.id, sql)
      if (!r.ok) {
        pasos.push({ tipo: 'consulta', sql, filas: 0, error: r.error })
        // El error vuelve al modelo para que corrija y reintente; no se
        // le enseña a quien preguntó salvo que todo acabe fallando.
        return `Error: ${r.error}`
      }
      pasos.push({ tipo: 'consulta', sql, filas: r.filas.length })
      if (r.filas.length === 0) return 'Sin resultados. (0 filas)'
      return (
        JSON.stringify(r.filas) +
        (r.truncado ? '\n(Se recortó a las primeras 500 filas.)' : '')
      )
    },
  })

  const herramientaGraficar = betaZodTool({
    name: 'graficar',
    description:
      'Dibuja una gráfica con datos que ya consultaste. Úsala cuando la ' +
      'respuesta se entienda mejor viéndola: una comparación entre categorías, ' +
      'una evolución en el tiempo, un ranking. No la uses para un solo número.',
    inputSchema: DatosGrafica,
    run: async (g) => {
      graficas.push(g as Grafica)
      pasos.push({ tipo: 'grafica', grafica: g as Grafica })
      return 'Gráfica lista. Menciónala en tu respuesta sin repetir todos los números.'
    },
  })

  const sistema = `Eres el asistente de datos de INPOL, un sistema de gestión social y
análisis electoral que usan gobiernos y campañas en México.

Estás contestando a ${quien.nombre} (${quien.perfil}), de ${tenant.nombre}${
    tenant.estado_nombre ? `, que opera en ${tenant.estado_nombre}` : ''
  }. La zona horaria para agrupar por día o por mes es ${zonaDeEstado(tenant.estado_clave)}.

Trabajas consultando la base. Mira los datos antes de afirmar nada: si no
sabes qué valores tiene una columna, consúltalos primero. Si una consulta
falla, lee el error y corrígela.

${ESQUEMA}

Cómo contestar:

- En español, directo, sin preámbulo. Nada de «claro, con gusto».
- Da el número y lo que significa. «1,145 peticiones resueltas que el
  ciudadano todavía no sabe» dice más que «1,145 registros».
- Si un cero puede ser «no hay» o «la pregunta no aplica», averigua cuál
  de los dos es antes de responder.
- Si la pregunta es ambigua, elige la lectura más útil, respóndela y di
  qué entendiste. No devuelvas la pregunta.
- Es una conversación: «¿y de esas cuántas son de Cumbres?» se refiere a
  lo que acabas de responder. Vuelve a consultar con el recorte nuevo;
  no supongas que recuerdas las cifras exactas de antes.
- No inventes nunca una cifra que no viste en una consulta.
- Si los datos no alcanzan para responder, dilo y explica qué falta.`

  try {
    const corredor = cliente.beta.messages.toolRunner({
      model: MODELO,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: sistema,
      tools: [herramientaConsultar, herramientaGraficar],
      // Solo el texto de cada vuelta, no las consultas que hizo: lo que
      // el modelo necesita para entender «¿y de esas…?» es qué contestó,
      // no cómo lo averiguó, y arrastrar todo engorda la conversación
      // sin que sirva.
      messages: [
        ...historial.flatMap((t) => [
          { role: 'user' as const, content: t.pregunta },
          { role: 'assistant' as const, content: t.respuesta },
        ]),
        { role: 'user' as const, content: pregunta },
      ],
      // Un tope por si una pregunta lleva al modelo a dar vueltas: sin
      // él, una consulta que siempre falla se reintenta sin fin.
      max_iterations: 12,
    })

    // Hay que RECORRER el corredor: es perezoso y no avanza solo. Con
    // un `done()` a secas la petición se quedaba colgada para siempre,
    // sin error y sin llegar a hacer la primera consulta.
    for await (const paso of corredor) {
      // Una vuelta en pausa no continúa sola; se le devuelve para que
      // siga donde iba.
      if (paso.stop_reason === 'pause_turn') {
        corredor.pushMessages({ role: 'assistant', content: paso.content })
      }
    }
    const final = await corredor.done()
    const texto = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return { texto, graficas, pasos }
  } catch (e) {
    return {
      texto: '',
      graficas,
      pasos,
      error:
        e instanceof Anthropic.RateLimitError
          ? 'El servicio de IA está saturado. Intenta en un momento.'
          : e instanceof Anthropic.AuthenticationError
            ? 'La llave de Anthropic no es válida.'
            : e instanceof Error
              ? e.message.slice(0, 300)
              : 'No se pudo completar la consulta.',
    }
  }
}
