'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  cambiarEstadoCampania,
  cambiarEstadoCandidato,
  guardarCampania,
  guardarCandidato,
  type EstadoAccion,
} from '../acciones'
import { Area, Campo, Selector, Aviso, Enviar, EnviarChico } from '../piezas'
import { Distintivo } from '@/components/pagina'

export type DatosCampania = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: string | null
  fecha_inicia: string | null
  fecha_termina: string | null
  fecha_jornada: string | null
  responsable_id: string | null
  activo: boolean
}

export type DatosCandidato = {
  id: string
  nombre: string
  cargo: string | null
  partido: string | null
  activo: boolean
}

/**
 * Alta y edición de campaña.
 *
 * Las fechas viajan como texto `aaaa-mm-dd` de punta a punta: un
 * `<input type=date>` las entrega así y la columna `date` las acepta así.
 * En cuanto pasan por `new Date()` se corren un día.
 */
export function FormaCampania({
  campania,
  tipos,
  responsables,
  puedeEditar,
}: {
  campania: DatosCampania | null
  tipos: string[]
  responsables: { id: string; nombre: string }[]
  puedeEditar: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarCampania, {})

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      {campania && <input type="hidden" name="id" value={campania.id} />}

      <h2 className="text-[var(--text-base)] font-semibold">La campaña</h2>

      <Campo
        nombre="nombre"
        etiqueta="Nombre"
        valor={campania?.nombre}
        requerido
        marcador="Gestión Social Monterrey 2026"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
            Tipo
          </span>
          <input
            name="tipo"
            list="tipos-campania"
            defaultValue={campania?.tipo ?? ''}
            placeholder="gestión, alcaldía, diputación…"
            className="campo"
          />
          <datalist id="tipos-campania">
            {tipos.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <Selector
          nombre="responsableId"
          etiqueta="Responsable"
          valor={campania?.responsable_id}
          opciones={responsables.map((r) => ({ valor: r.id, texto: r.nombre }))}
          vacio="Sin responsable asignado"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo nombre="fechaInicia" etiqueta="Arranca" tipo="date" valor={campania?.fecha_inicia} />
        <Campo nombre="fechaTermina" etiqueta="Termina" tipo="date" valor={campania?.fecha_termina} />
        <Campo
          nombre="fechaJornada"
          etiqueta="Jornada"
          tipo="date"
          valor={campania?.fecha_jornada}
          ayuda="El Día D"
        />
      </div>

      <Area
        nombre="descripcion"
        etiqueta="Descripción"
        valor={campania?.descripcion}
        filas={2}
        marcador="Qué abarca, a qué territorio y con qué objetivo."
      />

      <Aviso estado={estado} exito="Campaña guardada" />

      {puedeEditar ? (
        <Enviar
          etiqueta={campania ? 'Guardar cambios' : 'Crear campaña'}
          accion={campania ? 'campania-guardar' : 'campania-crear'}
        />
      ) : (
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Tu perfil puede consultar las campañas, pero no modificarlas.
        </p>
      )}
    </form>
  )
}

/** Archivar una campaña no borra nada: deja de ofrecerse y se queda la historia. */
export function EstadoCampania({ campania }: { campania: DatosCampania }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarEstadoCampania, {})

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      <input type="hidden" name="id" value={campania.id} />
      <input type="hidden" name="activo" value={campania.activo ? 'false' : 'true'} />
      <h2 className="text-[var(--text-base)] font-semibold">Estado</h2>
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        {campania.activo
          ? 'En curso. Aparece en el encabezado y en los informes.'
          : 'Archivada. Sigue en el historial, pero ya no se ofrece.'}
      </p>
      <Aviso estado={estado} />
      <Enviar
        etiqueta={campania.activo ? 'Archivar campaña' : 'Reactivar campaña'}
        variante={campania.activo ? 'peligro' : 'neutro'}
        accion="campania-estado"
        ancho
      />
    </form>
  )
}

/** Los candidatos que cuelgan de la campaña. */
export function Candidatos({
  campaniaId,
  candidatos,
  puedeEditar,
}: {
  campaniaId: string
  candidatos: DatosCandidato[]
  puedeEditar: boolean
}) {
  const [edicion, setEdicion] = useState<DatosCandidato | null>(null)

  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b border-[var(--color-borde)] px-4 py-3 text-[var(--text-base)] font-semibold">
        Candidatos
      </h2>

      {candidatos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Partido</th>
                <th>Estado</th>
                {puedeEditar && <th aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {candidatos.map((k) => (
                <tr key={k.id} style={{ opacity: k.activo ? 1 : 0.55 }}>
                  <td className="font-medium">{k.nombre}</td>
                  <td className="text-[var(--color-tinta-2)]">{k.cargo ?? '—'}</td>
                  <td className="text-[var(--color-tinta-2)]">{k.partido ?? '—'}</td>
                  <td>
                    <Distintivo tono={k.activo ? 'exito' : 'neutro'}>
                      {k.activo ? 'Activo' : 'Retirado'}
                    </Distintivo>
                  </td>
                  {puedeEditar && (
                    <td className="w-40">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEdicion(k)}
                          className="boton boton-llano !h-7 text-[var(--text-menuda)]"
                        >
                          Editar
                        </button>
                        <EstadoCandidato campaniaId={campaniaId} candidato={k} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeEditar && (
        <FormaCandidato
          key={edicion?.id ?? 'nuevo'}
          campaniaId={campaniaId}
          candidato={edicion}
          onListo={() => setEdicion(null)}
        />
      )}
    </section>
  )
}

function FormaCandidato({
  campaniaId,
  candidato,
  onListo,
}: {
  campaniaId: string
  candidato: DatosCandidato | null
  onListo: () => void
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarCandidato, {})

  useEffect(() => {
    if (estado.ok && candidato) onListo()
  }, [estado, candidato, onListo])

  return (
    <form action={accion} className="space-y-3 border-t border-[var(--color-borde)] px-4 py-4">
      <input type="hidden" name="campaniaId" value={campaniaId} />
      {candidato && <input type="hidden" name="id" value={candidato.id} />}

      <p className="rotulo">{candidato ? `Editando ${candidato.nombre}` : 'Agregar candidato'}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo nombre="nombre" etiqueta="Nombre" valor={candidato?.nombre} requerido />
        <Campo nombre="cargo" etiqueta="Cargo" valor={candidato?.cargo} />
        <Campo nombre="partido" etiqueta="Partido" valor={candidato?.partido} />
      </div>

      <Aviso estado={estado} />

      <div className="flex items-center gap-2">
        <Enviar
          etiqueta={candidato ? 'Guardar candidato' : 'Agregar candidato'}
          accion={candidato ? 'candidato-guardar' : 'candidato-crear'}
        />
        {candidato && (
          <button type="button" onClick={onListo} className="boton boton-llano">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

function EstadoCandidato({
  campaniaId,
  candidato,
}: {
  campaniaId: string
  candidato: DatosCandidato
}) {
  const [, accion] = useActionState<EstadoAccion, FormData>(cambiarEstadoCandidato, {})

  return (
    <form action={accion} className="contents">
      <input type="hidden" name="campaniaId" value={campaniaId} />
      <input type="hidden" name="id" value={candidato.id} />
      <input type="hidden" name="activo" value={candidato.activo ? 'false' : 'true'} />
      <EnviarChico
        etiqueta={candidato.activo ? 'Retirar' : 'Reactivar'}
        variante={candidato.activo ? 'peligro' : 'neutro'}
        accion="candidato-estado"
      />
    </form>
  )
}
