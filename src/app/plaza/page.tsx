import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { tenantsDisponibles, recordarTenant } from '@/lib/sesion'
import { Marca } from '@/components/marca'

export const metadata: Metadata = { title: 'Elegir plaza' }

export default async function Plaza() {
  const clientes = await tenantsDisponibles()

  async function elegir(datos: FormData) {
    'use server'
    const clave = String(datos.get('clave') ?? '')
    if (clave) await recordarTenant(clave)
    redirect('/entrar')
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <Marca />
        <h1 className="mt-9 text-[var(--text-titulo)]">Elige la plaza</h1>
        <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Cada plaza tiene su propio acceso e información. En producción se entra
          directamente por el subdominio de cada una.
        </p>

        <ul className="mt-6 space-y-2">
          {clientes.map((c) => (
            <li key={c.clave}>
              <form action={elegir}>
                <input type="hidden" name="clave" value={c.clave} />
                <button
                  type="submit"
                  className="panel group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-[var(--color-acento-borde)] hover:bg-[var(--color-acento-suave)]"
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-1 shrink-0 rounded-full"
                    style={{ background: c.color_acento ?? 'var(--color-acento)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nombre}</span>
                    <span className="clave block">{c.clave}.inpol.mx</span>
                  </span>
                  <span className="text-[var(--color-tinta-3)] transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>

        {clientes.length === 0 && (
          <p className="panel mt-6 px-4 py-6 text-center text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            No hay clientes dados de alta todavía.
          </p>
        )}
      </div>
    </main>
  )
}
