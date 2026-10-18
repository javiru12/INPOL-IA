-- ============================================================
-- 18 · Buscar sin pelearse con los acentos
-- ------------------------------------------------------------
-- Nadie teclea los acentos al buscar, y el padrón los trae puestos
-- a medias: hay «PEÑA», «Peña» y «Pena» refiriéndose a la misma
-- persona. Con una comparación literal, quien escribe «pena» no
-- encuentra nada y concluye que el registro no existe.
--
-- `unaccent` normaliza ambos lados de la comparación, así que
-- «pena», «Peña» y «PEÑA» se encuentran entre sí.
-- ============================================================

create extension if not exists unaccent;

-- `unaccent()` es STABLE, no IMMUTABLE, porque depende del diccionario
-- instalado. Eso impide usarla en un índice directamente. Esta envoltura
-- la declara inmutable para poder indexar: el diccionario no cambia en
-- esta base, y sin índice cada búsqueda recorre el padrón completo.
create or replace function sin_acentos(texto text)
  returns text
  language sql
  immutable
  parallel safe
  returns null on null input
as $$ select public.unaccent('public.unaccent', texto) $$;

create index if not exists ciudadanos_nombre_busqueda_idx
  on ciudadanos (lower(sin_acentos(nombre_completo)) text_pattern_ops);

create index if not exists ciudadanos_colonia_busqueda_idx
  on ciudadanos (lower(sin_acentos(colonia)) text_pattern_ops);
