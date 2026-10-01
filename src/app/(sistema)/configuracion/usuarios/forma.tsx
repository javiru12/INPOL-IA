'use client'

import { useActionState } from 'react'
import {
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearUsuario,
  restablecerContrasena,
  type EstadoAccion,
} from '../acciones'
import { Campo, Selector, Aviso, Enviar } from '../piezas'

type Perfil = { clave: string; nombre: string; descripcion: string | null }

function opcionesPerfil(perfiles: Perfil[]) {
  return perfiles.map((p) => ({ valor: p.clave, texto: p.nombre }))
}

/** Alta. La contraseña entra aquí y sale cifrada: nunca se guarda en claro. */
export function AltaUsuario({ perfiles }: { perfiles: Perfil[] }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(crearUsuario, {})

  return (
    <form action={accion} className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">Quién es</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo nombre="nombre" etiqueta="Nombre(s)" requerido />
          <Campo nombre="apellidoPaterno" etiqueta="Apellido paterno" />
          <Campo nombre="apellidoMaterno" etiqueta="Apellido materno" />
        </div>

        <Campo
          nombre="correo"
          etiqueta="Correo"
          tipo="email"
          requerido
          marcador="nombre@dominio.mx"
          autoComplete="off"
          ayuda="Con este correo entra al sistema. Es único dentro de este cliente."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo nombre="telefono" etiqueta="Teléfono móvil" tipo="tel" />
          <Campo nombre="puesto" etiqueta="Puesto" />
        </div>
      </section>

      <section className="panel space-y-3 px-4 py-4">
        <h2 className="text-[var(--text-base)] font-semibold">Qué puede hacer</h2>

        <Selector
          nombre="perfil"
          etiqueta="Perfil"
          requerido
          opciones={opcionesPerfil(perfiles)}
          vacio="Elige el perfil…"
          ayuda="El perfil decide qué módulos ve y qué puede tocar en cada uno."
        />

        <Campo
          nombre="contrasena"
          etiqueta="Contraseña inicial"
          tipo="password"
          requerido
          autoComplete="new-password"
          ayuda="Mínimo 8 caracteres. Se guarda cifrada; pásasela por un canal seguro y que la cambie."
        />

        <Aviso estado={estado} />
        <Enviar etiqueta="Dar de alta" accion="usuario-crear" ancho />
      </section>
    </form>
  )
}

export type DatosUsuario = {
  id: string
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  correo: string
  perfil_clave: string
  puesto: string | null
  telefono_movil: string | null
  activo: boolean
}

/** Edición: datos y perfil, estado de acceso y restablecimiento de contraseña. */
export function EdicionUsuario({
  usuario,
  perfiles,
  esUnoMismo,
  puedeCambiar,
  puedeDarDeBaja,
}: {
  usuario: DatosUsuario
  perfiles: Perfil[]
  esUnoMismo: boolean
  puedeCambiar: boolean
  puedeDarDeBaja: boolean
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_22rem] lg:items-start">
      <FormaDatos
        usuario={usuario}
        perfiles={perfiles}
        esUnoMismo={esUnoMismo}
        puedeCambiar={puedeCambiar}
      />

      <div className="space-y-3">
        <FormaEstado
          usuario={usuario}
          esUnoMismo={esUnoMismo}
          puedeDarDeBaja={puedeDarDeBaja}
        />
        {puedeCambiar && <FormaContrasena id={usuario.id} />}
      </div>
    </div>
  )
}

function FormaDatos({
  usuario,
  perfiles,
  esUnoMismo,
  puedeCambiar,
}: {
  usuario: DatosUsuario
  perfiles: Perfil[]
  esUnoMismo: boolean
  puedeCambiar: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(actualizarUsuario, {})

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      <input type="hidden" name="id" value={usuario.id} />
      <h2 className="text-[var(--text-base)] font-semibold">Datos y perfil</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo nombre="nombre" etiqueta="Nombre(s)" valor={usuario.nombre} requerido />
        <Campo
          nombre="apellidoPaterno"
          etiqueta="Apellido paterno"
          valor={usuario.apellido_paterno}
        />
        <Campo
          nombre="apellidoMaterno"
          etiqueta="Apellido materno"
          valor={usuario.apellido_materno}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo nombre="telefono" etiqueta="Teléfono móvil" tipo="tel" valor={usuario.telefono_movil} />
        <Campo nombre="puesto" etiqueta="Puesto" valor={usuario.puesto} />
      </div>

      <Selector
        nombre="perfil"
        etiqueta="Perfil"
        requerido
        valor={usuario.perfil_clave}
        opciones={opcionesPerfil(perfiles)}
        ayuda={
          esUnoMismo
            ? 'Es tu propio usuario: no puedes quitarte el perfil de administrador.'
            : undefined
        }
      />

      <Aviso estado={estado} exito="Datos guardados" />

      {puedeCambiar ? (
        <Enviar etiqueta="Guardar cambios" accion="usuario-guardar" />
      ) : (
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Tu perfil puede consultar este usuario, pero no modificarlo.
        </p>
      )}
    </form>
  )
}

/**
 * Acceso al sistema.
 *
 * El botón no se deshabilita cuando es tu propio usuario: un botón apagado
 * no explica nada. Se envía, el servidor lo rechaza y dice por qué.
 */
function FormaEstado({
  usuario,
  esUnoMismo,
  puedeDarDeBaja,
}: {
  usuario: DatosUsuario
  esUnoMismo: boolean
  puedeDarDeBaja: boolean
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarEstadoUsuario, {})

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      <input type="hidden" name="id" value={usuario.id} />
      <input type="hidden" name="activo" value={usuario.activo ? 'false' : 'true'} />

      <h2 className="text-[var(--text-base)] font-semibold">Acceso</h2>
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        {usuario.activo
          ? 'Puede entrar al sistema con su correo y contraseña.'
          : 'No puede entrar. Su historial y sus peticiones siguen intactos.'}
      </p>

      <Aviso estado={estado} />

      {puedeDarDeBaja ? (
        <>
          <Enviar
            etiqueta={usuario.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
            pendiente="Aplicando…"
            variante={usuario.activo ? 'peligro' : 'neutro'}
            accion="usuario-estado"
            ancho
          />
          {esUnoMismo && usuario.activo && (
            <p className="text-[var(--text-micro)] text-[var(--color-tinta-3)]">
              Es tu propio usuario: el sistema no te va a dejar.
            </p>
          )}
        </>
      ) : (
        <p className="text-[var(--text-menuda)] text-[var(--color-tinta-3)]">
          Tu perfil no puede dar de baja usuarios.
        </p>
      )}
    </form>
  )
}

function FormaContrasena({ id }: { id: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(restablecerContrasena, {})

  return (
    <form action={accion} className="panel space-y-3 px-4 py-4">
      <input type="hidden" name="id" value={id} />
      <h2 className="text-[var(--text-base)] font-semibold">Contraseña</h2>
      <p className="text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        No se puede recuperar la anterior —se guarda cifrada—, solo poner otra.
      </p>

      <Campo
        nombre="contrasena"
        etiqueta="Nueva contraseña"
        tipo="password"
        requerido
        autoComplete="new-password"
        ayuda="Mínimo 8 caracteres."
      />

      <Aviso estado={estado} />
      <Enviar
        etiqueta="Restablecer contraseña"
        variante="neutro"
        accion="usuario-contrasena"
        ancho
      />
    </form>
  )
}
