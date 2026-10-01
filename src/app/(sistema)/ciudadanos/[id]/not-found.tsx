import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function FichaNoEncontrada() {
  return (
    <Pagina titulo="Ficha no encontrada" descripcion="El registro no está en el padrón de esta plaza">
      <Vacio
        titulo="No existe ningún ciudadano con ese identificador"
        descripcion="Puede que el registro se haya dado de baja, que el enlace esté incompleto o que la persona pertenezca a otra plaza."
        accion={
          <Link href="/ciudadanos" className="boton boton-primario">
            Volver al listado
          </Link>
        }
      />
    </Pagina>
  )
}
