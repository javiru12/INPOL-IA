import 'server-only'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { dirname, join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Almacén de archivos adjuntos.
 *
 * En desarrollo los guarda en disco, fuera de `public/`. Esto último es
 * deliberado: un archivo en `public/` queda accesible por su URL para
 * cualquiera que la adivine, sin pasar por la sesión. Aquí la evidencia
 * puede incluir rostros, domicilios y placas, así que los archivos se
 * sirven por una ruta que comprueba quién pide y de qué cliente es.
 *
 * Para producción se sustituye el cuerpo de estas tres funciones por S3
 * sin tocar nada más: el resto del sistema solo conoce la ruta relativa.
 */

const RAIZ = join(process.cwd(), 'db', '.archivos')

/** Lo que se acepta, por extensión y por tipo declarado. */
export const PERMITIDOS: Record<string, { clase: Clase; extensiones: string[] }> = {
  'image/jpeg': { clase: 'foto', extensiones: ['.jpg', '.jpeg'] },
  'image/png': { clase: 'foto', extensiones: ['.png'] },
  'image/webp': { clase: 'foto', extensiones: ['.webp'] },
  'image/heic': { clase: 'foto', extensiones: ['.heic'] },
  'audio/mpeg': { clase: 'audio', extensiones: ['.mp3'] },
  'audio/mp4': { clase: 'audio', extensiones: ['.m4a'] },
  'audio/webm': { clase: 'audio', extensiones: ['.webm'] },
  'video/mp4': { clase: 'video', extensiones: ['.mp4'] },
  'video/quicktime': { clase: 'video', extensiones: ['.mov'] },
  'application/pdf': { clase: 'documento', extensiones: ['.pdf'] },
}

export type Clase = 'foto' | 'audio' | 'video' | 'documento'

/** 20 MB. Un video de celular pasa de eso; se avisa en vez de truncar. */
export const MAXIMO_BYTES = 20 * 1024 * 1024

export type Guardado =
  | { ok: true; ruta: string; clase: Clase; bytes: number; tipoMime: string }
  | { ok: false; error: string }

export async function guardar(
  tenantClave: string,
  peticionId: string,
  archivo: File,
): Promise<Guardado> {
  if (archivo.size === 0) return { ok: false, error: 'El archivo está vacío' }
  if (archivo.size > MAXIMO_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 20 MB`,
    }
  }

  const permitido = PERMITIDOS[archivo.type]
  if (!permitido) {
    return { ok: false, error: `No aceptamos archivos de tipo ${archivo.type || 'desconocido'}` }
  }

  // La extensión tiene que corresponder al tipo declarado: subir un
  // ejecutable renombrado a .jpg es el truco más viejo que hay.
  const extension = extname(archivo.name).toLowerCase()
  if (!permitido.extensiones.includes(extension)) {
    return {
      ok: false,
      error: `La extensión ${extension || '(ninguna)'} no corresponde a un archivo ${permitido.clase}`,
    }
  }

  // El nombre que pone el sistema nunca viene del usuario: un nombre con
  // «../» permitiría escribir fuera de la carpeta del cliente.
  const ruta = join(tenantClave, peticionId, `${randomUUID()}${extension}`)
  const destino = join(RAIZ, ruta)

  await mkdir(dirname(destino), { recursive: true })
  await writeFile(destino, Buffer.from(await archivo.arrayBuffer()))

  return {
    ok: true,
    ruta,
    clase: permitido.clase,
    bytes: archivo.size,
    tipoMime: archivo.type,
  }
}

export async function leer(ruta: string): Promise<Buffer | null> {
  // Defensa en profundidad: aunque la ruta venga de la base, se comprueba
  // que no se salga del almacén.
  const destino = join(RAIZ, ruta)
  if (!destino.startsWith(RAIZ)) return null
  try {
    return await readFile(destino)
  } catch {
    return null
  }
}

export async function borrar(ruta: string): Promise<void> {
  const destino = join(RAIZ, ruta)
  if (!destino.startsWith(RAIZ)) return
  await unlink(destino).catch(() => {})
}
