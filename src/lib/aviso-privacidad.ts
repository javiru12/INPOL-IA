/**
 * Versión vigente del aviso de privacidad.
 *
 * Vive fuera de `portal.ts` porque un archivo marcado con `'use server'`
 * solo admite exportar funciones asíncronas: una constante ahí rompe la
 * compilación del módulo entero.
 *
 * Al cambiar el texto del aviso hay que subir esta versión: lo que se
 * guarda junto al consentimiento de cada persona es exactamente esto, y
 * es lo que permite saber después qué aceptó.
 */
export const VERSION_AVISO = '2026-10'
