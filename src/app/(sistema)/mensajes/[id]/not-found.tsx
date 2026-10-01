import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function NoEncontrada() {
  return (
    <Pagina titulo="Conversación no encontrada">
      <Vacio
        titulo="Esa conversación no está disponible"
        descripcion="Puede que se haya archivado, que el enlace sea de otro cliente, o que no seas parte de ella."
        accion={
          <Link href="/mensajes" className="boton boton-primario">
            Ir a la bandeja
          </Link>
        }
      />
    </Pagina>
  )
}
