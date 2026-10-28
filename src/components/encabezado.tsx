import Link from 'next/link'
import { BuscadorGlobal } from './buscador-global'
import { Campana } from './campana'
import { MenuPerfil } from './menu-perfil'
import { alertasDelUsuario } from '@/lib/alertas'
import { PERFILES } from '@/lib/perfiles'

export async function Encabezado({
  nombre,
  perfil,
  campania,
}: {
  nombre: string
  perfil: string
  campania: string | null
}) {
  const alertas = await alertasDelUsuario()

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-[var(--color-borde)] bg-[var(--color-superficie)] px-4">
      <div className="flex-1">
        <BuscadorGlobal />
      </div>

      <Link
        href="/sala"
        className="boton boton-neutro !h-8 hidden text-[var(--text-menuda)] md:inline-flex"
        title="Tablero de pantalla completa para proyectar"
      >
        Sala de mando
      </Link>

      <Campana alertas={alertas} />

      <MenuPerfil nombre={nombre} rol={PERFILES[perfil] ?? perfil} campania={campania} />
    </header>
  )
}
