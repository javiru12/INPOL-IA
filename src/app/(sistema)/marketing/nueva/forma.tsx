'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { crearCampania, medirSegmento, type EstadoAccion } from '../acciones'
import { CANALES, MARCADORES, type Alcance, type Canal } from '../catalogo'
import { cifra } from '@/lib/formato'

type Opcion = { valor: string; conteo: number }

const PLANTILLA =
  'Hola {nombre}: le escribimos del gobierno municipal para darle seguimiento a su ' +
  'petición {folio} sobre {problematica}. Si necesita algo más, responda a este ' +
  'mensaje y lo atendemos.'

/** Sustituye los marcadores con los datos de un destinatario real. */
function resolver(texto: string, d: Alcance['muestra']) {
  return texto
    .replaceAll('{nombre}', d?.nombre ?? '{nombre}')
    .replaceAll('{folio}', d?.folio ?? '{folio}')
    .replaceAll('{problematica}', d?.problematica ?? '{problematica}')
}

export function FormaCampania({
  colonias,
  municipios,
  secciones,
  problematicas,
  estatus,
}: {
  colonias: Opcion[]
  municipios: Opcion[]
  secciones: Opcion[]
  problematicas: Opcion[]
  estatus: Opcion[]
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(crearCampania, {})
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [segmento, setSegmento] = useState<Record<string, string>>({})
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState(PLANTILLA)
  const [alcance, setAlcance] = useState<Alcance | null>(null)
  const [midiendo, medir] = useTransition()
  const area = useRef<HTMLTextAreaElement>(null)

  // El contador se recalcula al vuelo. Un respiro de 250 ms evita
  // disparar una consulta por cada tecla del rango de edad.
  useEffect(() => {
    const t = setTimeout(() => {
      medir(async () => setAlcance(await medirSegmento({ canal, segmento })))
    }, 250)
    return () => clearTimeout(t)
  }, [canal, segmento])

  function fijar(nombre: string, valor: string) {
    setSegmento((previo) => ({ ...previo, [nombre]: valor }))
  }

  function insertar(marcador: string) {
    const el = area.current
    if (!el) return setCuerpo((c) => c + marcador)
    const i = el.selectionStart ?? cuerpo.length
    const j = el.selectionEnd ?? i
    setCuerpo(cuerpo.slice(0, i) + marcador + cuerpo.slice(j))
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(i + marcador.length, i + marcador.length)
    })
  }

  const criterios = Object.values(segmento).filter(Boolean).length
  const sinNadie = alcance !== null && alcance.alcanzables === 0

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-[1fr_1.15fr] lg:items-start">
      {/* ---------- A quién ---------- */}
      <section className="panel px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">A quién</h2>
        <p className="mb-4 mt-0.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
          Sin ningún criterio, la campaña alcanza a todo el padrón del cliente.
        </p>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selector
              nombre="municipio"
              etiqueta="Municipio"
              vacio="Todos"
              opciones={municipios}
              valor={segmento.municipio ?? ''}
              onChange={fijar}
            />
            <Selector
              nombre="colonia"
              etiqueta="Colonia"
              opciones={colonias}
              valor={segmento.colonia ?? ''}
              onChange={fijar}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                Sección electoral
              </span>
              <input
                name="seccion"
                list="secciones-disponibles"
                placeholder="Todas"
                value={segmento.seccion ?? ''}
                onChange={(e) => fijar('seccion', e.target.value)}
                className="campo"
              />
              <datalist id="secciones-disponibles">
                {secciones.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.conteo} personas
                  </option>
                ))}
              </datalist>
            </label>
            <Selector
              nombre="sexo"
              etiqueta="Sexo"
              opciones={[
                { valor: 'F', conteo: 0 },
                { valor: 'M', conteo: 0 },
              ]}
              etiquetas={{ F: 'Mujeres', M: 'Hombres' }}
              vacio="Todos"
              valor={segmento.sexo ?? ''}
              onChange={fijar}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Selector
              nombre="problematica"
              etiqueta="Problemática de su petición"
              opciones={problematicas}
              valor={segmento.problematica ?? ''}
              onChange={fijar}
            />
            <Selector
              nombre="estatus"
              etiqueta="Estatus de su petición"
              vacio="Todos"
              opciones={estatus}
              valor={segmento.estatus ?? ''}
              onChange={fijar}
            />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Rango de edad
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="edadMin"
                min={0}
                max={120}
                placeholder="Desde"
                value={segmento.edadMin ?? ''}
                onChange={(e) => fijar('edadMin', e.target.value)}
                className="campo"
              />
              <span className="text-[var(--color-tinta-3)]">—</span>
              <input
                type="number"
                name="edadMax"
                min={0}
                max={120}
                placeholder="Hasta"
                value={segmento.edadMax ?? ''}
                onChange={(e) => fijar('edadMax', e.target.value)}
                className="campo"
              />
            </div>
          </fieldset>
        </div>

        {/* ---------- Alcance en vivo ---------- */}
        <div
          className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-acento-suave)] px-4 py-3.5"
          style={{ opacity: midiendo ? 0.55 : 1, transition: 'opacity 120ms' }}
          aria-live="polite"
        >
          <p className="rotulo">Alcance del segmento</p>
          <p
            data-prueba="alcance"
            className="cifra mt-1 text-[length:var(--text-cifra)] font-semibold leading-none text-[var(--color-acento-fuerte)]"
          >
            {alcance === null ? '—' : cifra(alcance.alcanzables)}
          </p>
          <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
            {alcance === null ? (
              'Calculando…'
            ) : (
              <>
                {cifra(alcance.personas)} personas cumplen{' '}
                {criterios === 0
                  ? 'sin filtros'
                  : criterios === 1
                    ? 'el criterio elegido'
                    : `los ${criterios} criterios`}
                ; {cifra(alcance.alcanzables)} tienen{' '}
                {canal === 'correo' ? 'correo' : 'teléfono móvil'} registrado.
              </>
            )}
          </p>
          {sinNadie && (
            <p className="mt-2 text-[var(--text-menuda)] font-medium text-[var(--color-alerta)]">
              Por este canal no se le puede escribir a nadie del segmento.
            </p>
          )}
        </div>
      </section>

      {/* ---------- Qué dice ---------- */}
      <section className="panel px-4 py-4">
        <h2 className="mb-4 text-[var(--text-base)] font-semibold">Qué dice</h2>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <label className="block">
              <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                Nombre de la campaña <span className="text-[var(--color-alerta)]">*</span>
              </span>
              <input
                name="nombre"
                required
                placeholder="Brigada de servicios · Cumbres"
                className="campo"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                Canal <span className="text-[var(--color-alerta)]">*</span>
              </span>
              <select
                name="canal"
                value={canal}
                onChange={(e) => setCanal(e.target.value as Canal)}
                className="campo"
              >
                {CANALES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
              Asunto{canal !== 'correo' ? ' · solo aplica al correo' : ''}
            </span>
            <input
              name="asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Seguimiento a su petición"
              className="campo"
              disabled={canal !== 'correo'}
            />
          </label>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
                Mensaje <span className="text-[var(--color-alerta)]">*</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
                  Insertar:
                </span>
                {MARCADORES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => insertar(m)}
                    className="boton boton-llano clave !h-6 !px-1.5"
                  >
                    {m}
                  </button>
                ))}
              </span>
            </div>
            <textarea
              ref={area}
              name="cuerpo"
              rows={5}
              required
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              className="campo !h-auto resize-y py-2"
            />
            <p className="mt-1 text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Los marcadores se sustituyen por persona al preparar la campaña. A quien no
              tenga ese dato, el marcador le queda vacío.
            </p>
          </div>

          {/* ---------- Vista previa ---------- */}
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-borde)] bg-[var(--color-superficie-2)] px-3.5 py-3">
            <p className="rotulo">Vista previa</p>
            {alcance?.muestra ? (
              <>
                <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                  Como lo recibiría{' '}
                  <strong className="font-semibold text-[var(--color-tinta)]">
                    {alcance.muestra.nombre ?? 'esta persona'}
                  </strong>{' '}
                  <span className="clave">{alcance.muestra.destino ?? ''}</span>
                </p>
                {canal === 'correo' && asunto.trim() !== '' && (
                  <p className="mt-2 text-[var(--text-menuda)] font-medium">
                    Asunto: {resolver(asunto, alcance.muestra)}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap">
                  {resolver(cuerpo, alcance.muestra)}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
                Ajusta el segmento para ver cómo le llegaría a un destinatario real.
              </p>
            )}
          </div>
        </div>

        {estado.error && (
          <p
            role="alert"
            className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-alerta-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-alerta)]"
          >
            {estado.error}
          </p>
        )}

        <p className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-aviso-suave)] px-3 py-2 text-[var(--text-menuda)] text-[var(--color-aviso)]">
          Guardar <strong className="font-semibold">no envía nada</strong>: no hay
          proveedor de correo, SMS ni WhatsApp conectado. La campaña queda preparada, con
          su lista de destinatarios congelada y el mensaje ya personalizado.
        </p>

        <Guardar bloqueado={sinNadie} />
      </section>
    </form>
  )
}

function Selector({
  nombre,
  etiqueta,
  opciones,
  valor,
  onChange,
  etiquetas,
  vacio = 'Todas',
}: {
  nombre: string
  etiqueta: string
  opciones: Opcion[]
  valor: string
  onChange: (nombre: string, valor: string) => void
  etiquetas?: Record<string, string>
  vacio?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta}
      </span>
      <select
        name={nombre}
        value={valor}
        onChange={(e) => onChange(nombre, e.target.value)}
        className="campo"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {etiquetas?.[o.valor] ?? o.valor}
            {o.conteo ? ` (${o.conteo})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function Guardar({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || bloqueado}
      className="boton boton-primario mt-3 w-full"
    >
      {pending ? 'Preparando…' : 'Preparar campaña'}
    </button>
  )
}
