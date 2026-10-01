-- ============================================================
-- 05 · Normalización de la geografía electoral
-- ------------------------------------------------------------
-- El modelo de 2019 resolvía con tablas puente relaciones que
-- son uno a muchos: un municipio pertenece a un estado y una
-- casilla a una sección, no hay nada que cruzar. Se pasan a
-- llaves foráneas directas.
--
-- Además unifica distritos_federales y distritos_locales en una
-- sola tabla `distritos` con columna `ambito`. Eran idénticas
-- salvo el nombre.
-- ============================================================

-- --- Nombres de catálogo: `descripcion` -> `nombre` -------------------
do $$
declare t text;
begin
  foreach t in array array['estados','municipios','localidades','secciones',
                           'casillas','manzanas','asentamientos'] loop
    if exists (select 1 from information_schema.columns
               where table_name = t and column_name = 'descripcion')
       and not exists (select 1 from information_schema.columns
                       where table_name = t and column_name = 'nombre') then
      execute format('alter table %I rename column descripcion to nombre', t);
    end if;
  end loop;
end $$;

alter table estados   add column if not exists abreviatura text;
alter table municipios add column if not exists estado_id uuid references estados(id);
alter table secciones  add column if not exists municipio_id uuid references municipios(id);
alter table secciones  add column if not exists lista_nominal integer;
alter table casillas   add column if not exists seccion_id uuid references secciones(id);
alter table casillas   add column if not exists domicilio text;

-- --- Distritos unificados ---------------------------------------------
create table if not exists distritos (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid not null references estados(id),
  clave text not null,
  nombre text not null,
  ambito text not null check (ambito in ('federal','local')),
  cabecera text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (estado_id, ambito, clave)
);

comment on table distritos is
  'Distritos federales y locales. En Nuevo León: 12 federales y 26 locales. '
  'Atención: los archivos fuente del cliente invierten las etiquetas — lo que '
  'ahí se llama "distrito local" (12) es en realidad el esquema federal.';

-- Reapuntar hacia `distritos` toda llave foránea que fuera a las dos
-- tablas viejas, que están vacías.
do $$
declare r record;
begin
  for r in
    select con.conname, cl.relname as tabla, att.attname as columna
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and ref.relname in ('distritos_federales','distritos_locales')
  loop
    execute format('alter table %I drop constraint %I', r.tabla, r.conname);
    execute format('alter table %I add constraint %I foreign key (%I) references distritos(id)',
                   r.tabla, r.tabla || '_' || r.columna || '_fk', r.columna);
  end loop;
end $$;

drop table if exists distritos_federales cascade;
drop table if exists distritos_locales cascade;

-- --- Tablas puente que la relación directa vuelve innecesarias --------
-- `municipio_distritos` sí se conserva: un municipio puede quedar
-- repartido entre varios distritos, ahí la relación es de muchos a muchos.
drop table if exists estado_municipios cascade;
drop table if exists estado_localidades cascade;
drop table if exists municipio_secciones cascade;
drop table if exists seccion_casillas cascade;

-- --- Claves naturales únicas, necesarias para los seeds ---------------
create unique index if not exists estados_clave_uq      on estados (clave);
create unique index if not exists municipios_clave_uq   on municipios (estado_id, clave);
create unique index if not exists secciones_clave_uq    on secciones (estado_id, clave);
create unique index if not exists casillas_clave_uq     on casillas (seccion_id, clave);
create index        if not exists secciones_municipio_idx on secciones (municipio_id);

grant select, insert, update, delete on all tables in schema public to inpol_app;
