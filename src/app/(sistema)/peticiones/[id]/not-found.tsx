import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function NoEncontrada() {
  return (
    <Pagina titulo="Petición no encontrada">
      <Vacio
        titulo="Esa petición no existe"
        descripcion="Puede que se haya eliminado, o que el enlace pertenezca a otro cliente."
        accion={
          <Link href="/peticiones" className="boton boton-primario">
            Ir al listado
          </Link>
        }
      />
    </Pagina>
  )
}
