-- ============================================================
-- 25 · Importaciones grandes, por lotes
-- ------------------------------------------------------------
-- Un archivo de dos gigabytes no cabe en una petición: Vercel
-- corta el cuerpo en 4.5 MB y el servidor tendría que sostener
-- el archivo entero en memoria. Tampoco cabe en una función sin
-- servidor, que tiene minutos y no horas.
--
-- Así que el archivo no sube. El navegador lo lee por rebanadas,
-- lo interpreta y manda lotes de filas. Cada lote es una
-- petición chica, el avance se guarda aquí y si algo se corta se
-- sabe por dónde iba.
-- ============================================================

alter table importaciones
  add column if not exists estado text not null default 'completada',
  add column if not exists filas_totales int,
  add column if not exists bytes_totales bigint,
  add column if not exists lotes int not null default 0,
  add column if not exists terminada_en timestamptz;

-- `creado_en` ya marca el inicio; esto distingue una carga viva de
-- una que se quedó a medias porque alguien cerró la pestaña.
comment on column importaciones.estado is
  'en_curso | completada | cancelada | fallida';

create index if not exists importaciones_vivas_idx
  on importaciones (tenant_id, estado) where estado = 'en_curso';
