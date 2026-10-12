# Desplegar INPOL en Vercel

En local la base corre embebida dentro del proyecto. Vercel no puede hacer
eso: cada petición se atiende en una función que nace y muere, así que la
base tiene que vivir **fuera**, en internet.

Son cuatro pasos. El más largo es el primero y se hace una sola vez.

---

## 1 · Una base de datos en la nube

**Neon** es la opción natural: Vercel la integra, el plan gratuito alcanza de
sobra para una demostración y habla PostgreSQL puro, que es lo que el sistema
necesita.

1. Entra a `neon.tech` y crea un proyecto.
2. Copia la **cadena de conexión agrupada** (*pooled connection*). Se ve así:

   ```
   postgres://USUARIO:CLAVE@ep-algo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

> **Que sea la agrupada, no la directa.** En Vercel cada petición puede
> levantar su propia instancia; sin el agrupador, la base se queda sin
> conexiones disponibles en cuanto entran unas cuantas personas a la vez.

### Por qué hacen falta dos usuarios

El aislamiento entre clientes vive en la base, no en el código. PostgreSQL
**exime al dueño de las tablas de sus propias políticas**, así que si la
aplicación se conectara con el dueño, un cliente vería los datos de otro sin
que nada fallara a la vista.

Por eso hay dos:

| Variable | Rol | Para qué |
|---|---|---|
| `DATABASE_URL_ADMIN` | el dueño (el que da Neon) | migraciones y scripts |
| `DATABASE_URL` | `inpol_app` | la aplicación. No es dueño ni superusuario |

El segundo lo crea este script:

```bash
DATABASE_URL_ADMIN='<la cadena de Neon>' \
CLAVE_APP='<una contraseña larga y propia>' \
npx tsx db/preparar-nube.mts
```

Te imprime las dos variables ya armadas. **Comprueba que diga
`¿inpol_app es superusuario?: no`**; si dijera que sí, el aislamiento no
estaría aplicando y hay que detenerse ahí.

---

## 2 · Cargar el esquema y los datos

Con esas dos variables en el entorno, desde tu máquina:

```bash
export DATABASE_URL='postgres://inpol_app:...'
export DATABASE_URL_ADMIN='postgres://...'

npm run db:migrate       # esquema + geografía + resultados electorales
npm run db:seed          # los dos clientes con sus usuarios
npm run db:demo          # 1,400 peticiones por cliente
npm run db:secciones     # vincula ciudadanos y peticiones a secciones
npm run db:movilizacion  # la red de movilizadores
npm run db:diad          # la jornada del Día D
```

Tarda unos minutos: son 58,065 resultados electorales y 2,602 secciones.

Luego comprueba que el aislamiento quedó bien **en la base de verdad**:

```bash
npm run db:probar
```

Las ocho pruebas tienen que pasar. Si alguna falla, no sigas: significa que un
cliente podría ver datos de otro.

---

## 3 · Conectar el repositorio a Vercel

1. En Vercel: **Add New → Project** y elige `javiru12/INPOL-IA`.
2. Framework: **Next.js** (lo detecta solo).
3. No cambies los comandos de build.

### Variables de entorno

En **Settings → Environment Variables**, para *Production* y *Preview*:

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | la de `inpol_app`, agrupada |
| `DATABASE_URL_ADMIN` | la del dueño |
| `SESSION_SECRET` | una cadena larga y propia, mínimo 32 caracteres |

> `SESSION_SECRET` firma la cookie de sesión. **Si cambia, todas las sesiones
> abiertas se cierran.** Genera una con `openssl rand -base64 48` y no la
> reutilices de otro proyecto.

---

## 4 · Desplegar

**Deploy**. Al terminar queda una URL tipo `inpol-ia.vercel.app`.

Entra, elige la plaza y accede con `gerardo@monterrey.inpol.mx`.

---

## Antes de enseñárselo a alguien

- **Cambia las contraseñas.** Todos los usuarios de demostración traen
  `inpol2026`. En una dirección pública eso es una puerta abierta: cualquiera
  que vea el manual entra. Cámbialas desde Configuración → Usuarios.
- **Los datos de personas son inventados**, pero la cartografía y los
  resultados electorales son reales del INE. Conviene decirlo.
- El aviso de privacidad publicado **es un borrador**: tiene que revisarlo el
  área jurídica antes de que esto reciba un solo dato real.

---

## Cómo se resuelve el cliente en producción

El sistema identifica al cliente **por subdominio**: `monterrey.inpol.mx`,
`chihuahua.inpol.mx`. En una dirección de Vercel (`inpol-ia.vercel.app`) no
hay subdominio de cliente, así que cae al selector de plaza, que deja una
cookie equivalente. Funciona igual.

Cuando haya dominio propio, apunta un comodín (`*.inpol.mx`) a Vercel y cada
cliente entrará directo al suyo, sin pasar por el selector.

---

## Lo que no viaja al repositorio

Ni la base ni los archivos adjuntos: se reconstruyen con los comandos de
arriba. Lo que sí viaja es todo lo necesario para reconstruirlos, incluida la
cartografía del INE y los resultados electorales.

**Los adjuntos hoy se guardan en disco local** (`db/.archivos/`). En Vercel el
disco no persiste entre despliegues, así que la evidencia subida se perdería:
para producción de verdad hay que mandarlos a S3, que está en los pendientes.
Para una demostración no estorba.
