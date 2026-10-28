-- ============================================================
-- 23 · Verificación del teléfono por SMS
-- ------------------------------------------------------------
-- Un teléfono mal capturado no se nota hasta que hay que avisarle
-- a la persona que su petición se resolvió, y para entonces ya
-- pasaron meses. Verificarlo al momento del alta lo descubre
-- cuando todavía se puede corregir, con la persona enfrente.
--
-- El código se guarda cifrado y no en claro: si la tabla se
-- filtrara, un código en claro deja suplantar la verificación de
-- cualquiera que todavía no la haya usado.
-- ============================================================

create table if not exists verificaciones_telefono (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id) on delete cascade,
  telefono text not null,
  codigo_hash text not null,
  expira_en timestamptz not null,
  intentos int not null default 0,
  verificado_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid
);

-- Solo un código vivo por persona: pedir otro invalida el anterior.
create unique index if not exists verificaciones_vivas_idx
  on verificaciones_telefono (tenant_id, ciudadano_id)
  where verificado_en is null;

alter table verificaciones_telefono enable row level security;
alter table verificaciones_telefono force row level security;
drop policy if exists tenant_aislamiento on verificaciones_telefono;
create policy tenant_aislamiento on verificaciones_telefono
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
grant select, insert, update, delete on verificaciones_telefono to inpol_app;
