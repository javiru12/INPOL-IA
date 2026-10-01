-- ============================================================
-- 10 · Canal directo del ciudadano
-- ------------------------------------------------------------
-- Hasta ahora toda petición entraba capturada por alguien del
-- gobierno. Esto abre la puerta para que la persona levante la
-- suya y después consulte en qué va.
-- ============================================================

-- --- Folio público -----------------------------------------------------
-- El identificador interno es un UUID: ni se dicta por teléfono ni se
-- apunta en una libreta. El folio es corto, legible en voz alta y, sobre
-- todo, no adivinable: si fuera consecutivo, cualquiera podría recorrer
-- los folios ajenos.
alter table peticiones add column if not exists folio text;

create unique index if not exists peticiones_folio_uq
  on peticiones (tenant_id, folio) where folio is not null;

-- --- Control de abuso del formulario público ---------------------------
create table if not exists intentos_publicos (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  huella text not null,              -- ip, o ip + teléfono
  accion text not null,              -- 'reporte' | 'consulta'
  creado_en timestamptz not null default now()
);

create index if not exists intentos_publicos_idx
  on intentos_publicos (tenant_id, huella, accion, creado_en desc);

comment on table intentos_publicos is
  'Registro para limitar el uso del formulario público. Se purga solo: '
  'nada anterior a un día tiene valor.';

-- --- Consentimiento ----------------------------------------------------
-- Si la persona capturó sus datos ella misma, hay que poder demostrar
-- cuándo aceptó el aviso de privacidad y qué versión aceptó.
alter table ciudadanos
  add column if not exists acepto_aviso_en timestamptz,
  add column if not exists acepto_aviso_version text,
  add column if not exists origen text;

comment on column ciudadanos.origen is
  'De dónde salió el registro: captura interna o portal ciudadano.';

alter table peticiones add column if not exists origen_portal boolean not null default false;

-- --- Folio para lo que ya existe ---------------------------------------
-- Las peticiones capturadas antes también necesitan folio: si alguien
-- llama preguntando por la suya, debe poder dárselo.
do $$
declare
  fila record;
  candidato text;
  alfabeto text := 'ACDEFGHJKLMNPQRTUVWXY34679';  -- sin I,O,0,1,S,5,B,8,2,Z
  prefijo text;
begin
  for fila in
    select p.id, p.tenant_id, upper(substr(t.clave, 1, 3)) as clave
    from peticiones p join tenants t on t.id = p.tenant_id
    where p.folio is null
  loop
    prefijo := fila.clave;
    loop
      candidato := prefijo || '-' || (
        select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '')
        from generate_series(1, 6)
      );
      exit when not exists (
        select 1 from peticiones
        where tenant_id = fila.tenant_id and folio = candidato
      );
    end loop;
    update peticiones set folio = candidato where id = fila.id;
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to inpol_app;
grant usage, select on all sequences in schema public to inpol_app;

-- --- Aislamiento -------------------------------------------------------
alter table intentos_publicos enable row level security;
alter table intentos_publicos force row level security;
drop policy if exists tenant_aislamiento on intentos_publicos;
create policy tenant_aislamiento on intentos_publicos
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());
