-- ============================================================
-- 04 · Ajustes sobre el modelo importado
-- ============================================================

-- --- Forzar RLS también para el dueño de las tablas -------------------
-- `enable` exime al dueño; `force` no. Sin esto, una conexión hecha con
-- el rol dueño vería todos los clientes mezclados.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0
  loop
    execute format('alter table %I force row level security', t.relname);
  end loop;
end $$;

-- --- Toda tabla con tenant_id debe tener política ----------------------
-- Red de seguridad: si alguna tabla del modelo importado quedó sin
-- política, se la ponemos. Una tabla con RLS activo y sin política no
-- devuelve nada, pero es mejor que sea explícito.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format(
      'create policy tenant_aislamiento on %I
         using (tenant_id = tenant_actual())
         with check (tenant_id = tenant_actual())', t.relname);
  end loop;
end $$;

-- --- Datos personales del usuario que el modelo original sí tenía -----
alter table usuarios
  add column if not exists sexo text,
  add column if not exists fecha_nacimiento date,
  add column if not exists telefono_fijo text,
  add column if not exists direccion text,
  add column if not exists colonia text,
  add column if not exists codigo_postal text,
  add column if not exists municipio_id uuid references municipios(id),
  add column if not exists seccion_id uuid references secciones(id);

-- --- Campaña: vínculo con el ámbito territorial -----------------------
alter table campanias
  add column if not exists estado_id uuid references estados(id),
  add column if not exists municipio_id uuid references municipios(id);

-- --- Permisos para el rol de la aplicación ----------------------------
grant select, insert, update, delete on all tables in schema public to inpol_app;
grant usage, select on all sequences in schema public to inpol_app;
