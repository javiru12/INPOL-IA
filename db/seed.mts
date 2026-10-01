/**
 * Datos de demostración: dos clientes con información separada,
 * para poder comprobar el aislamiento y navegar el sistema.
 *   npm run db:seed
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })
const hash = await bcrypt.hash('inpol2026', 10)

const clientes = [
  { clave: 'monterrey', nombre: 'Zona Metropolitana de Monterrey', corto: 'Monterrey', acento: '#714a85' },
  { clave: 'chihuahua', nombre: 'Gobierno de Chihuahua', corto: 'Chihuahua', acento: '#2a6690' },
]

for (const c of clientes) {
  const [tenant] = await sql`
    insert into tenants (clave, nombre, nombre_corto, color_acento, licencia_inicia, licencia_vence)
    values (${c.clave}, ${c.nombre}, ${c.corto}, ${c.acento}, current_date, current_date + interval '1 year')
    on conflict (clave) do update set nombre = excluded.nombre, nombre_corto = excluded.nombre_corto
    returning id, clave`

  await sql`select set_config('app.tenant_id', ${tenant.id}, false)`

  const [campania] = await sql`
    insert into campanias (tenant_id, nombre, tipo, fecha_inicia, fecha_termina, fecha_jornada)
    values (${tenant.id}, ${'Gestión Social ' + c.corto + ' 2026'}, 'gestión',
            current_date, current_date + interval '8 months', current_date + interval '8 months')
    returning id`

  const personas = [
    ['super_admin', 'Gerardo', 'García', 'gerardo'],
    ['admin', 'Patricia', 'Aguirre', 'patricia'],
    ['gestor_social', 'Luis', 'Treviño', 'luis'],
    ['gestor_social', 'Rebeca', 'Cantú', 'rebeca'],
    ['gestor_social', 'Mónica', 'Villarreal', 'monica'],
    ['asignador', 'Marleny', 'Sosa', 'marleny'],
    ['asignador', 'Omar', 'Quezada', 'omar'],
    ['operador_gestion', 'Sebastián', 'Ramos', 'sebastian'],
    ['operador_gestion', 'Alondra', 'Peña', 'alondra'],
    ['operador_gestion', 'Hugo', 'Salinas', 'hugo'],
    ['operador_campo', 'Ivonne', 'Cárdenas', 'ivonne'],
    ['marketing', 'Diego', 'Lozano', 'diego'],
  ] as const

  for (const [perfil, nombre, apellido, usuario] of personas) {
    await sql`
      insert into usuarios (tenant_id, perfil_clave, nombre, apellido_paterno, correo, contrasena_hash, puesto)
      values (${tenant.id}, ${perfil}, ${nombre}, ${apellido},
              ${usuario + '@' + c.clave + '.inpol.mx'}, ${hash}, ${null})
      on conflict (tenant_id, correo) do nothing`
  }

  console.log(`  ${c.nombre.padEnd(26)} ${personas.length} usuarios · campaña ${campania.id.slice(0, 8)}`)
}

console.log('\n  Contraseña de todos los usuarios: inpol2026\n')
await sql.end()
