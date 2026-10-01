/** Comprobación del formateo de fechas. npx tsx src/lib/formato.prueba.mts */
import { fechaLarga, fechaCorta, fechaHora, mesCorto, cifra, porcentaje } from '../../src/lib/formato'

const casos: [string, string, string][] = [
  ['date sin hora no retrocede un día', fechaLarga('1971-12-30'), '30 de diciembre de 1971'],
  ['date corta', fechaCorta('2026-09-30'), '30/09/26'],
  ['mes en español', mesCorto('2026-08-01'), 'ago'],
  ['nulo', fechaLarga(null), '—'],
  ['cifra con separador', cifra(58065), '58,065'],
  ['porcentaje', porcentaje(45, 140), '32%'],
  ['porcentaje sin total', porcentaje(3, 0), '0%'],
]

let fallos = 0
for (const [que, real, esperado] of casos) {
  const ok = real === esperado
  if (!ok) fallos++
  console.log(`  ${ok ? '✓' : '✗'}  ${que}${ok ? '' : `  dio «${real}», se esperaba «${esperado}»`}`)
}
const conHora = fechaHora('2026-09-30T14:05:00-06:00')
console.log(`  ·  timestamptz con hora: ${conHora}`)
process.exit(fallos ? 1 : 0)
