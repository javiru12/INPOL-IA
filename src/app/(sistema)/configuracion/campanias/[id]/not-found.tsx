import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function NoEncontrada() {
  return (
    <Pagina titulo="Campaña no encontrada">
      <Vacio
        titulo="Esa campaña no existe en este cliente"
        descripcion="Puede que se haya borrado, o que el enlace venga de otra plaza."
        accion={
          <Link href="/configuracion?seccion=campanias" className="boton boton-primario">
            Ver las campañas
          </Link>
        }
      />
    </Pagina>
  )
}
