-- ============================================================
-- 22 · Fuentes externas cruzadas por CURP
-- ------------------------------------------------------------
-- Padrones que no produce el sistema y que se cruzan con la
-- ficha del ciudadano por su CURP: teléfonos, vehículos,
-- historial crediticio, zona electoral y salario por región.
--
-- Tres decisiones que no son de detalle:
--
-- 1. Llevan `tenant_id` y Row Level Security con `force`, como
--    todo lo demás. Son datos personales de terceros: si
--    vivieran como catálogo compartido, un cliente vería el
--    padrón que cargó otro. Puede haber dos campañas rivales
--    en la misma plataforma.
--
-- 2. Cada tabla guarda de dónde salió y cuándo (`fuente`,
--    `cargado_en`). Un dato personal sin procedencia no se
--    puede defender ante quien pregunte de dónde salió, y la
--    pregunta llega.
--
-- 3. `ext_salario_region` NO lleva CURP. El SUA se pidió como
--    sueldo promedio por región electoral, y agregado es otra
--    cosa que nominal: un promedio por distrito no identifica
--    a nadie. Se queda agregado a propósito.
--
-- Lo que entre aquí tiene que tener base legal propia. El
-- historial crediticio la pide expresamente (Ley para Regular
-- las Sociedades de Información Crediticia, art. 28), y los
-- padrones de programas sociales tienen prohibido el uso
-- electoral. El esquema no sustituye ese permiso.
-- ============================================================

create table if not exists ext_telefonos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  curp text not null,
  telefono text not null,
  tipo text,
  fuente text not null,
  cargado_en timestamptz not null default now()
);

create table if not exists ext_vehiculos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  curp text not null,
  placa text,
  licencia text,
  tipo_vehiculo text,
  modelo int,
  fuente text not null,
  cargado_en timestamptz not null default now()
);

create table if not exists ext_buro_credito (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  curp text not null,
  -- Solo el nivel, no el historial: para segmentar basta el
  -- tramo y guardar el detalle multiplica el daño si se filtra.
  nivel text,
  score int,
  fuente text not null,
  cargado_en timestamptz not null default now()
);

create table if not exists ext_curp_zona (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  curp text not null,
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  seccion_id uuid references secciones(id),
  fuente text not null,
  cargado_en timestamptz not null default now()
);

create table if not exists ext_salario_region (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  estado_id uuid not null references estados(id),
  distrito_id uuid references distritos(id),
  municipio_id uuid references municipios(id),
  salario_promedio numeric(10,2),
  trabajadores int,
  fuente text not null,
  cargado_en timestamptz not null default now()
);

-- La CURP es la llave de cruce: sin índice, cada ficha de
-- ciudadano abierta recorrería el padrón entero.
create unique index if not exists ext_telefonos_curp_idx
  on ext_telefonos (tenant_id, curp, telefono);
create unique index if not exists ext_vehiculos_curp_idx
  on ext_vehiculos (tenant_id, curp, coalesce(placa, ''), coalesce(licencia, ''));
create unique index if not exists ext_buro_curp_idx
  on ext_buro_credito (tenant_id, curp);
create unique index if not exists ext_curp_zona_idx
  on ext_curp_zona (tenant_id, curp);
create unique index if not exists ext_salario_region_idx
  on ext_salario_region (tenant_id, estado_id, coalesce(distrito_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(municipio_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- La ficha del ciudadano gana su CURP para poder cruzarse.
alter table ciudadanos add column if not exists curp text;
create index if not exists ciudadanos_curp_idx on ciudadanos (tenant_id, curp);

-- Y una marca de revisión: cuando la credencial dice una zona y
-- el padrón dice otra, alguien tiene que mirarlo.
alter table ciudadanos add column if not exists zona_discrepante boolean not null default false;

-- Discapacidad y adulto mayor, que se piden para priorizar.
alter table ciudadanos add column if not exists discapacidad boolean not null default false;
alter table ciudadanos add column if not exists tipo_discapacidad text;
alter table ciudadanos add column if not exists adulto_mayor boolean not null default false;

-- Validación del teléfono por SMS.
alter table ciudadanos add column if not exists telefono_verificado_en timestamptz;

do $$
declare t text;
begin
  foreach t in array array['ext_telefonos', 'ext_vehiculos', 'ext_buro_credito',
                           'ext_curp_zona', 'ext_salario_region'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_aislamiento on %I', t);
    execute format(
      'create policy tenant_aislamiento on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
         with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
    execute format('grant select, insert, update, delete on %I to inpol_app', t);
  end loop;
end $$;
