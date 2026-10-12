-- ============================================================
-- 17 · Día D · la jornada electoral
-- ------------------------------------------------------------
-- El Día D de INPOL no cuenta la elección: **cuenta la
-- movilización propia**. El dato oficial lo publica el INE horas
-- o días después y no sirve para operar; lo que una campaña
-- necesita saber a las 11 de la mañana es cuánta de SU gente
-- comprometida ya fue a votar y dónde se está quedando corta.
--
-- De ahí el modelo: la unidad no es el voto, es el **promovido
-- que ya acudió**, marcado por quien está parado en la casilla.
--
-- Esto también le da por fin uso a las 6,541 casillas que llevan
-- cargadas desde el principio sin que ninguna consulta las
-- tocara.
-- ============================================================

create table if not exists jornadas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  nombre text not null,
  fecha date not null,
  hora_apertura time not null default '08:00',
  hora_cierre time not null default '18:00',

  -- Solo una jornada activa a la vez: el tablero del día no puede
  -- estar preguntándose cuál de dos elecciones está mirando.
  activa boolean not null default false,

  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

create unique index if not exists jornadas_activa_uq
  on jornadas (tenant_id) where activa;

-- ------------------------------------------------------------
-- Quién ya votó
-- ------------------------------------------------------------
create table if not exists jornada_asistencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  jornada_id uuid not null references jornadas(id) on delete cascade,
  promovido_id uuid not null references promovidos(id) on delete cascade,
  casilla_id uuid references casillas(id),

  registrada_en timestamptz not null default now(),
  registrada_por uuid references usuarios(id) on delete set null
);

-- El fraude más barato del día de la elección es contar dos veces a la
-- misma persona: el promotor cobra por promovido que acude. Que la base
-- lo impida vale más que cualquier revisión posterior.
create unique index if not exists jornada_asistencias_uq
  on jornada_asistencias (tenant_id, jornada_id, promovido_id);

create index if not exists jornada_asistencias_hora_idx
  on jornada_asistencias (tenant_id, jornada_id, registrada_en);

-- ------------------------------------------------------------
-- Qué está pasando en las casillas
-- ------------------------------------------------------------
create table if not exists jornada_incidencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  jornada_id uuid not null references jornadas(id) on delete cascade,
  casilla_id uuid references casillas(id),
  seccion_id uuid references secciones(id),

  tipo text not null default 'otro'
    check (tipo in ('apertura', 'cierre', 'material', 'propaganda',
                    'intimidacion', 'acarreo', 'otro')),
  gravedad text not null default 'normal'
    check (gravedad in ('normal', 'atencion', 'urgente')),
  descripcion text not null,

  resuelta_en timestamptz,
  creada_en timestamptz not null default now(),
  creada_por uuid references usuarios(id) on delete set null
);

create index if not exists jornada_incidencias_abiertas_idx
  on jornada_incidencias (tenant_id, jornada_id) where resuelta_en is null;

-- ------------------------------------------------------------
-- Aislamiento entre clientes
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['jornadas', 'jornada_asistencias', 'jornada_incidencias'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_aislamiento on %I', t);
    execute format(
      'create policy tenant_aislamiento on %I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
         with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
    execute format('grant select, insert, update, delete on %I to inpol_app', t);
  end loop;
end $$;
