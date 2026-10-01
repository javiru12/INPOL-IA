/**
 * Vocabulario del módulo de Comunicación.
 *
 * Vive aparte de `consultas.ts` a propósito: ese archivo es `server-only`
 * porque toca la base, y el formulario de campaña —que corre en el
 * navegador— necesita los mismos canales, marcadores y tipos. Partirlo
 * evita arrastrar la conexión a la base hasta el cliente.
 */

export type Canal = 'correo' | 'sms' | 'whatsapp'

export const CANALES: { valor: Canal; etiqueta: string }[] = [
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'sms', etiqueta: 'SMS' },
  { valor: 'correo', etiqueta: 'Correo electrónico' },
]

/**
 * Por dónde se registró un aviso individual. Incluye la llamada y el
 * trato en persona porque así es como hoy se avisa de verdad: el sistema
 * no manda nada, deja constancia de lo que alguien hizo.
 */
export const VIAS_AVISO = [
  { valor: 'llamada', etiqueta: 'Llamada' },
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'sms', etiqueta: 'SMS' },
  { valor: 'correo', etiqueta: 'Correo' },
  { valor: 'presencial', etiqueta: 'En persona' },
]

export const MARCADORES = ['{nombre}', '{folio}', '{problematica}'] as const

export type Segmento = {
  colonia?: string
  municipio?: string
  seccion?: string
  problematica?: string
  estatus?: string
  sexo?: string
  edadMin?: number
  edadMax?: number
}

export type Destinatario = {
  nombre: string | null
  folio: string | null
  problematica: string | null
  destino: string | null
}

export type Alcance = {
  personas: number
  alcanzables: number
  muestra: Destinatario | null
}

/** Lee el segmento guardado en jsonb sin confiar en su forma. */
export function describirSegmento(s: Segmento | null | undefined): string[] {
  if (!s) return []
  const partes: string[] = []
  if (s.colonia) partes.push(`Colonia ${s.colonia}`)
  if (s.municipio) partes.push(`Municipio ${s.municipio}`)
  if (s.seccion) partes.push(`Sección ${s.seccion}`)
  if (s.problematica) partes.push(s.problematica)
  if (s.estatus) partes.push(`Petición ${s.estatus.toLowerCase()}`)
  if (s.sexo) partes.push(s.sexo === 'F' ? 'Mujeres' : 'Hombres')
  if (s.edadMin || s.edadMax) {
    partes.push(
      s.edadMin && s.edadMax
        ? `${s.edadMin} a ${s.edadMax} años`
        : s.edadMin
          ? `${s.edadMin} años o más`
          : `hasta ${s.edadMax} años`,
    )
  }
  return partes
}
