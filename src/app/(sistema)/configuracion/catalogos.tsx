'use client'

import { useActionState, useEffect, useState } from 'react'
import { cambiarEstadoCatalogo, guardarCatalogo, type EstadoAccion } from './acciones'
import {
  CATALOGOS,
  columnaNombre,
  type CampoCatalogo,
  type ClaveCatalogo,
  type DefinicionCatalogo,
} from './catalogo'
import { Area, Campo, CampoColor, Aviso, Enviar, EnviarChico, Selector } from './piezas'
import { Distintivo, Vacio } from '@/components/pagina'
import { cifra } from '@/lib/formato'

export type FilaCatalogo = {
  id: string
  activo: boolean
  usos: number
  padre: string | null
} & Record<string, string | number | boolean | null>

/**
 * Un catálogo de la operación, con su alta y su edición.
 *
 * El formulario vive arriba de la tabla y no dentro de ella: HTML no
 * admite un `<form>` que envuelva renglones, y partirlo en celdas con el
 * atributo `form` deja un formulario que se rompe en cuanto cambia el
 * orden de la tabla. Arriba se ve además qué se está editando.
 */
export function PanelCatalogo({
  catalogo,
  filas,
  problematicas,
  puedeEditar,
}: {
  catalogo: ClaveCatalogo
  filas: FilaCatalogo[]
  problematicas: { id: string; titulo: string }[]
  puedeEditar: boolean
}) {
  const def = CATALOGOS[catalogo]
  const [edicion, setEdicion] = useState<FilaCatalogo | null>(null)
  // El resultado de activar o desactivar sube hasta aquí: «143 peticiones
  // la siguen usando» no cabe en una celda y ahí se perdería.
  const [ultimo, setUltimo] = useState<EstadoAccion>({})

  return (
    <div className="grid gap-3 lg:grid-cols-[22rem_1fr] lg:items-start">
      {puedeEditar ? (
        <Formulario
          /* Cambiar de registro tiene que reiniciar los valores por omisión. */
          key={edicion?.id ?? 'nuevo'}
          catalogo={catalogo}
          def={def}
          fila={edicion}
          problematicas={problematicas}
          onListo={() => setEdicion(null)}
          onCancelar={() => setEdicion(null)}
        />
      ) : (
        <section className="panel px-4 py-4">
          <h3 className="text-[var(--text-base)] font-semibold">{def.etiqueta}</h3>
          <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {def.proposito}
          </p>
          <p className="mt-3 text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
            Tu perfil puede consultar este catálogo, pero no modificarlo.
          </p>
        </section>
      )}

      <section className="panel overflow-hidden">
        {(ultimo.error || ultimo.mensaje) && (
          <div className="border-b border-[var(--color-borde)] p-3">
            <Aviso estado={ultimo} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                {def.campos.map((c) => (
                  <th key={c.nombre} className={c.ancho}>
                    {c.tipo === 'problematica' ? 'Pertenece a' : c.etiqueta}
                  </th>
                ))}
                <th className="num">Peticiones</th>
                <th>Estado</th>
                {puedeEditar && <th aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} style={{ opacity: f.activo ? 1 : 0.55 }}>
                  {def.campos.map((c) => (
                    <td key={c.nombre} className={c.ancho}>
                      <Celda campo={c} fila={f} />
                    </td>
                  ))}
                  <td className="num text-[var(--color-tinta-2)]">
                    {f.usos > 0 ? cifra(f.usos) : '—'}
                  </td>
                  <td>
                    <Distintivo tono={f.activo ? 'exito' : 'neutro'}>
                      {f.activo ? 'Activa' : 'Inactiva'}
                    </Distintivo>
                  </td>
                  {puedeEditar && (
                    <td className="w-44">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEdicion(f)}
                          className="boton boton-llano !h-7 text-[var(--text-menuda)]"
                        >
                          Editar
                        </button>
                        <CambiarEstado catalogo={catalogo} fila={f} onResultado={setUltimo} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filas.length === 0 && (
          <Vacio
            titulo={`Todavía no hay ${def.etiqueta.toLowerCase()}`}
            descripcion={def.proposito}
          />
        )}
      </section>
    </div>
  )
}

function Celda({ campo, fila }: { campo: CampoCatalogo; fila: FilaCatalogo }) {
  if (campo.tipo === 'problematica') {
    return <span className="text-[var(--color-tinta-2)]">{fila.padre ?? '—'}</span>
  }

  const valor = fila[campo.nombre]
  if (valor === null || valor === '') return <span className="text-[var(--color-tinta-3)]">—</span>

  if (campo.tipo === 'color') {
    return (
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-[2px] border border-[var(--color-borde)]"
          style={{ background: String(valor) }}
        />
        <span className="clave">{String(valor)}</span>
      </span>
    )
  }

  if (campo.requerido) return <span className="font-medium">{String(valor)}</span>
  if (campo.tipo === 'correo' || campo.nombre === 'clave') {
    return <span className="clave">{String(valor)}</span>
  }
  return <span className="text-[var(--color-tinta-2)]">{String(valor)}</span>
}

function Formulario({
  catalogo,
  def,
  fila,
  problematicas,
  onListo,
  onCancelar,
}: {
  catalogo: ClaveCatalogo
  def: DefinicionCatalogo
  fila: FilaCatalogo | null
  problematicas: { id: string; titulo: string }[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarCatalogo, {})

  useEffect(() => {
    if (estado.ok && fila) onListo()
  }, [estado, fila, onListo])

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      <input type="hidden" name="catalogo" value={catalogo} />
      {fila && <input type="hidden" name="id" value={fila.id} />}

      <div>
        <h3 className="text-[var(--text-base)] font-semibold">
          {fila ? `Editar «${fila[columnaNombre(def)]}»` : `Nueva ${def.singular}`}
        </h3>
        <p className="mt-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          {def.proposito}
        </p>
      </div>

      {def.campos.map((c) => {
        const valor = fila ? (fila[c.nombre] as string | null) : null
        if (c.tipo === 'problematica') {
          return (
            <Selector
              key={c.nombre}
              nombre={c.nombre}
              etiqueta="Pertenece a"
              requerido
              valor={valor}
              opciones={problematicas.map((p) => ({ valor: p.id, texto: p.titulo }))}
              vacio="Elige la problemática…"
            />
          )
        }
        if (c.tipo === 'color') {
          return <CampoColor key={c.nombre} nombre={c.nombre} etiqueta={c.etiqueta} valor={valor} />
        }
        if (c.nombre === 'descripcion' && !c.requerido) {
          return (
            <Area
              key={c.nombre}
              nombre={c.nombre}
              etiqueta={c.etiqueta}
              valor={valor}
              filas={2}
              marcador="Opcional: cuándo se usa, qué incluye…"
            />
          )
        }
        return (
          <Campo
            key={c.nombre}
            nombre={c.nombre}
            etiqueta={c.etiqueta}
            valor={valor}
            requerido={c.requerido}
            tipo={c.tipo === 'correo' ? 'email' : c.tipo === 'telefono' ? 'tel' : 'text'}
          />
        )
      })}

      <Aviso estado={estado} />

      <div className="flex items-center gap-2">
        <Enviar
          etiqueta={fila ? 'Guardar cambios' : `Agregar ${def.singular}`}
          accion={fila ? 'catalogo-guardar' : 'catalogo-agregar'}
        />
        {fila && (
          <button type="button" onClick={onCancelar} className="boton boton-llano">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Activar o desactivar. Nunca borrar: hay peticiones apuntando aquí y un
 * borrado real les quitaría la problemática o el estatus del expediente.
 */
function CambiarEstado({
  catalogo,
  fila,
  onResultado,
}: {
  catalogo: ClaveCatalogo
  fila: FilaCatalogo
  onResultado: (estado: EstadoAccion) => void
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarEstadoCatalogo, {})

  useEffect(() => {
    if (estado.error || estado.mensaje) onResultado(estado)
  }, [estado, onResultado])

  return (
    <form action={accion} className="contents">
      <input type="hidden" name="catalogo" value={catalogo} />
      <input type="hidden" name="id" value={fila.id} />
      <input type="hidden" name="activo" value={fila.activo ? 'false' : 'true'} />
      <EnviarChico
        etiqueta={fila.activo ? 'Desactivar' : 'Reactivar'}
        variante={fila.activo ? 'peligro' : 'neutro'}
        accion="catalogo-estado"
      />
    </form>
  )
}
