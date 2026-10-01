import Link from 'next/link'
import { IconoSalir } from './iconos'
import { BuscadorGlobal } from './buscador-global'
import { Campana } from './campana'
import { salir } from '@/app/acciones'
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

  const iniciales = nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-[var(--color-borde)] bg-[var(--color-superficie)] px-4">
      <div className="flex-1">
        <BuscadorGlobal />
      </div>

      {campania && (
        <div className="hidden items-center gap-2 border-l border-[var(--color-borde)] pl-4 lg:flex">
          <span className="rotulo">Campaña</span>
          <span className="text-[var(--text-menuda)] font-medium">{campania}</span>
        </div>
      )}

      <Link
        href="/informe"
        className="boton boton-llano !h-8 hidden text-[var(--text-menuda)] lg:inline-flex"
        title="Informe de gestión listo para imprimir"
      >
        Informe
      </Link>

      <Link
        href="/sala"
        className="boton boton-neutro !h-8 hidden text-[var(--text-menuda)] md:inline-flex"
        title="Tablero de pantalla completa para proyectar"
      >
        Sala de mando
      </Link>

      <Campana alertas={alertas} />

      <div className="flex items-center gap-2.5 border-l border-[var(--color-borde)] pl-4">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-acento-suave)] text-[var(--text-micro)] font-semibold text-[var(--color-acento-fuerte)]"
        >
          {iniciales}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-[var(--text-menuda)] font-medium">{nombre}</p>
          <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
            {PERFILES[perfil] ?? perfil}
          </p>
        </div>
        <form action={salir}>
          <button
            type="submit"
            className="boton boton-llano !h-8 !w-8 !p-0"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <IconoSalir />
          </button>
        </form>
      </div>
    </header>
  )
}
