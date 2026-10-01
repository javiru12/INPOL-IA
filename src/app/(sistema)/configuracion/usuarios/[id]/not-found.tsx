import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function NoEncontrado() {
  return (
    <Pagina titulo="Usuario no encontrado">
      <Vacio
        titulo="Ese usuario no existe en este cliente"
        descripcion="Puede que se haya dado de baja, o que el enlace venga de otra plaza."
        accion={
          <Link href="/configuracion?seccion=usuarios" className="boton boton-primario">
            Ver los usuarios
          </Link>
        }
      />
    </Pagina>
  )
}
