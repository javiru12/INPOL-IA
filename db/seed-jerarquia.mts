/**
 * Arma una jerarquía de demostración a partir de los perfiles.
 *
 * Sin esto, Estructura solo puede deducir quién atiende qué a partir de
 * las peticiones, y el organigrama sale vacío con la leyenda «todavía no
 * hay jerarquía formal capturada». En un cliente real esto lo captura el
 * administrador; aquí se arma para que la pantalla tenga qué enseñar.
 *
 * El orden sale de la matriz de autorización: el Súper Administrador es
 * la cabeza, de él cuelgan Administrador y Marketing, del Administrador
 * los gestores y asignadores, y de cada gestor su gente de campo.
 *
 *   npm run db:jerarquia
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 })

/** De qué perfil cuelga cada perfil. La cabeza no aparece. */
const DEPENDE_DE: Record<string, string> = {
  admin: 'super_admin',
  marketing: 'super_admin',
  gestor_social: 'admin',
  asignador: 'admin',
  rp_movilizadores: 'admin',
  operador_gestion: 'gestor_social',
  operador_campo: 'gestor_social',
  lider_promotores: 'rp_movilizadores',
  promotor_votos: 'lider_promotores',
  representante_casilla: 'rp_movilizadores',
}

const tenants = await sql<{ id: string; clave: string; nombre_corto: string | null }[]>`
  select id, clave, nombre_corto from tenants where activo order by clave`

for (const t of tenants) {
  const usuarios = await sql<{ id: string; perfil_clave: string; correo: string }[]>`
    select id, perfil_clave, correo from usuarios
    where tenant_id = ${t.id} and activo
    order by correo`

  // El primero de cada perfil hace de jefe de quienes cuelgan de él.
  const jefeDePerfil = new Map<string, string>()
  for (const u of usuarios) {
    if (!jefeDePerfil.has(u.perfil_clave)) jefeDePerfil.set(u.perfil_clave, u.id)
  }

  let asignados = 0
  for (const u of usuarios) {
    const perfilJefe = DEPENDE_DE[u.perfil_clave]
    if (!perfilJefe) continue

    const jefe = jefeDePerfil.get(perfilJefe)
    // Si ese perfil no tiene a nadie, se sube un escalón hasta encontrar
    // uno que sí: una cadena rota dejaría a la persona sin responsable.
    let destino = jefe
    let buscando = perfilJefe
    while (!destino && DEPENDE_DE[buscando]) {
      buscando = DEPENDE_DE[buscando]
      destino = jefeDePerfil.get(buscando)
    }
    if (!destino || destino === u.id) continue

    await sql`update usuarios set usuario_responsable_id = ${destino} where id = ${u.id}`
    asignados++
  }

  const [cabeza] = await sql<{ n: number }[]>`
    select count(*)::int as n from usuarios
    where tenant_id = ${t.id} and activo and usuario_responsable_id is null`

  console.log(`  ${(t.nombre_corto ?? t.clave).padEnd(12)} ${asignados} con responsable · ${cabeza.n} sin jefe (la cabeza)`)
}

console.log('\n  Jerarquía lista.\n')
await sql.end()
