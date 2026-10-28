'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * El video de entrada.
 *
 * Tres reglas, y las tres existen porque un intro mal puesto es peor
 * que no tener ninguno:
 *
 * 1. **Nunca bloquea.** El archivo pesa diez megas y hay oficinas con
 *    conexiones malas. Si en un segundo y medio no empezó a reproducir,
 *    se descarta y aparece el formulario. Nadie espera por un adorno.
 * 2. **Una vez por sesión del navegador, no por intento de entrar.**
 *    Netflix lo pone al abrir la aplicación, no cada vez que te
 *    equivocas de contraseña. Verlo cuatro veces seguidas por fallar el
 *    password lo convierte en un castigo.
 * 3. **Se salta con un clic o con cualquier tecla**, y lo dice.
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

  useEffect(() => {
    if (!visible) return
    const salir = () => cerrar()
    window.addEventListener('keydown', salir)
    return () => window.removeEventListener('keydown', salir)
  }, [visible])

  if (!visible) return null

  return (
    <div
      onClick={cerrar}
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-[400ms]"
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
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={cerrar}
        className="absolute bottom-8 right-8 rounded-[var(--radius-sm)] px-3 py-1.5 text-[var(--text-menuda)] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        Saltar
      </button>
    </div>
  )
}
