import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { VERSION_AVISO } from '@/lib/aviso-privacidad'
import { Marca } from '@/components/marca'

export const metadata: Metadata = { title: 'Aviso de privacidad' }

/**
 * Texto base, pensado para que el área jurídica del cliente lo revise y
 * ajuste antes de salir a producción. Se deja escrito —y no en blanco—
 * porque sin aviso no se pueden recabar datos personales, y porque es
 * más fácil corregir un borrador que redactar desde cero.
 */
export default async function AvisoDePrivacidad() {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')

  return (
    <div className="min-h-screen bg-[var(--color-lienzo)]">
      <header className="border-b border-[var(--color-borde)] bg-[var(--color-superficie)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3.5">
          <Marca compacto />
          <Link href="/reportar" className="boton boton-neutro !h-8 text-[var(--text-menuda)]">
            Volver al reporte
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="rotulo">Versión {VERSION_AVISO}</p>
        <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight">
          Aviso de privacidad
        </h1>
        <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {tenant.nombre}
        </p>

        <div className="panel mt-7 space-y-6 px-6 py-6 leading-relaxed">
          <Apartado titulo="Quién es responsable de tus datos">
            {tenant.nombre} es responsable del uso y protección de los datos personales que
            nos compartes al levantar un reporte ciudadano.
          </Apartado>

          <Apartado titulo="Qué datos recabamos">
            Tu nombre, teléfono celular, colonia y, si lo escribes, la calle o referencia del
            lugar que reportas. También guardamos lo que nos cuentas en la descripción del
            reporte.
          </Apartado>

          <Apartado titulo="Para qué los usamos">
            Únicamente para atender tu reporte, turnarlo a la dependencia que corresponda,
            darte seguimiento y avisarte cuando haya una resolución. También usamos la
            información de forma agregada y sin identificarte para saber qué problemas se
            concentran en cada zona.
          </Apartado>

          <Apartado titulo="Con quién los compartimos">
            Con la dependencia encargada de resolver lo que reportaste. No vendemos ni
            cedemos tus datos a terceros con fines comerciales.
          </Apartado>

          <Apartado titulo="Cuánto tiempo los conservamos">
            Mientras tu reporte esté en trámite y durante el plazo que marque la normativa
            aplicable en materia de archivo.
          </Apartado>

          <Apartado titulo="Tus derechos">
            Puedes pedir acceso a tus datos, que los corrijamos, que los eliminemos o que
            dejemos de usarlos. Para hacerlo, acude al módulo de atención ciudadana o escribe
            a la unidad de transparencia de {tenant.nombre}.
          </Apartado>

          <Apartado titulo="Cambios a este aviso">
            Si cambiamos este aviso, publicaremos la versión nueva en esta misma página.
          </Apartado>
        </div>

        <p className="mt-5 rounded-[var(--radius-sm)] border border-[var(--color-aviso)] bg-[var(--color-aviso-suave)] px-4 py-3 text-[var(--text-menuda)] text-[var(--color-aviso)]">
          <strong>Nota para el equipo:</strong> este texto es un borrador de trabajo. Antes de
          salir a producción tiene que revisarlo el área jurídica del cliente y nombrar la
          unidad de transparencia y el domicilio que correspondan.
        </p>
      </main>
    </div>
  )
}

function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[var(--text-base)] font-semibold">{titulo}</h2>
      <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">{children}</p>
    </section>
  )
}
