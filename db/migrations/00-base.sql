-- ============================================================
-- 00 · Cimientos: extensiones, roles, tenants y utilidades
-- ============================================================

create extension if not exists pgcrypto;

-- --- Rol de aplicación -------------------------------------------------
-- La app NO conecta con el dueño de las tablas. PostgreSQL exime al dueño
-- de sus propias políticas de RLS, así que conectarse con él anularía
-- el aislamiento entre clientes sin que nada falle visiblemente.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'inpol_app') then
    create role inpol_app login password 'inpol_local';
  end if;
end $$;

grant usage on schema public to inpol_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to inpol_app;
alter default privileges in schema public
  grant usage, select on sequences to inpol_app;

-- --- Tenants -----------------------------------------------------------
-- Un tenant es un cliente contratante: Chihuahua, Monterrey, etc.
-- Vive fuera del aislamiento (es la tabla que lo define).
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,          -- 'monterrey' · también es el subdominio
  nombre text not null,                -- 'Municipio de Monterrey'
  nombre_corto text,                   -- 'Monterrey'
  logo_url text,
  color_acento text default '#714a85',
  licencia_inicia date,
  licencia_vence date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz
);

comment on table tenants is
  'Clientes de la plataforma. Cada uno ve únicamente su información.';

-- --- Tenant de la sesión en curso --------------------------------------
-- Devuelve null si no se fijó, lo que hace que toda política de RLS
-- falle cerrada: sin tenant, no hay filas.
create or replace function tenant_actual() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- --- Marca de tiempo de modificación -----------------------------------
create or replace function marcar_actualizado() returns trigger
language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

-- --- Registro de migraciones aplicadas ---------------------------------
create table if not exists migraciones (
  nombre text primary key,
  aplicada_en timestamptz not null default now()
);
