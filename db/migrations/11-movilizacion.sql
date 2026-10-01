-- ============================================================
-- 11 · Movilización: la red que lleva gente a votar
-- ------------------------------------------------------------
-- El modelo heredado (03) trae `movilizadores` como un padrón
-- paralelo: copia nombre, apellidos, sexo, fecha de nacimiento y
-- domicilio, y exige `usuario_id` contra `usuarios`. Es decir,
-- modelaba al movilizador como una cuenta del sistema con sus
-- datos personales repetidos.
--
-- En campaña no funciona así. El movilizador es una persona que
-- ya está en el padrón de `ciudadanos` —muchas veces alguien que
-- antes levantó una petición— a quien se le fija una meta de
-- personas que se compromete a llevar a votar. No tiene por qué
-- tener cuenta en el sistema.
--
-- Por eso la tabla se reutiliza pero se le cambia el eje: se le
-- cuelga `ciudadano_id`, `meta` y `responsable_id`, y se aflojan
-- los NOT NULL de `nombre` y `usuario_id`, que eran justamente
-- los que obligaban a duplicar el padrón. Está vacía en los dos
-- clientes, así que aflojarlos no rompe ninguna fila.
--
-- Lo que no existía se crea:
--   · promovidos               — el ciudadano que lleva cada
--                                movilizador y su prospección.
--   · prospectos_movilizador   — a quién se está invitando a ser
--                                movilizador.
--   · prospecto_seguimientos   — las llamadas de esa invitación.
--
-- `activistas`, `activista_campanias` y `enlaces` se dejan como
-- están: cuelgan de `usuarios` con NOT NULL y describen la
-- estructura formal de la campaña (quién es enlace con qué
-- dependencia), no la promoción del voto. Convertirlas habría
-- sido forzar una tabla a significar otra cosa.
-- ============================================================

-- --- 1 · El movilizador, anclado al padrón -----------------------------
alter table movilizadores
  add column if not exists ciudadano_id uuid references ciudadanos(id) on delete cascade;
alter table movilizadores
  add column if not exists meta integer not null default 0;
alter table movilizadores
  add column if not exists responsable_id uuid references usuarios(id) on delete set null;
alter table movilizadores
  add column if not exists notas text;

-- El nombre vive en `ciudadanos`; la cuenta de sistema es opcional.
alter table movilizadores alter column nombre drop not null;
alter table movilizadores alter column usuario_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movilizadores_meta_valida') then
    alter table movilizadores
      add constraint movilizadores_meta_valida check (meta >= 0 and meta <= 10000);
  end if;
end $$;

-- Una persona del padrón es movilizador una sola vez.
create unique index if not exists movilizadores_ciudadano_unico
  on movilizadores (tenant_id, ciudadano_id)
  where ciudadano_id is not null;
create index if not exists movilizadores_tenant_idx on movilizadores (tenant_id);
create index if not exists movilizadores_responsable_idx
  on movilizadores (tenant_id, responsable_id);

-- --- 2 · A quién lleva cada movilizador --------------------------------
-- El estado de prospección no va como columna de `ciudadanos`: el padrón
-- es el registro de personas y lo comparten peticiones, portal y mapa.
-- El compromiso de voto es del ciclo de campaña, tiene su propio
-- historial de fechas y su propia autoría. Mezclarlos obligaría a
-- limpiar el padrón cada elección.
create table if not exists promovidos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  movilizador_id uuid not null references movilizadores(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id) on delete cascade,
  estado text not null default 'prospecto'
    check (estado in ('prospecto','contactado','comprometido','confirmado')),
  -- Simpatizante y afinidad son dos cosas distintas: una persona puede
  -- declararse simpatizante y tener afinidad baja (acompaña pero no vota),
  -- y al revés.
  simpatizante boolean not null default false,
  afinidad text check (afinidad in ('alta','media','baja','nula')),
  fecha_contacto date,
  fecha_compromiso date,
  fecha_confirmacion date,
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- Un ciudadano responde a un solo movilizador: si dos lo registran, la
-- meta se cuenta dos veces y el avance de la campaña queda inflado.
create unique index if not exists promovidos_ciudadano_unico
  on promovidos (tenant_id, ciudadano_id);
create index if not exists promovidos_tenant_idx on promovidos (tenant_id);
create index if not exists promovidos_movilizador_idx
  on promovidos (tenant_id, movilizador_id, estado);
create index if not exists promovidos_estado_idx on promovidos (tenant_id, estado);

-- --- 3 · A quién se está invitando a ser movilizador -------------------
create table if not exists prospectos_movilizador (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id) on delete cascade,
  estado text not null default 'nuevo'
    check (estado in ('nuevo','contactado','interesado','rechazado','convertido')),
  meta_propuesta integer check (meta_propuesta is null or meta_propuesta >= 0),
  responsable_id uuid references usuarios(id) on delete set null,
  proximo_contacto date,
  -- Se llena al convertirlo: deja el rastro de de dónde salió cada
  -- movilizador sin perder el expediente de la invitación.
  movilizador_id uuid references movilizadores(id) on delete set null,
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

create unique index if not exists prospectos_ciudadano_unico
  on prospectos_movilizador (tenant_id, ciudadano_id);
create index if not exists prospectos_tenant_idx on prospectos_movilizador (tenant_id);
create index if not exists prospectos_estado_idx
  on prospectos_movilizador (tenant_id, estado, proximo_contacto);

-- --- 4 · El seguimiento de esa invitación ------------------------------
-- Mismo patrón que `peticion_seguimientos` (08): el avance es una
-- entidad con historial, no un campo de notas que se sobrescribe.
create table if not exists prospecto_seguimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  prospecto_id uuid not null references prospectos_movilizador(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  tipo text not null default 'llamada'
    check (tipo in ('llamada','nota','visita','mensaje','cambio_estatus')),
  detalle text not null,
  estado_anterior text,
  estado_nuevo text,
  recordar_el timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists prospecto_seguimientos_idx
  on prospecto_seguimientos (tenant_id, prospecto_id, creado_en desc);
create index if not exists prospecto_seguimientos_recordatorio_idx
  on prospecto_seguimientos (tenant_id, recordar_el)
  where recordar_el is not null;

-- --- 5 · Marca de tiempo de modificación -------------------------------
do $$
declare t text;
begin
  foreach t in array array['movilizadores','promovidos','prospectos_movilizador'] loop
    execute format(
      'drop trigger if exists %I_actualizado on %I;
       create trigger %I_actualizado before update on %I
       for each row execute function marcar_actualizado()', t, t, t, t);
  end loop;
end $$;

-- --- 6 · Row Level Security --------------------------------------------
-- `movilizadores` venía de 03 con la política a medias: `enable` sin
-- `force` y sin `with check`. Así, el rol dueño veía a todos los clientes
-- de un golpe y una inserción podía marcar un tenant ajeno. Se rehace
-- completa, igual que las tres tablas nuevas.
do $$
declare t text;
begin
  foreach t in array array[
    'movilizadores','promovidos','prospectos_movilizador','prospecto_seguimientos'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_aislamiento on %I', t);
    execute format(
      'create policy tenant_aislamiento on %I
         using (tenant_id = tenant_actual())
         with check (tenant_id = tenant_actual())', t);
  end loop;
end $$;

grant select, insert, update, delete
  on movilizadores, promovidos, prospectos_movilizador, prospecto_seguimientos
  to inpol_app;
