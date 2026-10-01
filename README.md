# INPOL

Plataforma multitenant de gestión social e inteligencia política.
Cada cliente —Monterrey, Chihuahua, etc.— entra por su propio acceso y ve
únicamente su información.

## Arrancar en otra máquina

Lo único que necesitas es Node 22 o superior. **No hace falta Docker ni
instalar PostgreSQL**: la base corre embebida dentro del propio proyecto.

```bash
git clone <url-del-repo> && cd inpol
cp .env.example .env.local
npm install
npm run db:up        # descarga PostgreSQL la primera vez (tarda)
npm run db:migrate   # esquema + geografía electoral + resultados 2015
npm run db:seed      # los dos clientes con sus usuarios
npm run db:demo      # 1,400 peticiones por cliente en 18 meses
npm run db:secciones # vincula ciudadanos y peticiones a secciones
npm run dev          # http://localhost:3200
```

La base de datos y los archivos adjuntos **no viajan en el repositorio**:
se reconstruyen con esos comandos. Lo que sí viaja es todo lo necesario
para reconstruirlos, incluida la cartografía del INE y los resultados
electorales.

Si algo sale mal, `npm run db:reset` borra el cluster y empieza de cero.

## Arrancar en local

```bash
npm install
npm run db:up        # levanta PostgreSQL en el puerto 5434
npm run db:migrate   # crea el esquema y carga la geografía electoral
npm run db:seed      # dos clientes con sus usuarios
npm run db:demo      # peticiones, ciudadanos y actividades de ejemplo
npm run db:secciones # vincula los ciudadanos a secciones electorales reales
npm run dev          # http://localhost:3200
```

Entra en `http://localhost:3200`, elige una plaza y accede con cualquiera de
los usuarios de demostración:

| Correo | Perfil |
|---|---|
| `gerardo@monterrey.inpol.mx` | Súper Administrador |
| `patricia@monterrey.inpol.mx` | Administrador |
| `luis@monterrey.inpol.mx` | Gestor Social |
| `marleny@monterrey.inpol.mx` | Asignador |
| `sebastian@monterrey.inpol.mx` | Operador de Gestión |

Contraseña de todos: `inpol2026`. Los mismos nombres existen con
`@chihuahua.inpol.mx` para probar el aislamiento entre clientes.

## El aislamiento entre clientes

Es el requisito central del sistema y está resuelto en la base de datos, no
en el código de la aplicación.

Cada tabla de negocio lleva `tenant_id` y una política de **Row Level
Security**. En cada petición HTTP se fija el tenant de la sesión y PostgreSQL
filtra todo lo que se consulte:

```ts
await conTenant(tenant.id, async (tx) => {
  return tx`select * from peticiones`   // solo las de ese cliente
})
```

Tres decisiones sostienen esto:

1. **`force row level security`** en todas las tablas con `tenant_id`.
   Sin `force`, PostgreSQL exime al dueño de la tabla de sus propias políticas.
2. **La aplicación conecta con el rol `inpol_app`**, que no es dueño ni
   superusuario. Si conectara con el dueño, las políticas no se le aplicarían.
3. **Sin tenant fijado no se ve nada.** La política falla cerrada: si alguien
   olvida llamar a `conTenant`, la consulta devuelve cero filas en lugar de
   devolver las de todos.

```bash
npm run db:probar            # aislamiento entre clientes (8 comprobaciones)
npm run probar:flujo         # captura → seguimiento → cierre, con navegador real
npm run probar:permisos      # que cada perfil vea y alcance solo lo suyo
npm run probar:portal        # el canal ciudadano, y lo que no debe filtrar
npm run probar:comunicacion  # avisos y campañas
```

> **Cuidado con los scripts administrativos.** Los que usan
> `DATABASE_URL_ADMIN` corren como superusuario y **evaden RLS**. Ahí todo
> filtro por `tenant_id` tiene que ir explícito en el `WHERE`.

## El canal del ciudadano

Hasta la migración 10, toda petición entraba capturada por alguien del
gobierno. Ahora hay dos rutas públicas, sin sesión:

- **`/reportar`** — la persona levanta su propia petición y recibe un folio
  (`MON-7XKAMX`): corto, dictable por teléfono y **no adivinable**. Si
  fuera consecutivo, cualquiera podría recorrer los folios ajenos.
- **`/seguimiento`** — consulta en qué va, con **folio más los últimos
  cuatro dígitos de su teléfono**. Solo con el folio bastaría para leer el
  nombre y el domicilio de otra persona.

Un folio inexistente y un teléfono equivocado devuelven **el mismo
mensaje**: distinguirlos permitiría averiguar qué folios son reales.

El formulario está abierto a internet, así que lleva un límite por
teléfono y por dirección (tabla `intentos_publicos`). No sustituye a una
protección delante de la aplicación, pero evita que se llene de basura.

Quien reporta acepta el aviso de privacidad, y se guarda **cuándo** lo
aceptó y **qué versión** (`src/lib/aviso-privacidad.ts`). Al cambiar el
texto hay que subir la versión. El aviso de `/aviso-de-privacidad` es un
borrador: tiene que revisarlo el área jurídica del cliente antes de salir
a producción.

## Permisos

Dos capas, y las dos hacen falta:

1. **`src/proxy.ts`** corta el paso antes de renderizar, leyendo las rutas
   permitidas de la cookie de sesión. Es un filtro rápido, no la
   autorización definitiva (la documentación de Next desaconseja apoyarla
   solo aquí).
2. **`exigirAcceso()` de `src/lib/acceso.ts`** es la que manda: consulta
   los permisos reales del perfil contra el catálogo. **Toda pantalla de
   módulo debe llamarla como primera línea del componente.**

Ocultar una entrada del menú no protege nada: cualquiera puede escribir la
dirección. `npm run probar:permisos` comprueba las dos capas.

### Cómo se resuelve el cliente de cada petición

Por subdominio: `monterrey.inpol.mx`, `chihuahua.inpol.mx`. En local, donde
no hay subdominios, el selector de `/plaza` deja una cookie equivalente.

## Estructura

```
db/
  migrations/     esquema, en orden; cada archivo corre una sola vez
  pruebas/        aislamiento entre clientes
  generated/      SQL derivado de los Excel del cliente (no se edita a mano)
  seed.mts        clientes y usuarios
  seed-demo.mts   datos de ejemplo
src/
  app/
    entrar/       acceso
    plaza/        selector de cliente (solo local)
    (sistema)/    todo lo que requiere sesión
  components/     piezas compartidas de interfaz
  lib/
    db.ts         conexión y conTenant
    sesion.ts     cookie de sesión y resolución de tenant
    permisos.ts   qué puede ver cada perfil
    paleta.ts     colores de gráficas, validados para daltonismo
    formato.ts    fechas y cifras en español
herramientas/
  capturas.mts    capturas de pantalla para revisión visual
  pruebas/        aislamiento, flujo operativo, permisos y formato
```

## Datos cargados

- **Geografía electoral de Nuevo León**: 51 municipios, 38 distritos
  (12 federales, 26 locales), 2,602 secciones y 6,541 casillas.
- **Resultados electorales 2015** del INE por sección: 58,065 registros de
  votos por partido en las elecciones de gobernador y diputado de mayoría
  relativa. Es la base para calcular afinidad y priorizar secciones.

> En los archivos del cliente, los distritos vienen mal etiquetados: lo que
> ahí se llama «distrito local» (12) corresponde en realidad al esquema
> federal, y los 26 de los archivos del INE son los locales. El esquema de
> este proyecto usa la nomenclatura correcta.

## Cartografía

En `public/geo/` están las capas del **Marco Geográfico Seccional del INE**
(corte de enero de 2025), reproyectadas a WGS84 y simplificadas para que el
navegador las cargue rápido. Cada rasgo trae solo `clave` y `nombre`, y las
claves empatan una a una con las tablas `municipios` y `distritos`.

| Capa | Rasgos | Estado |
|---|---|---|
| `mexico-estados.json` | 32 | lista |
| `nl-municipios.json` | 51 | lista, 51 de 51 hacen match |
| `nl-distritos-locales.json` | 26 | lista, 26 de 26 hacen match |
| `mexico-distritos-federales.json` | 300 | **no usar todavía** |

> **Los distritos federales no están conciliados.** El archivo trae la
> distritación **vigente de 2023**, donde Nuevo León tiene 14 distritos;
> la tabla `distritos` guarda la de **2017**, con 12. Las claves `19-01` a
> `19-12` coinciden, pero **los polígonos son de distritos distintos**:
> usarlos hoy pintaría cada zona con los datos de otra. Antes de ocuparlos
> hay que decidir con qué distritación trabaja el sistema y cargar la que
> corresponda en ambos lados. Ninguna pantalla los carga por ahora.

### Por qué se reordenan los polígonos al dibujarlos

Los archivos cumplen GeoJSON RFC 7946, que pide los anillos exteriores en
sentido antihorario. `d3-geo` usa la convención contraria sobre la esfera:
con los archivos tal cual, interpreta cada polígono como «todo el globo
menos esta forma» y el mapa sale como una mancha. `src/lib/geo.ts` invierte
los anillos al vuelo, de modo que los archivos siguen siendo válidos para
cualquier otro visor.

## Perfiles y permisos

El catálogo tiene **293 funcionalidades** repartidas en **11 perfiles**,
extraídas de la matriz de autorización del cliente. Es global: los perfiles
son los mismos para todos los clientes; lo que cambia es quién los ocupa.

La navegación se construye según los permisos de quien entra: cada quien ve
solo los módulos que le tocan.

## Pendientes

- Cartografía de estados distintos de Nuevo León.
- Conciliar la distritación federal (2017 contra 2023, ver arriba).
- PostGIS para los polígonos de secciones y distritos (las columnas de
  latitud y longitud ya están previstas).
- Adjuntos de audio, foto y video en S3.
- Módulo de Día D.
- App móvil F2F.
- Conectar un proveedor real de correo, SMS y WhatsApp: hoy las campañas
  quedan en estado «preparada» y los avisos se registran a mano.
- WhatsApp como canal de entrada, además del portal web.
- Revisión jurídica del aviso de privacidad.
