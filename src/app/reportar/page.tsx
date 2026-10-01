import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { problematicasPublicas } from '@/lib/portal'
import { Marca } from '@/components/marca'
import { FormaReporte } from './forma'

export const metadata: Metadata = {
  title: 'Levanta tu reporte',
  description: 'Reporta un problema de tu colonia y dale seguimiento con tu folio.',
}

export default async function Reportar() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')

  const problematicas = await problematicasPublicas()

  return (
    <div className="min-h-screen bg-[var(--color-lienzo)]">
      <header className="border-b border-[var(--color-borde)] bg-[var(--color-superficie)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Marca compacto />
            <div className="border-l border-[var(--color-borde)] pl-3">
              <p className="rotulo">Atención ciudadana</p>
              <p className="text-[var(--text-menuda)] font-medium">{tenant.nombre}</p>
            </div>
          </div>
          <Link href="/seguimiento" className="boton boton-neutro !h-8 text-[var(--text-menuda)]">
            Ya tengo folio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
          Cuéntanos qué pasa en tu colonia
        </h1>
        <p className="mt-2 max-w-xl text-[var(--text-media)] leading-relaxed text-[var(--color-tinta-2)]">
          Al terminar te damos un folio para que puedas consultar en qué va tu reporte,
          cuando quieras.
        </p>

        <FormaReporte problematicas={problematicas} />
      </main>

      <footer className="mx-auto max-w-3xl px-6 pb-12">
        <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
          {tenant.nombre}. Los datos que nos compartes se usan únicamente para atender tu
          reporte y darle seguimiento.
        </p>
      </footer>
    </div>
  )
}
