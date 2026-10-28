import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { tenantDeLaPeticion } from '@/lib/sesion'
import { exigirAcceso } from '@/lib/acceso'
import { permisosDelUsuario } from '@/lib/permisos'
import { Pagina, Distintivo, Vacio } from '@/components/pagina'
import { IconoVer, IconoMas } from '@/components/iconos'
import { fechaLarga, fechaHora, cifra } from '@/lib/formato'
import {
  CATALOGOS,
  CLAVES_CATALOGO,
  PERMISOS,
  SECCIONES,
  alcanza,
  catalogoValido,
  seccionValida,
  type ClaveCatalogo,
  type ClaveSeccion,
} from './catalogo'
import {
  conteosCatalogos,
  listarCampanias,
  listarCatalogo,
  listarUsuarios,
  perfilesActivos,
  problematicasVigentes,
  resumenConfiguracion,
  datosDelCliente,
} from './consultas'
import { PanelCatalogo, type FilaCatalogo } from './catalogos'
import { FormaCliente } from './cliente'
import { Tabla } from '@/components/tabla'
import { SeccionCiudadanos, SeccionMovilizadores } from './secciones-padron'

export const metadata: Metadata = { title: 'Configuración' }

type Parametros = Record<string, string | string[] | undefined>

function texto(v: string | string[] | undefined) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Configuración.
 *
 * Cuatro pestañas, y la pestaña vive en la URL (`?seccion=`) como los
 * filtros del resto del sistema: así se puede mandar por chat «mira los
 * catálogos» con un enlace, y el botón de atrás hace lo que se espera.
 * En una sola pantalla las cuatro no caben sin volverse ilegibles.
 */
export default async function Configuracion({
  searchParams,
}: {
  searchParams: Promise<Parametros>
}) {
  await exigirAcceso('/configuracion')
  const tenant = await tenantDeLaPeticion()
  if (!tenant) redirect('/entrar')

  const sp = await searchParams
  const seccion = seccionValida(texto(sp.seccion))
  const permisos = await permisosDelUsuario()

  const puede = {
    usuariosAlta: alcanza(permisos, PERMISOS.usuariosAlta),
    usuariosCambio: alcanza(permisos, PERMISOS.usuariosCambio),
    campanias: alcanza(permisos, PERMISOS.campanias),
    catalogos: alcanza(permisos, PERMISOS.catalogos),
    cliente: alcanza(permisos, PERMISOS.cliente),
  }

  const resumen = await resumenConfiguracion(tenant.id)

  return (
    <Pagina
      titulo="Configuración"
      descripcion={`Usuarios, campañas y catálogos de ${tenant.nombre}`}
      acciones={<AccionDeSeccion seccion={seccion} puede={puede} />}
    >
      {/* Estas cuatro cifras se repetían encima de las seis pestañas y
          empujaban 160px hacia abajo la sección que de verdad vienes a
          ver. Dichas en una línea ocupan 20 y se leen igual. */}
      <p className="-mt-3 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-menuda)] text-[var(--color-tinta-2)]">
        <span>
          <span className="cifra">{cifra(resumen.usuariosActivos)}</span> usuarios activos de{' '}
          {cifra(resumen.usuariosTotales)}
        </span>
        <span aria-hidden="true" className="text-[var(--color-tinta-3)]">·</span>
        <span>
          <span className="cifra">{cifra(resumen.campaniasActivas)}</span> campaña
          {resumen.campaniasActivas === 1 ? '' : 's'} en curso
        </span>
        <span aria-hidden="true" className="text-[var(--color-tinta-3)]">·</span>
        <span>
          Licencia hasta el{' '}
          {tenant.licencia_vence ? fechaLarga(tenant.licencia_vence) : 'sin fecha'}
        </span>
        {/* Que haya un solo súper administrador sí es un aviso: si esa
            persona se va, nadie puede nombrar a la siguiente. */}
        {resumen.superAdmins <= 1 && (
          <Distintivo tono="aviso">
            Un solo súper administrador: nombra a otro antes de que haga falta
          </Distintivo>
        )}
      </p>

      <nav
        aria-label="Secciones de configuración"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--color-borde)]"
      >
        {SECCIONES.map((s) => {
          const activa = s.clave === seccion
          return (
            <Link
              key={s.clave}
              href={`/configuracion?seccion=${s.clave}`}
              aria-current={activa ? 'page' : undefined}
              className="-mb-px border-b-2 px-3 py-2 text-[var(--text-base)] font-medium transition-colors"
              style={{
                borderColor: activa ? 'var(--color-acento)' : 'transparent',
                color: activa ? 'var(--color-acento-fuerte)' : 'var(--color-tinta-2)',
              }}
            >
              {s.etiqueta}
            </Link>
          )
        })}
      </nav>

      <div className="mt-4">
        {seccion === 'usuarios' && <SeccionUsuarios tenantId={tenant.id} puedeVerDetalle={puede.usuariosCambio} />}
        {seccion === 'ciudadanos' && <SeccionCiudadanos tenantId={tenant.id} />}
        {seccion === 'movilizadores' && <SeccionMovilizadores tenantId={tenant.id} />}
        {seccion === 'campanias' && <SeccionCampanias tenantId={tenant.id} />}
        {seccion === 'catalogos' && (
          <SeccionCatalogos
            tenantId={tenant.id}
            catalogo={catalogoValido(texto(sp.catalogo))}
            puedeEditar={puede.catalogos}
          />
        )}
        {seccion === 'cliente' && (
          <SeccionCliente tenantId={tenant.id} puedeEditar={puede.cliente} />
        )}
      </div>
    </Pagina>
  )
}

function AccionDeSeccion({
  seccion,
  puede,
}: {
  seccion: ClaveSeccion
  puede: { usuariosAlta: boolean; campanias: boolean }
}) {
  if (seccion === 'usuarios' && puede.usuariosAlta) {
    return (
      <Link href="/configuracion/usuarios/nuevo" className="boton boton-primario">
        <IconoMas tamano={14} />
        Nuevo usuario
      </Link>
    )
  }
  // Importar sirve para varias de las secciones, no solo para una, así
  // que su botón vive en las dos que reciben datos de fuera.
  if (seccion === 'ciudadanos' || seccion === 'movilizadores') {
    return (
      <Link href="/configuracion/importar" className="boton boton-neutro">
        Importar datos
      </Link>
    )
  }
  if (seccion === 'campanias' && puede.campanias) {
    return (
      <Link href="/configuracion/campanias/nueva" className="boton boton-primario">
        <IconoMas tamano={14} />
        Nueva campaña
      </Link>
    )
  }
  return null
}

// --- Usuarios -----------------------------------------------------------

async function SeccionUsuarios({
  tenantId,
  puedeVerDetalle,
}: {
  tenantId: string
  puedeVerDetalle: boolean
}) {
  const [usuarios, perfiles] = await Promise.all([listarUsuarios(tenantId), perfilesActivos()])
  const nombrePerfil = new Map(perfiles.map((p) => [p.clave, p.nombre]))

  return (
    <section className="panel overflow-hidden">
      <Tabla>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Perfil</th>
            <th>Puesto</th>
            <th>Último acceso</th>
            <th>Estado</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.55 }}>
              <td className="font-medium">{u.nombre ?? '—'}</td>
              <td className="clave">{u.correo}</td>
              <td>{nombrePerfil.get(u.perfil_clave) ?? u.perfil_clave}</td>
              <td className="text-[var(--color-tinta-2)]">{u.puesto ?? '—'}</td>
              <td className="text-[var(--color-tinta-2)]">
                {u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca'}
              </td>
              <td>
                <Distintivo tono={u.activo ? 'exito' : 'neutro'}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                </Distintivo>
              </td>
              <td className="w-10">
                <Link
                  href={`/configuracion/usuarios/${u.id}`}
                  className="boton boton-llano !h-7 !w-7 !p-0"
                  aria-label={`${puedeVerDetalle ? 'Editar' : 'Ver'} a ${u.nombre ?? u.correo}`}
                >
                  <IconoVer />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </section>
  )
}

// --- Campañas -----------------------------------------------------------

async function SeccionCampanias({ tenantId }: { tenantId: string }) {
  const campanias = await listarCampanias(tenantId)

  if (campanias.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay campañas"
        descripcion="Una campaña agrupa el calendario operativo y a sus candidatos."
        accion={
          <Link href="/configuracion/campanias/nueva" className="boton boton-primario">
            Crear la primera
          </Link>
        }
      />
    )
  }

  return (
    <section className="panel overflow-hidden">
      <Tabla>
        <thead>
          <tr>
            <th>Campaña</th>
            <th>Tipo</th>
            <th>Responsable</th>
            <th className="num">Candidatos</th>
            <th className="num">Jornada</th>
            <th>Estado</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {campanias.map((c) => (
            <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.55 }}>
              <td className="font-medium">{c.nombre}</td>
              <td className="text-[var(--color-tinta-2)]">{c.tipo ?? '—'}</td>
              <td className="text-[var(--color-tinta-2)]">{c.responsable ?? '—'}</td>
              <td className="num">{c.candidatos > 0 ? cifra(c.candidatos) : '—'}</td>
              <td className="num clave whitespace-nowrap">
                {c.fecha_jornada ? fechaLarga(c.fecha_jornada) : '—'}
              </td>
              <td>
                <Distintivo tono={c.activo ? 'exito' : 'neutro'}>
                  {c.activo ? 'En curso' : 'Archivada'}
                </Distintivo>
              </td>
              <td className="w-10">
                <Link
                  href={`/configuracion/campanias/${c.id}`}
                  className="boton boton-llano !h-7 !w-7 !p-0"
                  aria-label={`Abrir ${c.nombre}`}
                >
                  <IconoVer />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </section>
  )
}

// --- Datos del cliente --------------------------------------------------

async function SeccionCliente({
  tenantId,
  puedeEditar,
}: {
  tenantId: string
  puedeEditar: boolean
}) {
  const cliente = await datosDelCliente(tenantId)
  if (!cliente) redirect('/entrar')

  return (
    <FormaCliente
      clave={cliente.clave}
      nombre={cliente.nombre}
      nombreCorto={cliente.nombre_corto}
      colorAcento={cliente.color_acento}
      licenciaInicia={cliente.licencia_inicia}
      licenciaVence={cliente.licencia_vence}
      puedeEditar={puedeEditar}
    />
  )
}

// --- Catálogos ----------------------------------------------------------

async function SeccionCatalogos({
  tenantId,
  catalogo,
  puedeEditar,
}: {
  tenantId: string
  catalogo: ClaveCatalogo
  puedeEditar: boolean
}) {
  const [filas, conteos, problematicas] = await Promise.all([
    listarCatalogo(tenantId, catalogo),
    conteosCatalogos(tenantId),
    problematicasVigentes(tenantId),
  ])

  return (
    <>
      <nav aria-label="Catálogos" className="mb-3 flex flex-wrap items-center gap-1.5">
        {CLAVES_CATALOGO.map((c) => {
          const activo = c === catalogo
          return (
            <Link
              key={c}
              href={`/configuracion?seccion=catalogos&catalogo=${c}`}
              aria-current={activo ? 'page' : undefined}
              className={`boton !h-8 text-[var(--text-menuda)] ${
                activo ? 'boton-primario' : 'boton-neutro'
              }`}
            >
              {CATALOGOS[c].etiqueta}
              <span className={activo ? 'opacity-70' : 'text-[var(--color-tinta-3)]'}>
                {cifra(conteos[c])}
              </span>
            </Link>
          )
        })}
      </nav>

      <PanelCatalogo
        /* Cambiar de catálogo reinicia lo que se estuviera editando. */
        key={catalogo}
        catalogo={catalogo}
        filas={filas as FilaCatalogo[]}
        problematicas={problematicas}
        puedeEditar={puedeEditar}
      />
    </>
  )
}
