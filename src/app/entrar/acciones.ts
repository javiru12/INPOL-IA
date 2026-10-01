'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { conTenant, sinTenant } from '@/lib/db'
import { abrirSesion, tenantDeLaPeticion } from '@/lib/sesion'
import { filtrarNavegacion } from '@/lib/navegacion'

const Entrada = z.object({
  correo: z.string().trim().toLowerCase().email('Correo no válido'),
  contrasena: z.string().min(1, 'Escribe tu contraseña'),
})

export type EstadoEntrada = { error?: string }

export async function entrar(
  _previo: EstadoEntrada,
  datos: FormData,
): Promise<EstadoEntrada> {
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/plaza')

  const analisis = Entrada.safeParse({
    correo: datos.get('correo'),
    contrasena: datos.get('contrasena'),
  })
  if (!analisis.success) {
    return { error: analisis.error.issues[0].message }
  }
  const { correo, contrasena } = analisis.data

  // La búsqueda corre dentro del contexto del tenant del subdominio: un
  // correo dado de alta en otro cliente sencillamente no existe aquí.
  // Tiene que ir por conTenant — `usuarios` está bajo RLS y sin el tenant
  // fijado la consulta no devuelve nada.
  const [usuario] = await conTenant(tenant.id, (tx) =>
    tx<
      { id: string; nombre: string; apellido_paterno: string | null; perfil_clave: string; contrasena_hash: string }[]
    >`
      select id, nombre, apellido_paterno, perfil_clave, contrasena_hash
      from usuarios
      where correo = ${correo} and activo = true`,
  )

  // Mismo mensaje para usuario inexistente y contraseña incorrecta: no se
  // le confirma a nadie qué correos están dados de alta en este cliente.
  const generico = { error: 'Correo o contraseña incorrectos' }
  if (!usuario) {
    await bcrypt.compare(contrasena, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv')
    return generico
  }
  if (!(await bcrypt.compare(contrasena, usuario.contrasena_hash))) return generico

  await conTenant(tenant.id, async (tx) => {
    await tx`update usuarios set ultimo_acceso = now() where id = ${usuario.id}`
    await tx`
      insert into bitacora (tenant_id, usuario_id, accion, entidad, entidad_id)
      values (${tenant.id}, ${usuario.id}, 'acceso', 'usuarios', ${usuario.id})`
  })

  // Rutas permitidas, resueltas una vez al entrar.
  const funcionalidades = await sinTenant<{ funcionalidad_clave: string }[]>`
    select funcionalidad_clave
    from perfil_funcionalidades
    where perfil_clave = ${usuario.perfil_clave}`

  const permisos = new Set(funcionalidades.map((f) => f.funcionalidad_clave))
  const rutas = filtrarNavegacion(permisos).flatMap((g) => g.entradas.map((e) => e.ruta))

  await abrirSesion({
    usuarioId: usuario.id,
    tenantId: tenant.id,
    tenantClave: tenant.clave,
    perfil: usuario.perfil_clave,
    nombre: [usuario.nombre, usuario.apellido_paterno].filter(Boolean).join(' '),
    rutas,
  })

  redirect('/')
}
