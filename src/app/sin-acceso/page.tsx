import Link from 'next/link'
import type { Metadata } from 'next'
import { leerSesion } from '@/lib/sesion'
import { Marca } from '@/components/marca'

export const metadata: Metadata = { title: 'Sin acceso' }

const PERFILES: Record<string, string> = {
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

export default async function SinAcceso({
  searchParams,
}: {
  searchParams: Promise<{ ruta?: string }>
}) {
  const { ruta } = await searchParams
  const sesion = await leerSesion()
  const perfil = sesion ? (PERFILES[sesion.perfil] ?? sesion.perfil) : null

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Marca />
        </div>

        <h1 className="mt-9 text-[var(--text-titulo)]">Esta sección no es para tu perfil</h1>

        <p className="mt-2 text-[var(--text-menuda)] leading-relaxed text-[var(--color-tinta-2)]">
          {perfil ? (
            <>
              Entraste como <span className="font-medium text-[var(--color-tinta)]">{perfil}</span>,
              y ese perfil no tiene acceso a{' '}
              {ruta ? <span className="clave">{ruta}</span> : 'esta sección'}. Si necesitas
              entrar, pídele a tu administrador que te cambie el perfil.
            </>
          ) : (
            <>Tu sesión expiró. Vuelve a entrar para continuar.</>
          )}
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Link href="/" className="boton boton-primario">
            Ir al panel de inicio
          </Link>
          {!sesion && (
            <Link href="/entrar" className="boton boton-neutro">
              Entrar
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
