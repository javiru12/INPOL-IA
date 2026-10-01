import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function MovilizadorNoEncontrado() {
  return (
    <Pagina
      titulo="Movilizador no encontrado"
      descripcion="El registro no está en la red de movilización de esta plaza"
    >
      <Vacio
        titulo="No existe ningún movilizador con ese identificador"
        descripcion="Puede que se le haya dado de baja de la red, que el enlace esté incompleto o que pertenezca a otra plaza."
        accion={
          <Link href="/movilizacion" className="boton boton-primario">
            Volver a la red
          </Link>
        }
      />
    </Pagina>
  )
}
