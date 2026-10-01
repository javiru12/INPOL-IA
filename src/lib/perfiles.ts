/**
 * Nombre para enseñar de cada perfil. La clave es la que manda en la
 * base y en la matriz de permisos; esto es solo cómo se lee en pantalla.
 */
export const PERFILES: Record<string, string> = {
  super_admin: 'Súper Administrador',
  admin: 'Administrador',
  operador_campo: 'Operador de Campo',
  asignador: 'Asignador',
  operador_gestion: 'Operador de Gestión',
  gestor_social: 'Gestor Social',
  rp_movilizadores: 'R.P. de Movilizadores',
  lider_promotores: 'Líder de Promotores',
  promotor_votos: 'Promotor de Votos',
  marketing: 'Marketing',
  representante_casilla: 'Representante de Casilla',
}

export function nombrePerfil(clave: string | null | undefined) {
  if (!clave) return '—'
  return PERFILES[clave] ?? clave
}
