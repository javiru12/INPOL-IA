-- ============================================================
-- 08 · Seguimiento de peticiones
-- ------------------------------------------------------------
-- El modelo heredado guardaba el avance en un campo de notas de
-- texto libre. El documento funcional pide historial, registro de
-- llamadas y recordatorios, así que el seguimiento necesita ser
-- una entidad con su propia bitácora.
-- ============================================================

create table if not exists peticion_seguimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  peticion_id uuid not null references peticiones(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,
  tipo text not null default 'nota'
    check (tipo in ('nota','llamada','visita','cambio_estatus','asignacion','adjunto')),
  detalle text not null,
  estatus_anterior text,
  estatus_nuevo text,
  recordar_el timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists seguimientos_peticion_idx
  on peticion_seguimientos (tenant_id, peticion_id, creado_en desc);
create index if not exists seguimientos_recordatorio_idx
  on peticion_seguimientos (tenant_id, recordar_el)
  where recordar_el is not null;

alter table peticion_seguimientos enable row level security;
alter table peticion_seguimientos force row level security;
drop policy if exists tenant_aislamiento on peticion_seguimientos;
create policy tenant_aislamiento on peticion_seguimientos
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

grant select, insert, update, delete on peticion_seguimientos to inpol_app;
