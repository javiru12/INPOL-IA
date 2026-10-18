-- ============================================================
-- 19 · Qué alertas ya revisó cada quien
-- ------------------------------------------------------------
-- Las alertas no son avisos guardados: son cuentas vivas. «17
-- peticiones urgentes sin resolver» no es un mensaje que llegó, es
-- trabajo que sigue ahí. Por eso no se pueden «marcar como leídas»
-- sin más: la petición urgente no desaparece porque alguien la
-- haya mirado.
--
-- Lo que sí tiene sentido es decir «ya vi que son 17, avísame
-- cuando sean más». Eso es lo que guarda esta tabla: la cifra que
-- cada persona ya revisó de cada alerta. El contador vuelve a
-- destacar solo cuando el número sube.
-- ============================================================

create table if not exists alertas_vistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,

  clave text not null,
  cifra_vista integer not null default 0,
  visto_en timestamptz not null default now()
);

-- Una fila por persona y alerta: la última revisión reemplaza a la previa.
create unique index if not exists alertas_vistas_uq
  on alertas_vistas (tenant_id, usuario_id, clave);

alter table alertas_vistas enable row level security;
alter table alertas_vistas force row level security;
drop policy if exists tenant_aislamiento on alertas_vistas;
create policy tenant_aislamiento on alertas_vistas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
grant select, insert, update, delete on alertas_vistas to inpol_app;
