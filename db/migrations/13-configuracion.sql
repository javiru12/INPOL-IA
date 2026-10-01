-- ============================================================
-- 13 · Configuración: lo que la pantalla de administración necesita
-- ------------------------------------------------------------
-- Casi todo estaba ya en 01 y 03. Aquí solo se cierran dos huecos
-- que, mientras la configuración era de solo lectura, nadie podía
-- tocar — y que al abrirla a escritura dejan de ser teóricos.
-- ============================================================

-- --- El cliente solo puede editarse a sí mismo ------------------------
-- `tenants` se quedó fuera del aislamiento porque es la tabla que lo
-- define: el selector de plaza y la resolución por subdominio tienen que
-- poder leerla sin tenant fijado. Pero hasta ahora la aplicación también
-- podía ESCRIBIRLA sin límite: un `update tenants` con el id equivocado
-- habría cambiado el nombre o la licencia de otro cliente.
--
-- La lectura sigue abierta; la escritura se acota al tenant de la sesión.
alter table tenants enable row level security;
alter table tenants force row level security;

drop policy if exists tenants_lectura on tenants;
create policy tenants_lectura on tenants
  for select using (true);

drop policy if exists tenants_edicion on tenants;
create policy tenants_edicion on tenants
  for update
  using (id = tenant_actual())
  with check (id = tenant_actual());

-- Sin política de insert ni de delete a propósito: dar de alta o borrar un
-- cliente es trabajo de la consola de plataforma (que corre con el rol
-- dueño, exento de RLS), nunca de la aplicación.

comment on table tenants is
  'Clientes de la plataforma. Cada uno ve únicamente su información. '
  'Lectura abierta —el selector de plaza la necesita—, escritura acotada '
  'al tenant de la sesión.';

-- --- Un catálogo no puede tener dos veces lo mismo --------------------
-- Dos «Bache» en la lista no es un detalle estético: parte las
-- estadísticas en dos y el operador nunca sabe cuál elegir. El índice es
-- parcial sobre lo activo, así que desactivar un término y volver a
-- darlo de alta más tarde sigue siendo posible.
create unique index if not exists problematicas_titulo_unico
  on problematicas (tenant_id, lower(titulo)) where activo;

create unique index if not exists subproblematicas_titulo_unico
  on subproblematicas (tenant_id, problematica_id, lower(titulo)) where activo;

create unique index if not exists dependencias_descripcion_unico
  on dependencias (tenant_id, lower(descripcion)) where activo;

create unique index if not exists fuentes_descripcion_unico
  on fuentes (tenant_id, lower(descripcion)) where activo;

create unique index if not exists estatus_peticiones_descripcion_unico
  on estatus_peticiones (tenant_id, lower(descripcion)) where activo;

create unique index if not exists prioridades_descripcion_unico
  on prioridades (tenant_id, lower(descripcion)) where activo;

-- --- Marca de tiempo al editar un catálogo ----------------------------
-- 01 puso el trigger en usuarios, campanias y candidatos; las tablas del
-- modelo importado se quedaron sin él y hasta ahora nadie las editaba.
do $$
declare t text;
begin
  foreach t in array array[
    'problematicas','subproblematicas','dependencias','fuentes',
    'estatus_peticiones','prioridades','tenants'
  ] loop
    execute format(
      'drop trigger if exists %I_actualizado on %I;
       create trigger %I_actualizado before update on %I
       for each row execute function marcar_actualizado()', t, t, t, t);
  end loop;
end $$;
