-- ============================================================
-- 24 · Registro de importaciones
-- ------------------------------------------------------------
-- Cada archivo que entra al sistema deja constancia: qué archivo,
-- quién lo subió, cuándo, a dónde fue, cuántas filas entraron y
-- cuántas se rechazaron.
--
-- No es burocracia. El sistema lo van a usar varios gobiernos
-- estatales y un dato personal sin procedencia no se puede
-- defender ante quien pregunte de dónde salió: la pregunta llega,
-- y para entonces quien cargó el archivo puede que ya no trabaje
-- ahí. `base_legal` guarda lo que declaró quien lo subió.
-- ============================================================

create table if not exists importaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  destino text not null,
  archivo text not null,
  bytes int,
  fuente text not null,
  base_legal text,
  filas_leidas int not null default 0,
  filas_cargadas int not null default 0,
  filas_rechazadas int not null default 0,
  detalle jsonb,
  usuario_id uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index if not exists importaciones_tenant_idx
  on importaciones (tenant_id, creado_en desc);

alter table importaciones enable row level security;
alter table importaciones force row level security;
drop policy if exists tenant_aislamiento on importaciones;
create policy tenant_aislamiento on importaciones
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
grant select, insert, update, delete on importaciones to inpol_app;

-- Quién puede importar. Es permiso aparte del de exportar: traer datos
-- de fuera y llevárselos son riesgos distintos.
insert into funcionalidades (clave, modulo, ruta, etiqueta, fase, orden)
select 'configuracion.importacion_de_datos', 'Configuración',
       array['Configuración', 'Importar datos'], 'Subir archivos de datos', 1, 9
where not exists (select 1 from funcionalidades where clave = 'configuracion.importacion_de_datos');

insert into perfil_funcionalidades (perfil_clave, funcionalidad_clave)
select p.clave, 'configuracion.importacion_de_datos'
from (values ('super_admin'), ('admin')) as p(clave)
where not exists (
  select 1 from perfil_funcionalidades pf
  where pf.perfil_clave = p.clave
    and pf.funcionalidad_clave = 'configuracion.importacion_de_datos');

-- La importación del padrón decide por CURP si una persona ya estaba.
-- Sin índice único, `on conflict` no tiene contra qué comparar.
create unique index if not exists ciudadanos_curp_unico
  on ciudadanos (tenant_id, curp) where curp is not null;
