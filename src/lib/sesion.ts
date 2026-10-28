import 'server-only'
import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { cache } from 'react'
import { sinTenant } from './db'

const COOKIE_SESION = 'inpol_sesion'
const COOKIE_TENANT = 'inpol_tenant'
const DURACION = 60 * 60 * 10 // 10 horas: una jornada de trabajo

/**
 * Con «recuérdame», treinta días.
 *
 * No es sólo comodidad: quien trabaja en campo entra desde su propio
 * celular varias veces al día, y volver a teclear la contraseña en una
 * pantalla chica con una mano empuja a poner contraseñas cortas. Es una
 * casilla y no el comportamiento por omisión porque en una computadora
 * compartida de oficina la sesión corta es lo correcto.
 */
const DURACION_RECORDADA = 60 * 60 * 24 * 30

const llave = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'desarrollo_local_cambiar_en_produccion',
)

export type Sesion = {
  usuarioId: string
  tenantId: string
  tenantClave: string
  perfil: string
  nombre: string
  /**
   * Rutas que el perfil puede abrir. Se calcula al iniciar sesión y viaja
   * en la cookie para que el middleware pueda bloquear el acceso directo
   * por URL sin consultar la base en cada petición.
   *
   * Son una decena de rutas, no las 293 funcionalidades del catálogo. Si
   * se cambian los permisos de un perfil, la sesión en curso conserva los
   * anteriores hasta que vuelva a entrar.
   */
  rutas: string[]
  /**
   * Huella del menú con el que se emitió esta sesión. Si no coincide
   * con la de hoy, la lista de rutas de arriba es de un menú anterior.
   */
  v?: string
}

export async function abrirSesion(s: Sesion, recordar = false) {
  const dura = recordar ? DURACION_RECORDADA : DURACION

  // La caducidad va en el token y en la galleta: si solo fuera en la
  // galleta, bastaría con editarla en el navegador para estirar una
  // sesión caducada.
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${dura}s`)
    .sign(llave)

  const tarro = await cookies()
  tarro.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: dura,
  })
}

export async function cerrarSesion() {
  const tarro = await cookies()
  tarro.delete(COOKIE_SESION)
}

/** Sesión del usuario en curso, o null. Memoizada por petición. */
export const leerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, llave)
    return payload as unknown as Sesion
  } catch {
    return null
  }
})

export type Tenant = {
  id: string
  clave: string
  nombre: string
  nombre_corto: string | null
  color_acento: string | null
  licencia_vence: string | null
  /** En qué estado opera. Sin esto no se le puede enseñar geografía. */
  estado_id: string | null
  estado_nombre: string | null
  /** Clave INE del estado: decide zona horaria y cartografía. */
  estado_clave: string | null
}

/**
 * Resuelve a qué cliente pertenece la petición.
 *
 * Orden: subdominio (monterrey.inpol.mx) y, solo si no hay, la cookie que
 * deja el selector de plaza. En producción manda siempre el subdominio,
 * para que nadie pueda apuntar a otro cliente cambiando una cookie.
 */
export const tenantDeLaPeticion = cache(async (): Promise<Tenant | null> => {
  const host = (await headers()).get('host') ?? ''
  const sinPuerto = host.split(':')[0]
  const partes = sinPuerto.split('.')

  // Una dirección IP no tiene subdominio: partirla por puntos daría '192'
  // como clave de cliente y dejaría el selector de plaza en un bucle. Se
  // entra por IP al probar desde otro aparato de la misma red.
  const esIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(sinPuerto)

  let clave: string | undefined
  if (!esIP && partes.length > 1 && !['www', 'admin'].includes(partes[0])) {
    clave = partes[0]
  }

  const porCookie = (await cookies()).get(COOKIE_TENANT)?.value
  if (!clave) clave = porCookie

  if (!clave) return null

  const buscar = (c: string) => sinTenant<Tenant[]>`
    select t.id, t.clave, t.nombre, t.nombre_corto, t.color_acento,
           t.licencia_vence::text,
           t.estado_id, e.nombre as estado_nombre, e.clave as estado_clave
    from tenants t
    left join estados e on e.id = t.estado_id
    where t.clave = ${c} and t.activo = true`

  const [tenant] = await buscar(clave)
  if (tenant) return tenant

  // El primer tramo del host no siempre es un cliente: puede ser el
  // dominio de un túnel de pruebas, un `app.` o cualquier otro prefijo.
  // Si no corresponde a ninguno, se cae a la cookie del selector de plaza
  // en vez de devolver null, que dejaba la pantalla rebotando a /plaza.
  if (porCookie && porCookie !== clave) {
    const [porSelector] = await buscar(porCookie)
    return porSelector ?? null
  }

  return null
})

export async function recordarTenant(clave: string) {
  const tarro = await cookies()
  tarro.set(COOKIE_TENANT, clave, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function olvidarTenant() {
  ;(await cookies()).delete(COOKIE_TENANT)
}

/** Lista de clientes para el selector de plaza. */
export async function tenantsDisponibles() {
  return sinTenant<Pick<Tenant, 'clave' | 'nombre' | 'nombre_corto' | 'color_acento'>[]>`
    select clave, nombre, nombre_corto, color_acento
    from tenants
    where activo = true
    order by nombre`
}
