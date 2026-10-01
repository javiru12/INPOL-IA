@AGENTS.md

# INPOL — contexto del proyecto

Plataforma multitenant de gestión social e inteligencia política para México.
Cliente: **Gerardo** (INPOL). Desarrolla: **iTHINK**. El enfoque es
**electoral**, confirmado por el cliente.

Reconstruye un sistema que ya existe y opera (`inpol.com.mx:94`, antes
QuanticView). Los documentos originales del cliente están en
`~/Desktop/INPOL IA/` y el plan y los análisis en `../` (carpeta padre).

## Lo primero que debes saber

**El aislamiento entre clientes es el requisito central y es inviolable.**
Puede haber dos campañas rivales en la misma plataforma.

Toda tabla de datos lleva `tenant_id` y **Row Level Security con `force`**.
Toda lectura o escritura de datos de cliente pasa por `conTenant()` de
`src/lib/db.ts`. Sin excepción:

```ts
await conTenant(tenant.id, async (tx) => {
  return tx`select * from peticiones`   // solo las de ese cliente
})
```

Tres cosas lo sostienen, y romper cualquiera lo tira entero:

1. **`force row level security`** en toda tabla con `tenant_id`. Sin `force`,
   PostgreSQL exime al dueño de la tabla de sus propias políticas.
2. **La app conecta con el rol `inpol_app`**, que no es dueño ni superusuario.
3. **Sin tenant fijado no se ve nada**: la política falla cerrada.

`npm run db:probar` lo comprueba con 8 pruebas. **Córrelo después de cualquier
migración.**

> ⚠️ **Los scripts administrativos usan `DATABASE_URL_ADMIN`, cuyo rol es
> superusuario y EVADE RLS aunque esté en `force`.** Ahí todo filtro por
> `tenant_id` va explícito en el `WHERE`. Esto ya mordió una vez: un script
> asignó secciones de Monterrey a ciudadanos de Chihuahua.

## Trampas que ya costaron tiempo

1. **Postgres devuelve `numeric` como texto.** Un `round()` o un
   `percentile_cont()` llega como string y rompe comparaciones y escalas de
   color **en silencio**. Castea a `::float8` en la consulta.
2. **Las fechas `date` se desplazan un día.** `new Date('1971-12-30')` se
   parsea como UTC y en horario de México retrocede. Usa `src/lib/formato.ts`,
   que ya lo resuelve. Nunca `to_char` con `TM`: depende del `lc_time` del
   servidor y aquí viene en inglés.
3. **Un parámetro de texto a `::timestamptz` se interpreta como UTC.** Castea
   a `::date` primero.
4. **`fecha_cierre` no significa «resuelta»**: las canceladas también cierran.
   Para medir tiempos de atención, filtra por `estatus = 'Completada'`.
5. **d3-geo usa el orden de anillos contrario al de GeoJSON.** Los archivos de
   `public/geo/` cumplen la norma; `src/lib/geo.ts` los rebobina al vuelo. Sin
   eso el mapa se pinta como una mancha que cubre el globo.
6. **En un archivo `'use server'` solo se pueden exportar funciones async.**
   Una constante ahí rompe la compilación del módulo entero.
7. **En las pruebas con Puppeteer, el primer `button[type=submit]` de la
   página es el de cerrar sesión del encabezado.** Apunta al botón del
   formulario correcto.
8. **Next 16 renombró `middleware` a `proxy`** (`src/proxy.ts`).

## Convenciones

- **Todo en español**: nombres de tabla, columnas, variables, funciones,
  comentarios y texto de interfaz. snake_case en la base, camelCase en TS.
- **Nunca colores literales ni clases de color de Tailwind** (`text-gray-500`,
  `bg-blue-50`). Solo los tokens de `src/app/globals.css`: clases `panel`,
  `campo`, `boton`, `tabla`, `rotulo`, `clave`, y variables `--color-*`.
- **Cliente de base de datos**: paquete `postgres` con tagged templates. No
  `pg`, no ORM.
- Los filtros de pantalla viven **en la URL**, no en estado de React.
- Toda acción que toca datos personales deja rastro en `bitacora`.
- Comentarios solo donde explican **por qué**, no qué hace el código.

## Permisos: dos capas, las dos hacen falta

1. **`src/proxy.ts`** corta el paso antes de renderizar, leyendo las rutas
   permitidas de la cookie. Filtro rápido, no autorización definitiva.
2. **`exigirAcceso()` de `src/lib/acceso.ts`** es la que manda. **Toda
   pantalla de módulo la llama como primera línea del componente.**

Ocultar una entrada del menú no protege nada: cualquiera escribe la URL.
`npm run probar:permisos` comprueba las dos capas.

## Comandos

```bash
npm run db:up         # PostgreSQL embebido, puerto 5434 (sin Docker)
npm run db:migrate    # esquema + geografía + resultados electorales
npm run db:seed       # dos clientes con 12 usuarios cada uno
npm run db:demo       # 1,400 peticiones por cliente en 18 meses
npm run db:secciones  # vincula ciudadanos y peticiones a secciones
npm run db:estado     # radiografía de la base
npm run dev           # http://localhost:3200

npm run db:probar            # aislamiento entre clientes (8)
npm run probar:flujo         # captura → seguimiento → cierre (navegador real)
npm run probar:permisos      # que cada perfil vea y alcance solo lo suyo
npm run probar:portal        # canal ciudadano, y lo que no debe filtrar
npm run probar:evidencia     # adjuntos y su control de acceso
npm run probar:comunicacion  # avisos y campañas
```

**Revisa tu trabajo con los ojos**: `npx tsx --env-file=.env.local
herramientas/capturas.mts /la-ruta` genera una captura en
`herramientas/capturas/`. Ábrela y míralas antes de dar algo por terminado.
Requiere Google Chrome instalado.

Entrar: elige plaza y usa `gerardo@monterrey.inpol.mx` / `inpol2026`. Los
mismos nombres existen con `@chihuahua.inpol.mx` para probar el aislamiento.

## Datos reales cargados

- Geografía electoral de Nuevo León: 51 municipios, 38 distritos, 2,602
  secciones, 6,541 casillas. Cartografía del INE en `public/geo/`.
- **58,065 resultados electorales de 2015** por sección (gobernador y
  diputado MR). Es la base para calcular afinidad y priorizar territorio.

> ⚠️ **`public/geo/mexico-distritos-federales.json` NO se debe usar todavía**:
> trae la distritación de 2023 (NL = 14 distritos) y la base tiene la de 2017
> (12). Las claves coinciden pero los polígonos son de distritos distintos.
> Pendiente de decidir con el cliente.

## Estado

Construido: núcleo multitenant, peticiones, ciudadanos, actividades,
estadísticas, territorio, mapas, estructura, comunicación, configuración,
sala de mando, informe en PDF, portal ciudadano, evidencia adjunta, buscador
global.

En curso o pendiente: Día D, movilización electoral, captura en campo con
audio y foto, beneficiarios y programas sociales, envío real de mensajes.

El análisis de qué falta contra el catálogo del cliente está en
`../QUE-FALTA.md`. El estado para el cliente, en `../ESTADO-PARA-GERARDO.md`.

## Reglas de trabajo

- **No hacer commits, push ni deploys sin que Javier lo pida explícitamente.**
- No sobre-ingenierizar: la solución mínima que resuelve el problema.
- No agregar comentarios ni docstrings en código que no se modificó.
- Antes de dar algo por terminado: `npx tsc --noEmit` limpio, la captura
  revisada a ojo, y las suites de prueba en verde.
