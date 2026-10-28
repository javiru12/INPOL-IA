-- ============================================================
-- 21 · Exportar es un permiso aparte
-- ------------------------------------------------------------
-- Hasta ahora podía exportar cualquiera que pudiera capturar una
-- petición o ver la estadística. Son cosas distintas: ver un
-- listado en pantalla deja los datos dentro del sistema, y
-- descargarlo saca un archivo con nombres, teléfonos y domicilios
-- que ya no vuelve a estar bajo control de nadie.
--
-- Se da solo a los dos perfiles de administración. Si el cliente
-- quiere abrirlo a más, se agrega el renglón correspondiente en
-- perfil_funcionalidades; es una línea, no un cambio de código.
-- ============================================================

insert into funcionalidades (clave, modulo, ruta, etiqueta, fase, orden)
select 'exportacion.peticiones', 'Exportación',
       array['Exportación', 'Peticiones'], 'Descargar el listado de peticiones', 1, 1
where not exists (select 1 from funcionalidades where clave = 'exportacion.peticiones');

insert into funcionalidades (clave, modulo, ruta, etiqueta, fase, orden)
select 'exportacion.ciudadanos', 'Exportación',
       array['Exportación', 'Ciudadanos'], 'Descargar el padrón de ciudadanos', 1, 2
where not exists (select 1 from funcionalidades where clave = 'exportacion.ciudadanos');

insert into perfil_funcionalidades (perfil_clave, funcionalidad_clave)
select p.clave, f.clave
from (values ('super_admin'), ('admin')) as p(clave)
cross join (values ('exportacion.peticiones'), ('exportacion.ciudadanos')) as f(clave)
where not exists (
  select 1 from perfil_funcionalidades pf
  where pf.perfil_clave = p.clave and pf.funcionalidad_clave = f.clave);
