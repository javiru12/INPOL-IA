import Link from 'next/link'
import { Pagina, Vacio } from '@/components/pagina'

export default function ActividadNoEncontrada() {
  return (
    <Pagina titulo="Actividad no encontrada">
      <Vacio
        titulo="Esa actividad no existe o ya no está disponible"
        descripcion="La dirección debe apuntar a un recorrido o a un evento de esta plaza. Puede que se haya dado de baja, que pertenezca a otro cliente o que el enlace venga incompleto."
        accion={
          <Link href="/actividades" className="boton boton-primario">
            Volver a actividades
          </Link>
        }
      />
    </Pagina>
  )
}
