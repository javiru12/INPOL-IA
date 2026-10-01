import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

/**
 * Primer filtro de acceso por ruta. En Next 16 esto se llama «proxy».
 *
 * Ocultar una entrada del menú no protege nada: cualquiera puede escribir
 * la dirección. Aquí se corta el paso antes de renderizar, leyendo las
 * rutas permitidas de la cookie de sesión.
 *
 * Es un filtro optimista, no la autorización definitiva: la documentación
 * de Next desaconseja apoyar toda la autorización aquí. La comprobación
 * real vive en `exigirAcceso()` de `src/lib/acceso.ts`, que cada pantalla
 * llama del lado del servidor. Este filtro evita el trabajo inútil; aquél
 * es el que manda.
 */

// Rutas abiertas a cualquiera. El portal ciudadano vive aquí: quien
// reporta un bache no tiene usuario en el sistema ni debería tenerlo.
const PUBLICAS = [
  '/entrar',
  '/plaza',
  '/sin-acceso',
  '/reportar',
  '/seguimiento',
  '/aviso-de-privacidad',
]

const llave = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'desarrollo_local_cambiar_en_produccion',
)

export async function proxy(peticion: NextRequest) {
  const { pathname } = peticion.nextUrl

  if (PUBLICAS.some((r) => pathname.startsWith(r))) return NextResponse.next()

  const token = peticion.cookies.get('inpol_sesion')?.value
  if (!token) return NextResponse.redirect(new URL('/entrar', peticion.url))

  let sesion: { rutas?: string[] }
  try {
    const { payload } = await jwtVerify(token, llave)
    sesion = payload as { rutas?: string[] }
  } catch {
    return NextResponse.redirect(new URL('/entrar', peticion.url))
  }

  // Las sesiones emitidas antes de que existiera el control no traen
  // rutas: se las manda a entrar de nuevo en vez de dejarlas pasar.
  if (!Array.isArray(sesion.rutas)) {
    return NextResponse.redirect(new URL('/entrar', peticion.url))
  }

  // La raíz, la sala de mando y el informe están disponibles para
  // cualquiera con sesión: son vistas de resumen, sin datos de detalle.
  if (pathname === '/' || pathname.startsWith('/sala') || pathname.startsWith('/informe')) {
    return NextResponse.next()
  }

  const permitida = sesion.rutas.some(
    (r) => r !== '/' && (pathname === r || pathname.startsWith(r + '/')),
  )

  if (!permitida) {
    const destino = new URL('/sin-acceso', peticion.url)
    destino.searchParams.set('ruta', pathname)
    return NextResponse.redirect(destino)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|geo/).*)'],
}
