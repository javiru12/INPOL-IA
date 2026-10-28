

/**
 * Lo que el asistente sabe de la base.
 *
 * Está escrito a mano y no sacado de `information_schema` a propósito.
 * Volcar el catálogo entero daría ciento y pico de tablas, la mayoría
 * ruido, y ninguna explicación de qué significa cada cosa. Lo que el
 * modelo necesita para escribir una consulta correcta no es la lista de
 * columnas: es saber que `fecha_cierre` también se llena cuando una
 * petición se cancela, o que los porcentajes electorales van sobre
 * votos válidos. Eso no está en el catálogo.
 *
 * Cada trampa que aprendimos a golpes está aquí abajo, porque si no, el
 * asistente las repite una por una.
 */
export const ESQUEMA = `
# Modelo de datos

Todas las tablas de cliente llevan \`tenant_id\`, pero NO hay que
filtrarlo nunca: la base ya solo entrega las filas del cliente de quien
pregunta. Escribir el filtro no hace daño pero sobra.

## Gestión social

**peticiones** — la solicitud de un ciudadano.
  id, ciudadano_id, problematica_id, subproblematica_id, descripcion,
  fecha_apertura (timestamptz), fecha_cierre (timestamptz),
  estatus_id, prioridad_id, operador_id, dependencia_id, fuente_id,
  municipio_id, seccion_id, distrito_local_id, folio, activo
  · \`fecha_cierre\` NO significa «resuelta»: las canceladas también
    cierran. Para medir atención, filtra por estatus 'Completada'.
  · El folio que ve la gente es \`upper(substr(id::text,1,6))\`.

**ciudadanos** — quién pide.
  id, nombre, apellido_paterno, apellido_materno, nombre_completo,
  sexo, fecha_nacimiento, edad, colonia, codigo_postal, telefono_movil,
  correo, curp, seccion_id, municipio_id, origen, discapacidad,
  tipo_discapacidad, adulto_mayor, zona_discrepante, activo
  · La edad fiable es \`coalesce(nullif(date_part('year', age(fecha_nacimiento))::int,0), edad)\`:
    la columna \`edad\` se guardó el día de la captura y no envejece sola.
  · \`origen\`: 'captura' (gestión territorial), 'app' (app de
    afiliación), 'portal' (canal público), 'importado' (carga masiva).

**seguimientos** — cada movimiento de una petición.
**estatus_peticiones** (descripcion), **prioridades** (descripcion),
**problematicas** (titulo ← el nombre está en \`titulo\`, NO en
\`descripcion\`, que viene vacía), **subproblematicas** (titulo),
**dependencias** (descripcion), **fuentes** (descripcion).

## Territorio (catálogo público del INE, compartido)

**municipios** (id, clave, nombre, estado_id)
**secciones** (id, clave, municipio_id, distrito_local_id, estado_id,
  lista_nominal, latitud, longitud)
**distritos** (id, clave, nombre, ambito 'local'|'federal', estado_id)
**resultados_historicos** — una fila por sección, elección y partido.
  (seccion_id, anio, eleccion, partido, votos)
  · Hoy solo hay anio = 2015, con eleccion 'gobernador' y 'diputado_mr'.
    Son 58,065 filas y solo de Nuevo León: los otros estados tienen
    cartografía pero todavía no resultados.
  · El INE reporta una fila por emblema marcado, así que el voto de una
    coalición viaja en claves propias: 'PRI_PVEM', 'PAN_PRD',
    'NVA_ALIANZA_...'. Para hablar de un partido hay que sumarlas al
    que encabeza. Ojo con el orden al agrupar: la clave de Nueva
    Alianza trae guion bajo propio, así que se prueba ANTES que las
    demás o se reparte mal.
  · Candidatos independientes: claves que empiezan con 'CAND_IND'.

**resultados_seccion_totales** — los totales de cada sección.
  (seccion_id, anio, eleccion, lista_nominal, votos_validos,
   votos_nulos, total_votos)
  · Para porcentajes usa \`votos_validos\`, NO \`total_votos\`: el total
    incluye los nulos, que fueron 2.15% en 2015.
  · La participación es \`total_votos / lista_nominal\`. Algunas
    secciones dan más de 100% porque las casillas especiales reciben
    votantes de fuera; conviene acotarlas al 100 para pintarlas.

**casillas** — (clave, tipo, seccion_id, domicilio, latitud, longitud).

## Actividades

**eventos** y **recorridos** — son dos tablas, no una. Mismo papel,
  distinta naturaleza. Columnas: titulo, descripcion, fecha_evento /
  fecha_recorrido, hora_inicia, hora_termina, colonia, municipio_id,
  seccion_id, usuario_responsable_id, asistentes_programados,
  asistentes_reales, activo.
  · Una pregunta sobre «actividades» casi siempre quiere las dos
    juntas, con \`union all\`.

## Equipo

**usuarios** (nombre, apellido_paterno, correo, perfil_clave, puesto,
  usuario_responsable_id ← de quién depende, activo)
**perfiles** (clave, nombre)
**operadores** (id, usuario_id) — el trabajo se asigna al operador, no
  al usuario: \`peticiones.operador_id → operadores.id → usuarios.id\`.

## Movilización

**movilizadores** (nombre, apellido_paterno, meta, municipio_id,
  responsable_id ← su jefe, ciudadano_id, activo)
**promovidos** (movilizador_id, ciudadano_id, estado
  'prospecto'|'contactado'|'comprometido'|'confirmado', activo)

## Padrones externos cruzados por CURP

**ext_telefonos**, **ext_vehiculos**, **ext_buro_credito**,
**ext_curp_zona** — todas con \`curp\` y \`fuente\`. Se cruzan con
\`ciudadanos.curp\`. **ext_salario_region** va agregada por distrito.

# Cómo responder

- Postgres. Una sola sentencia, solo lectura.
- \`numeric\` vuelve como texto: castea a \`::float8\` lo que vayas a
  comparar o a pintar.
- Agrupa fechas con \`at time zone\` de la zona del estado, que viene
  en el contexto: el servidor corre en UTC y una captura de las nueve
  de la noche cae en el día siguiente.
- Pocas filas. Si la respuesta es un número, devuelve un número; nadie
  quiere leer trescientos renglones.
`
