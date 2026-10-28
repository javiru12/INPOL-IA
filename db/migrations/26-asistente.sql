-- ============================================================
-- 26 · Asistente de datos
-- ------------------------------------------------------------
-- Quién puede preguntarle al sistema. Es permiso aparte porque el
-- asistente responde cruzando cualquier cosa con cualquier cosa:
-- alguien que solo debía ver su propio municipio podría pedirle el
-- resumen de todos. El aislamiento ENTRE CLIENTES lo garantiza la
-- base; esto es lo que acota dentro de un mismo cliente.
-- ============================================================

insert into funcionalidades (clave, modulo, ruta, etiqueta, fase, orden)
select 'asistente.consultar', 'Asistente',
       array['Asistente', 'Preguntar'], 'Preguntarle al sistema', 1, 1
where not exists (select 1 from funcionalidades where clave = 'asistente.consultar');

insert into perfil_funcionalidades (perfil_clave, funcionalidad_clave)
select p.clave, 'asistente.consultar'
from (values ('super_admin'), ('admin'), ('marketing')) as p(clave)
where not exists (
  select 1 from perfil_funcionalidades pf
  where pf.perfil_clave = p.clave and pf.funcionalidad_clave = 'asistente.consultar');
