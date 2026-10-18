/**
 * Tope de peticiones por cambio en lote.
 *
 * Vive aquí y no en `acciones.ts` porque un archivo `'use server'` solo
 * puede exportar funciones async: una constante ahí rompe la compilación
 * del módulo entero.
 *
 * El número no es técnico. Mover doscientas de un golpe ya es una
 * decisión que conviene pensar dos veces; más que eso, lo sensato es
 * acotar con los filtros antes de tocar nada.
 */
export const MAXIMO_EN_LOTE = 200
