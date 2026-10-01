import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { leerSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { Formulario } from './formulario'
import { Marca } from '@/components/marca'

export const metadata: Metadata = { title: 'Entrar' }

export default async function Entrar() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')
  if (await leerSesion()) redirect('/')

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de identidad. En el sistema anterior este espacio decía
          a qué campaña entrabas; se conserva la idea, mejor resuelta. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-barra)] p-12 text-white lg:flex">
        <Reticula />
        <Marca className="relative" tono="claro" />
        <div className="relative">
          <p className="rotulo !text-white/45">Plataforma de gestión social</p>
          <h1 className="mt-3 max-w-md text-4xl font-semibold leading-[1.1] tracking-tight">
            {tenant.nombre}
          </h1>
          <p className="mt-5 max-w-sm text-[var(--text-base)] leading-relaxed text-white/55">
            Peticiones ciudadanas, estructura de campaña y seguimiento territorial
            en un solo lugar.
          </p>
        </div>
        <p className="relative text-[var(--text-menuda)] text-white/35">
          Acceso restringido. Toda consulta queda registrada en bitácora.
        </p>
      </section>

      <section className="flex items-center justify-center bg-[var(--color-superficie)] px-6 py-16">
        <div className="w-full max-w-[21rem]">
          <div className="lg:hidden">
            <Marca />
          </div>
          <p className="rotulo mt-10 lg:mt-0">{tenant.nombre_corto ?? tenant.nombre}</p>
          <h2 className="mt-1.5 text-[var(--text-titulo)]">Entrar al sistema</h2>
          <Formulario />
        </div>
      </section>
    </main>
  )
}

/** Trama de secciones electorales: textura discreta, sin degradados. */
function Reticula() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.055]" aria-hidden="true">
      <defs>
        <pattern id="retic" width="52" height="52" patternUnits="userSpaceOnUse">
          <path d="M52 0H0v52" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="0" cy="0" r="1.6" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#retic)" />
    </svg>
  )
}
