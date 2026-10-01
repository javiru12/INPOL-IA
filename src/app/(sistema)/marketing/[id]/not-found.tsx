import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function NoEncontrada() {
  return (
    <Pagina titulo="Campaña no encontrada">
      <Vacio
        titulo="Esa campaña no existe"
        descripcion="Puede que se haya eliminado, o que el enlace pertenezca a otro cliente."
        accion={
          <Link href="/marketing" className="boton boton-primario">
            Ir a Comunicación
          </Link>
        }
      />
    </Pagina>
  )
}
