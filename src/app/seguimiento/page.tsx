import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { Marca } from '@/components/marca'
import { FormaSeguimiento } from './forma'

export const metadata: Metadata = {
  title: 'Consulta tu reporte',
  description: 'Consulta en qué va tu reporte con el folio que te dimos.',
}

export default async function Seguimiento({
  searchParams,
}: {
  searchParams: Promise<{ folio?: string }>
}) {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')
  const { folio } = await searchParams

  return (
    <div className="min-h-screen bg-[var(--color-lienzo)]">
      <header className="border-b border-[var(--color-borde)] bg-[var(--color-superficie)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Marca compacto />
            <div className="border-l border-[var(--color-borde)] pl-3">
              <p className="rotulo">Atención ciudadana</p>
              <p className="text-[var(--text-menuda)] font-medium">{tenant.nombre}</p>
            </div>
          </div>
          <Link href="/reportar" className="boton boton-neutro !h-8 text-[var(--text-menuda)]">
            Levantar reporte
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
          ¿En qué va tu reporte?
        </h1>
        <p className="mt-2 text-[var(--text-media)] text-[var(--color-tinta-2)]">
          Escribe el folio que te dimos y los últimos cuatro dígitos de tu teléfono.
        </p>

        <FormaSeguimiento folioInicial={folio ?? ''} />
      </main>
    </div>
  )
}
