'use client'

import { useId, useRef, useState } from 'react'

/**
 * Campos de fecha y hora que se ven igual en cualquier computadora.
 *
 * El `input[type=date]` del navegador presenta la fecha según la
 * configuración regional de **la máquina de quien mira**, no la del
 * sistema: el mismo formulario se ve 15/11/2026 en un equipo en español y
 * 11/15/2026 en uno en inglés, y quien captura no tiene forma de saber en
 * cuál de los dos está. En una fecha como 05/06 eso no es un detalle
 * estético: es un mes de diferencia sin aviso.
 *
 * Aquí el texto visible siempre es DD/MM/AAAA, escrito por nosotros, y el
 * calendario nativo queda detrás para quien prefiera elegir con el ratón.
 * Lo que viaja en el formulario sigue siendo el formato ISO que espera la
 * base.
 */

const aIso = (visible: string): string | null => {
  const m = visible.trim().match(/^(\d{1,2})\s*[/\-.]?\s*(\d{1,2})\s*[/\-.]?\s*(\d{2,4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  const anio = a.length === 2 ? `20${a}` : a.padStart(4, '0')
  const iso = `${anio}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
  // Que exista de verdad: el 31 de febrero se parsea pero no es una fecha.
  const prueba = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(prueba.getTime())) return null
  if (prueba.getDate() !== Number(d) || prueba.getMonth() + 1 !== Number(mes)) return null
  return iso
}

const aVisible = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export function CampoFecha({
  nombre,
  etiqueta,
  valor,
  requerido,
}: {
  nombre: string
  etiqueta: string
  valor?: string | null
  requerido?: boolean
}) {
  const id = useId()
  const [iso, setIso] = useState(valor ?? '')
  const [visible, setVisible] = useState(aVisible(valor))
  const [malo, setMalo] = useState(false)
  const calendario = useRef<HTMLInputElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  const abrirCalendario = () => {
    const el = calendario.current
    if (!el) return
    // showPicker es lo que abre el calendario desde cualquier parte del
    // campo; sin él solo responde el iconito, que casi nadie encuentra.
    if ('showPicker' in el) {
      try {
        el.showPicker()
        return
      } catch {
        /* algunos navegadores lo rechazan fuera de un gesto directo */
      }
    }
    el.focus()
    el.click()
  }

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta} {requerido && <span style={{ color: 'var(--color-alerta)' }}>*</span>}
      </span>

      <span className="relative block">
        <input
          id={id}
          ref={campo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/AAAA"
          value={visible}
          required={requerido}
          aria-invalid={malo || undefined}
          onClick={() => !visible && abrirCalendario()}
          onChange={(e) => {
            const t = e.target.value
            setVisible(t)
            const convertido = aIso(t)
            setIso(convertido ?? '')
            setMalo(t.length > 0 && convertido === null)
          }}
          onBlur={() => {
            const convertido = aIso(visible)
            if (convertido) {
              setVisible(aVisible(convertido))
              setMalo(false)
            } else if (visible.trim() === '') {
              setMalo(false)
            }
          }}
          className="campo pr-9"
          style={malo ? { borderColor: 'var(--color-alerta)' } : undefined}
        />

        <button
          type="button"
          onClick={abrirCalendario}
          aria-label={`Abrir calendario de ${etiqueta.toLowerCase()}`}
          className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-[var(--color-tinta-3)] hover:text-[var(--color-tinta)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
        </button>

        {/* El calendario del navegador, sin su texto: solo nos interesa el
            selector, porque el formato lo escribimos nosotros. */}
        <input
          ref={calendario}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={iso}
          onChange={(e) => {
            setIso(e.target.value)
            setVisible(aVisible(e.target.value))
            setMalo(false)
            // El calendario del navegador se quedaba abierto encima del
            // formulario después de elegir el día y no dejaba seguir
            // capturando. Se cierra devolviendo el foco al campo de
            // texto: mientras el input de fecha lo tenga, el selector
            // sigue en pantalla.
            e.target.blur()
            campo.current?.focus()
          }}
          className="pointer-events-none absolute bottom-0 left-2 h-0 w-0 opacity-0"
        />
      </span>

      {/* Lo que de verdad se envía. */}
      <input type="hidden" name={nombre} value={iso} />

      {malo && (
        <span className="mt-1 block text-[var(--text-micro)]" style={{ color: 'var(--color-alerta)' }}>
          Escribe la fecha como DD/MM/AAAA
        </span>
      )}
    </label>
  )
}

/**
 * Hora tolerante. Acepta lo que la gente teclea de verdad —«9», «930»,
 * «9:30», «21:30», «9 pm»— y lo normaliza a 24 horas al salir del campo.
 * El `input[type=time]` obligaba a capturar minutos y a pelearse con el
 * am/pm, y rechazaba el alta entera por eso.
 */
const aHora = (texto: string): string | null => {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null

  const tarde = /p\.?m\.?$/.test(t)
  const manana = /a\.?m\.?$/.test(t)
  const limpio = t.replace(/[ap]\.?m\.?$/, '')

  let h: number
  let m = 0

  const conSeparador = limpio.match(/^(\d{1,2})[:.h](\d{1,2})$/)
  const soloDigitos = limpio.match(/^(\d{1,4})$/)

  if (conSeparador) {
    h = Number(conSeparador[1])
    m = Number(conSeparador[2])
  } else if (soloDigitos) {
    const d = soloDigitos[1]
    if (d.length <= 2) h = Number(d)
    else {
      h = Number(d.slice(0, d.length - 2))
      m = Number(d.slice(-2))
    }
  } else return null

  if (tarde && h < 12) h += 12
  if (manana && h === 12) h = 0
  if (h > 23 || m > 59) return null

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function CampoHora({
  nombre,
  etiqueta,
  valor,
}: {
  nombre: string
  etiqueta: string
  valor?: string | null
}) {
  const id = useId()
  const [texto, setTexto] = useState(valor ?? '')
  const [malo, setMalo] = useState(false)

  const normalizado = aHora(texto)

  // El meridiano sale de la hora ya normalizada, no de una variable
  // aparte: así los dos botones y lo que está escrito nunca se
  // contradicen, se haya capturado «14:00» o «2 pm».
  const hora24 = normalizado ? Number(normalizado.slice(0, 2)) : null
  const meridiano = hora24 === null ? null : hora24 < 12 ? 'am' : 'pm'

  const ponerMeridiano = (cual: 'am' | 'pm') => {
    if (hora24 === null || meridiano === cual) return
    const nueva = cual === 'pm' ? hora24 + 12 : hora24 - 12
    setTexto(`${String(nueva).padStart(2, '0')}${normalizado!.slice(2)}`)
    setMalo(false)
  }

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[var(--text-menuda)] font-medium text-[var(--color-tinta-2)]">
        {etiqueta}
      </span>
      <span className="flex items-stretch gap-1.5">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="09:30"
          value={texto}
          aria-invalid={malo || undefined}
          onChange={(e) => {
            setTexto(e.target.value)
            setMalo(e.target.value.trim() !== '' && aHora(e.target.value) === null)
          }}
          onBlur={() => {
            const h = aHora(texto)
            if (h) {
              setTexto(h)
              setMalo(false)
            } else if (texto.trim() === '') setMalo(false)
          }}
          className="campo min-w-0 flex-1"
          style={malo ? { borderColor: 'var(--color-alerta)' } : undefined}
        />

        {/* Dos botones en vez de pedir que se teclee «am» o «pm»: quien
            captura escribe el número y de un toque dice si es mañana o
            tarde. Se quedan apagados mientras no haya una hora válida,
            porque sin ella no tienen nada que cambiar. */}
        <span
          role="group"
          aria-label={`Mañana o tarde en ${etiqueta.toLowerCase()}`}
          className="flex shrink-0 gap-0.5 rounded-[var(--radius-sm)] border border-[var(--color-borde-fuerte)] p-0.5"
        >
          {(['am', 'pm'] as const).map((cual) => (
            <button
              key={cual}
              type="button"
              disabled={hora24 === null}
              aria-pressed={meridiano === cual}
              onClick={() => ponerMeridiano(cual)}
              className={`boton !h-auto !px-2 text-[var(--text-menuda)] uppercase ${
                meridiano === cual ? 'boton-primario' : 'boton-llano'
              }`}
              style={hora24 === null ? { opacity: 0.4 } : undefined}
            >
              {cual}
            </button>
          ))}
        </span>
      </span>
      <input type="hidden" name={nombre} value={normalizado ?? ''} />
      <span className="mt-1 block text-[var(--text-micro)] text-[var(--color-tinta-3)]">
        {malo
          ? 'No entendí esa hora'
          : normalizado
            ? `Se guardará como ${normalizado}`
            : 'Escribe 9, 930 o 9:30 y elige AM o PM'}
      </span>
    </label>
  )
}
