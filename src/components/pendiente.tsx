import { Pagina } from './pagina'

/**
 * Módulo contemplado pero todavía no construido. Se prefiere decirlo así,
 * con lo que va a incluir, antes que dejar la ruta en 404: el menú refleja
 * el alcance acordado y conviene que se vea completo.
 */
export function Pendiente({
  titulo,
  descripcion,
  fase,
  incluye,
}: {
  titulo: string
  descripcion: string
  fase: string
  incluye: string[]
}) {
  return (
    <Pagina titulo={titulo} descripcion={descripcion}>
      <div className="panel max-w-2xl px-6 py-7">
        <p className="rotulo">{fase}</p>
        <h2 className="mt-2 text-[var(--text-media)]">Módulo en construcción</h2>
        <p className="mt-2 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Esta sección está contemplada en el alcance y se entrega en la fase indicada.
          Incluirá:
        </p>
        <ul className="mt-4 space-y-2">
          {incluye.map((punto) => (
            <li key={punto} className="flex gap-2.5 text-[var(--text-menuda)]">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-acento)]"
              />
              {punto}
            </li>
          ))}
        </ul>
      </div>
    </Pagina>
  )
}
