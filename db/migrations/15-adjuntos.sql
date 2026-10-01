-- ============================================================
-- 15 · Evidencia adjunta a las peticiones
-- ------------------------------------------------------------
-- El modelo heredado guardaba una url suelta por tipo de archivo
-- (audio_url, video_url, fotografia_url): solo cabía uno de cada
-- y no había forma de saber quién lo subió ni cuándo. Un bache
-- necesita la foto de antes y la de después.
-- ============================================================

create table if not exists adjuntos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  peticion_id uuid not null references peticiones(id) on delete cascade,
  usuario_id uuid references usuarios(id) on delete set null,

  clase text not null check (clase in ('foto', 'audio', 'video', 'documento')),
  momento text not null default 'evidencia'
    check (momento in ('reporte', 'evidencia', 'resultado')),

  nombre_original text not null,
  tipo_mime text not null,
  bytes bigint not null,
  ruta text not null,                 -- dónde quedó guardado
  descripcion text,

  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid
);

comment on column adjuntos.momento is
  'reporte: cómo llegó el problema · evidencia: durante la gestión · '
  'resultado: cómo quedó. El antes y el después es lo que permite '
  'demostrar que se atendió.';

comment on column adjuntos.ruta is
  'Ruta relativa dentro del almacén. No es una URL pública: los archivos '
  'se sirven por una ruta que comprueba sesión y cliente.';

create index if not exists adjuntos_peticion_idx
  on adjuntos (tenant_id, peticion_id, creado_en);

alter table adjuntos enable row level security;
alter table adjuntos force row level security;
drop policy if exists tenant_aislamiento on adjuntos;
create policy tenant_aislamiento on adjuntos
  using (tenant_id = tenant_actual())
  with check (tenant_id = tenant_actual());

grant select, insert, update, delete on adjuntos to inpol_app;
