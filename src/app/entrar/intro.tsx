'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * El video de entrada.
 *
 * Tres reglas, y las tres existen porque un intro mal puesto es peor
 * que no tener ninguno:
 *
 * 1. **Nunca bloquea.** Va detrás del panel de marca, no encima de la
 *    pantalla: se puede teclear el correo desde el primer instante y
 *    el video corre de fondo. Antes tapaba todo y había que saltarlo
 *    para poder entrar, que es cobrarle al usuario por un adorno. Si
 *    en un segundo y medio no arrancó, se descarta.
 * 2. **Una vez por sesión del navegador, no por intento de entrar.**
 *    Netflix lo pone al abrir la aplicación, no cada vez que te
 *    equivocas de contraseña. Verlo cuatro veces seguidas por fallar el
 *    password lo convierte en un castigo.
 * 3. **Se desvanece solo** al terminar, dejando la retícula debajo.
 *
 * Quien tenga activado «reducir movimiento» en su sistema no lo ve: esa
 * preferencia suele venir de mareo o migraña, no de gusto.
 */

const LLAVE = 'inpol_intro_visto'
const ESPERA_MAXIMA = 1500

export function Intro() {
  const [visible, setVisible] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const prefiereQuieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let yaVisto = false
    try {
      yaVisto = sessionStorage.getItem(LLAVE) === '1'
    } catch {
      // Navegación privada o cookies bloqueadas: se trata como no visto.
    }
    if (prefiereQuieto || yaVisto) return

    setVisible(true)
    try {
      sessionStorage.setItem(LLAVE, '1')
    } catch {
      /* da igual: como mucho se vuelve a ver */
    }

    // Red de seguridad: si no arrancó a tiempo, fuera.
    const reloj = setTimeout(() => {
      if (!video.current || video.current.currentTime === 0) cerrar()
    }, ESPERA_MAXIMA)
    return () => clearTimeout(reloj)
  }, [])

  function cerrar() {
    setSaliendo(true)
    // Se desmonta después del desvanecido para que el corte al
    // formulario no se vea como un parpadeo.
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-[600ms]"
      style={{ opacity: saliendo ? 0 : 1 }}
    >
      <video
        ref={video}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={cerrar}
        onError={cerrar}
        className="h-full w-full object-cover opacity-70"
      />
      {/* Velo: sin él, el nombre de la campaña y el pie quedan encima
          del mapa y no se leen. Un fondo de marca es fondo. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgb(30 25 38 / 0.72), rgb(30 25 38 / 0.55) 55%, rgb(30 25 38 / 0.78))',
        }}
      />
    </div>
  )
}
