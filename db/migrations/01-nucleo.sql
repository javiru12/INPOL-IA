-- ============================================================
-- 01 · Núcleo: perfiles, usuarios, campañas y candidatos
-- ============================================================

-- --- Perfiles (catálogo global) ---------------------------------------
-- Los 11 perfiles son los mismos para todos los clientes; lo que cambia
-- entre clientes es qué personas ocupan cada uno.
create table if not exists perfiles (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  descripcion text,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- --- Usuarios ----------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  perfil_clave text not null references perfiles(clave),
  nombre text not null,
  apellido_paterno text,
  apellido_materno text,
  correo text not null,
  contrasena_hash text not null,
  telefono_movil text,
  puesto text,
  foto_url text,
  ultimo_acceso timestamptz,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid,
  unique (tenant_id, correo)
);

comment on column usuarios.correo is
  'Único por tenant: una misma persona puede operar en dos plazas distintas.';

create index if not exists usuarios_tenant_idx on usuarios (tenant_id);
create index if not exists usuarios_perfil_idx on usuarios (tenant_id, perfil_clave);

-- --- Campañas ----------------------------------------------------------
create table if not exists campanias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  descripcion text,
  tipo text,                        -- gobernatura, alcaldía, diputación, gestión
  fecha_inicia date,
  fecha_termina date,
  fecha_jornada date,               -- el Día D
  responsable_id uuid references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

comment on column campanias.fecha_jornada is
  'Fecha de la elección. Manda sobre todo el calendario operativo.';

create index if not exists campanias_tenant_idx on campanias (tenant_id);

-- --- Candidatos --------------------------------------------------------
create table if not exists candidatos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid references campanias(id) on delete set null,
  nombre text not null,
  cargo text,
  partido text,
  foto_url text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

create index if not exists candidatos_tenant_idx on candidatos (tenant_id);

-- --- Campaña activa por usuario ---------------------------------------
create table if not exists usuario_campanias (
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  campania_id uuid not null references campanias(id) on delete cascade,
  primary key (usuario_id, campania_id)
);

-- --- Bitácora de auditoría --------------------------------------------
-- Con datos personales de ciudadanos, saber quién consultó qué no es
-- opcional: es defensa legal y control interno.
create table if not exists bitacora (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  accion text not null,             -- 'consulta', 'alta', 'cambio', 'baja', 'exportacion'
  entidad text not null,            -- 'ciudadanos', 'peticiones', ...
  entidad_id uuid,
  detalle jsonb,
  ip text,
  creado_en timestamptz not null default now()
);

create index if not exists bitacora_tenant_fecha_idx on bitacora (tenant_id, creado_en desc);
create index if not exists bitacora_entidad_idx on bitacora (tenant_id, entidad, entidad_id);

-- --- Triggers de actualización ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['usuarios','campanias','candidatos'] loop
    execute format(
      'drop trigger if exists %I_actualizado on %I;
       create trigger %I_actualizado before update on %I
       for each row execute function marcar_actualizado()', t, t, t, t);
  end loop;
end $$;

-- --- Row Level Security ------------------------------------------------
-- `force` incluye también al dueño de la tabla. Sin esto, cualquier
-- consulta hecha con el rol dueño vería todos los clientes a la vez.
do $$
declare t text;
begin
  foreach t in array array['usuarios','campanias','candidatos','usuario_campanias','bitacora'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_aislamiento on %I', t);
    execute format(
      'create policy tenant_aislamiento on %I
         using (tenant_id = tenant_actual())
         with check (tenant_id = tenant_actual())', t);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to inpol_app;
grant usage, select on all sequences in schema public to inpol_app;
