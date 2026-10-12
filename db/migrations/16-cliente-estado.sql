-- ============================================================
-- 16 · Cada cliente, en su estado
-- ------------------------------------------------------------
-- La geografía electoral (estados, municipios, distritos,
-- secciones, casillas y resultados) es catálogo público del INE
-- y por eso vive fuera del aislamiento entre clientes: dos
-- campañas que operan en Nuevo León comparten las mismas 2,602
-- secciones, y está bien que así sea.
--
-- Lo que faltaba era decir en QUÉ estado opera cada cliente. Sin
-- eso, el Gobierno de Chihuahua abría su pantalla de Territorio y
-- veía Monterrey, Apodaca y Guadalupe. No es una fuga de datos
-- privados —la cartografía es pública— pero sí hace el sistema
-- inservible fuera de Nuevo León.
--
-- Un cliente sin estado asignado no ve geografía: la pantalla lo
-- dice y explica qué falta, en vez de enseñar territorio ajeno.
-- ============================================================

alter table tenants
  add column if not exists estado_id uuid references estados(id);

-- Chihuahua existe en el catálogo del INE con la clave 08. Se da de
-- alta el estado para poder vincularlo; su cartografía y sus
-- resultados se cargan aparte, cuando el cliente los entregue.
insert into estados (clave, nombre, abreviatura, activo)
select '08', 'CHIHUAHUA', 'CHIH', true
where not exists (select 1 from estados where clave = '08');

update tenants
   set estado_id = (select id from estados where clave = '19')
 where clave = 'monterrey' and estado_id is null;

update tenants
   set estado_id = (select id from estados where clave = '08')
 where clave = 'chihuahua' and estado_id is null;

create index if not exists tenants_estado_idx on tenants (estado_id);
