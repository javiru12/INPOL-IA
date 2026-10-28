/**
 * Los estatus que cuentan como «ya no hay nada que hacer aquí».
 *
 * Vive aquí y no en la consulta de cada pantalla porque ya se separó
 * una vez: el panel y la sala contaban las canceladas como urgentes sin
 * resolver y marcaban 23, mientras alertas y el listado —que sí las
 * descartaban— marcaban 17. Quien cuente pendientes usa esta lista.
 */
export const ESTATUS_TERMINALES = ['Completada', 'Cancelada'] as const
