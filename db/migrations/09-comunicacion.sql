-- ============================================================
-- 09 · Comunicación con el ciudadano
-- ------------------------------------------------------------
-- El modelo sabía qué se pidió y qué se resolvió, pero no si
-- alguien se lo dijo a la persona. Una petición resuelta y nunca
-- avisada es, para el ciudadano, una petición ignorada: ese es el
-- hueco que cierran estas dos tablas.
--
-- `campanias_mensaje` es el envío masivo segmentado; se llama así
-- para no confundirla con `campanias`, que en el modelo original
-- es la campaña electoral (gobernatura, alcaldía, gestión).
--
-- `mensajes_enviados` guarda el renglón por persona. Sirve a los
-- dos casos: el destinatario de una campaña y el aviso individual
-- de una petición. De ahí que ambos vínculos sean opcionales y que
-- una restricción obligue a que venga al menos uno.
--
-- No hay proveedor de envío conectado. Las filas nacen
-- 'preparado'/'preparada' y solo pasan a 'enviado' cuando alguien
-- registra que de verdad contactó a la persona.
-- ============================================================

create table if not exists campanias_mensaje (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  canal text not null default 'whatsapp'
    check (canal in ('correo','sms','whatsapp')),
  asunto text,
  cuerpo text not null,
  -- Criterios con los que se armó la lista: colonia, municipio,
  -- seccion, problematica, estatus, sexo, edad_min, edad_max.
  -- En jsonb y no en columnas porque el conjunto de criterios va a
  -- crecer y no se consulta por ellos, se reproduce la selección.
  segmento jsonb not null default '{}'::jsonb,
  estado text not null default 'preparada'
    check (estado in ('preparada','enviada','cancelada')),
  destinatarios integer not null default 0,
  preparada_en timestamptz not null default now(),
  enviada_en timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

comment on table campanias_mensaje is
  'Envíos masivos segmentados. Sin proveedor conectado: quedan preparados.';

create table if not exists mensajes_enviados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_mensaje_id uuid references campanias_mensaje(id) on delete cascade,
  -- El aviso individual cuelga de la petición que se resolvió.
  peticion_id uuid references peticiones(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id) on delete cascade,
  canal text not null
    check (canal in ('correo','sms','whatsapp','llamada','presencial')),
  -- Copia del teléfono o correo al que se dirigió el mensaje: si el
  -- ciudadano cambia de número después, el registro sigue diciendo
  -- a dónde se mandó.
  destino text,
  asunto text,
  cuerpo text,
  estado text not null default 'preparado'
    check (estado in ('preparado','enviado','fallido','cancelado')),
  preparado_en timestamptz not null default now(),
  enviado_en timestamptz,
  error text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid,
  -- Todo mensaje es de una campaña o es el aviso de una petición.
  constraint mensajes_enviados_origen
    check (campania_mensaje_id is not null or peticion_id is not null)
);

comment on table mensajes_enviados is
  'Un renglón por persona contactada: destinatario de campaña o aviso de petición.';

create index if not exists campanias_mensaje_tenant_idx
  on campanias_mensaje (tenant_id, creado_en desc);
create index if not exists campanias_mensaje_estado_idx
  on campanias_mensaje (tenant_id, estado);

create index if not exists mensajes_enviados_tenant_idx
  on mensajes_enviados (tenant_id, creado_en desc);
create index if not exists mensajes_enviados_campania_idx
  on mensajes_enviados (tenant_id, campania_mensaje_id);
-- La consulta de avisos pendientes pregunta, por cada petición
-- resuelta, si ya existe un mensaje suyo. Este índice es el que
-- la sostiene.
create index if not exists mensajes_enviados_peticion_idx
  on mensajes_enviados (tenant_id, peticion_id, creado_en desc)
  where peticion_id is not null;
create index if not exists mensajes_enviados_ciudadano_idx
  on mensajes_enviados (tenant_id, ciudadano_id, creado_en desc);

-- --- Aislamiento -------------------------------------------------------
-- `enable` deja fuera al dueño de la tabla; `force` no. Las dos, o el
-- aislamiento no es tal.
alter table campanias_mensaje enable row level security;
alter table campanias_mensaje force row level security;
drop policy if exists tenant_aislamiento on campanias_mensaje;
create policy tenant_aislamiento on campanias_mensaje
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

alter table mensajes_enviados enable row level security;
alter table mensajes_enviados force row level security;
drop policy if exists tenant_aislamiento on mensajes_enviados;
create policy tenant_aislamiento on mensajes_enviados
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

drop trigger if exists campanias_mensaje_actualizado on campanias_mensaje;
create trigger campanias_mensaje_actualizado before update on campanias_mensaje
  for each row execute function marcar_actualizado();

drop trigger if exists mensajes_enviados_actualizado on mensajes_enviados;
create trigger mensajes_enviados_actualizado before update on mensajes_enviados
  for each row execute function marcar_actualizado();

grant select, insert, update, delete on campanias_mensaje to inpol_app;
grant select, insert, update, delete on mensajes_enviados to inpol_app;
