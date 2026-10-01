-- ============================================================
-- 14 · Mensajes internos del equipo
-- ------------------------------------------------------------
-- La comunicación con el ciudadano ya tiene su lugar (09). Lo que
-- faltaba es la de adentro: el Gestor Social que necesita
-- preguntarle algo al Operador de Gestión sobre una petición
-- concreta, o el Asignador que avisa que una audio-nota no se
-- entiende. Hoy eso ocurre por WhatsApp y se pierde: ni queda
-- junto al expediente ni lo ve quien toma la petición después.
--
-- Dos tablas: el hilo (de qué se habla y con quién) y cada
-- mensaje dentro de él. El hilo cuelga de una petición casi
-- siempre; se permite el mensaje suelto porque hay recados que
-- no son de ningún expediente, pero el caso principal es el otro.
--
-- La conversación es entre dos personas, no un grupo. Es a
-- propósito: un hilo con destinatario único es un hilo con
-- responsable único, y lo que se quiere es que alguien conteste.
--
-- Un mensaje no se borra. Es comunicación de trabajo sobre
-- expedientes ciudadanos: se archiva y deja de estorbar en la
-- bandeja, pero sigue ahí para quien revise el caso después.
-- ============================================================

create table if not exists mensaje_hilos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  -- De qué petición se habla. Nulo = recado suelto.
  peticion_id uuid references peticiones(id) on delete cascade,
  asunto text not null,
  iniciador_id uuid not null references usuarios(id) on delete cascade,
  receptor_id uuid not null references usuarios(id) on delete cascade,
  -- Fecha del último mensaje: la bandeja ordena por esto y sin la
  -- columna habría que agregar sobre `mensajes` en cada listado.
  ultimo_en timestamptz not null default now(),
  archivado_en timestamptz,
  archivado_por uuid references usuarios(id) on delete set null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid,
  constraint mensaje_hilos_dos_personas check (iniciador_id <> receptor_id)
);

comment on table mensaje_hilos is
  'Conversación interna entre dos personas del mismo cliente, casi siempre sobre una petición.';
comment on column mensaje_hilos.archivado_en is
  'Un hilo no se borra: se archiva. Sale de la bandeja, no del expediente.';

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hilo_id uuid not null references mensaje_hilos(id) on delete cascade,
  autor_id uuid not null references usuarios(id) on delete cascade,
  -- Se guarda en cada mensaje, no solo en el hilo: dentro de una
  -- conversación los papeles se alternan, y el contador de no
  -- leídos pregunta por el destinatario de cada renglón.
  destinatario_id uuid not null references usuarios(id) on delete cascade,
  cuerpo text not null,
  leido_en timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid,
  constraint mensajes_dos_personas check (autor_id <> destinatario_id)
);

comment on table mensajes is
  'Cada intervención dentro de un hilo. `leido_en` nulo = pendiente para el destinatario.';

create index if not exists mensaje_hilos_tenant_idx
  on mensaje_hilos (tenant_id, ultimo_en desc);
create index if not exists mensaje_hilos_iniciador_idx
  on mensaje_hilos (tenant_id, iniciador_id, ultimo_en desc);
create index if not exists mensaje_hilos_receptor_idx
  on mensaje_hilos (tenant_id, receptor_id, ultimo_en desc);
-- Los mensajes de una petición, que se enseñan en su detalle.
create index if not exists mensaje_hilos_peticion_idx
  on mensaje_hilos (tenant_id, peticion_id, ultimo_en desc)
  where peticion_id is not null;

create index if not exists mensajes_hilo_idx
  on mensajes (tenant_id, hilo_id, creado_en);
-- El contador de la campana corre en cada carga de página de cada
-- usuario: es la consulta más frecuente del módulo y este índice
-- parcial es el que la deja en nada.
create index if not exists mensajes_sin_leer_idx
  on mensajes (tenant_id, destinatario_id)
  where leido_en is null and activo;

-- --- Aislamiento -------------------------------------------------------
-- `enable` deja fuera al dueño de la tabla; `force` no. Las dos, o el
-- aislamiento no es tal.
alter table mensaje_hilos enable row level security;
alter table mensaje_hilos force row level security;
drop policy if exists tenant_aislamiento on mensaje_hilos;
create policy tenant_aislamiento on mensaje_hilos
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

alter table mensajes enable row level security;
alter table mensajes force row level security;
drop policy if exists tenant_aislamiento on mensajes;
create policy tenant_aislamiento on mensajes
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

drop trigger if exists mensaje_hilos_actualizado on mensaje_hilos;
create trigger mensaje_hilos_actualizado before update on mensaje_hilos
  for each row execute function marcar_actualizado();

drop trigger if exists mensajes_actualizado on mensajes;
create trigger mensajes_actualizado before update on mensajes
  for each row execute function marcar_actualizado();

grant select, insert, update, delete on mensaje_hilos to inpol_app;
grant select, insert, update, delete on mensajes to inpol_app;
