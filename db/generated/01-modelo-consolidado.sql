-- =============================================================================
-- INPOL IA -- Modelo de datos consolidado (PostgreSQL 16)
-- Generado a partir de 'Catalogos INPOL IA.xlsx' (hojas: Base Datos, Gestion, Sheet6, Electoral)
-- Convenciones: nombres en espanol snake_case sin prefijos hungaros, PK uuid,
-- multi-tenant via tenant_id + Row Level Security, columnas estandar
-- (activo, creado_en, creado_por, actualizado_en, actualizado_por) en cada tabla.
-- =============================================================================

-- ===== EXTENSIONES =====
create extension if not exists pgcrypto;

-- ===== TENANTS =====
create table tenants (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  nombre text not null,
  nombre_corto text,
  logo_url text,
  color_acento text,
  licencia_vigente_hasta date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== CATALOGOS GLOBALES =====
create table estados (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  clave_renapo text,
  descripcion_corta text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table municipios (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table localidades (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table distritos_federales (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  cabecera boolean,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table distritos_locales (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  cabecera boolean,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table secciones (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid references estados(id),
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  clave text not null,
  descripcion text,
  tipo text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table manzanas (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid references estados(id),
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  clave text,
  descripcion text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table tipos_asentamiento (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table zonas_asentamiento (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table asentamientos (
  id uuid primary key default gen_random_uuid(),
  clave text,
  descripcion text not null,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table codigos_postales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  localidad_id uuid references localidades(id),
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  tipo_asentamiento_id uuid references tipos_asentamiento(id),
  zona_asentamiento_id uuid references zonas_asentamiento(id),
  asentamiento_id uuid references asentamientos(id),
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table casillas (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  descripcion text,
  tipo text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
  -- TODO PostGIS: geometry(Polygon,4326)
create table partidos (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table profesiones (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estados_civiles (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table modulos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estado_municipios (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid not null references estados(id),
  municipio_id uuid not null references municipios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estado_localidades (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid not null references estados(id),
  localidad_id uuid not null references localidades(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table municipio_secciones (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references municipios(id),
  seccion_id uuid not null references secciones(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table municipio_distritos (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references municipios(id),
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table seccion_casillas (
  id uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references secciones(id),
  casilla_id uuid not null references casillas(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== ACCESO E IDENTIDAD =====
create table perfiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table permisos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  perfil_id uuid not null references perfiles(id),
  modulo_id uuid not null references modulos(id),
  consulta boolean default false,
  escritura boolean default false,
  borrado boolean default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_campania (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== CIUDADANOS Y PETICIONES =====
create table embudos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table sectores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table origenes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table dependencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  contacto text,
  contacto_puesto text,
  telefono_fijo text,
  telefono_movil text,
  correo text,
  sector_id uuid references sectores(id),
  origen_id uuid references origenes(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table problematicas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  titulo text not null,
  descripcion text,
  link_icono text,
  color_rgb text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table subproblematicas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  problematica_id uuid not null references problematicas(id),
  titulo text not null,
  descripcion text,
  link_icono text,
  color_rgb text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table fuentes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estatus_peticiones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table prioridades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== EVENTOS Y RECORRIDOS =====
create table vestimentas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_visita (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== ACTIVISTAS Y MOVILIZADORES =====
create table tipos_activista (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_movilizador (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== PADRON DE BENEFICIARIOS =====
create table metodos_pago (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_beneficiario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_beneficiario_detalle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tipos_expedicion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table beneficios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estatus_beneficiario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table unidades_regionales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  institucion text,
  dependencia_id uuid references dependencias(id),
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table programas_beneficio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  anio integer,
  origen_id uuid references origenes(id),
  dependencia_id uuid references dependencias(id),
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table subprogramas_beneficio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  programa_id uuid not null references programas_beneficio(id),
  clave text,
  descripcion text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== REPORTEO Y MAPEO ESTRATEGICO =====
create table concentrado_general (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  estado_id uuid references estados(id),
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  municipio_id uuid references municipios(id),
  seccion_id uuid references secciones(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table mapas_estrategicos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  casilla_id uuid references casillas(id),
  votantes integer,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== ACCESO E IDENTIDAD =====
create table campanias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  fecha_inicio date,
  fecha_final date,
  tipo_campania_id uuid references tipos_campania(id),
  responsable_id uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  perfil_id uuid references perfiles(id),
  usuario_responsable_id uuid references usuarios(id),
  campania_id uuid references campanias(id),
  nombre text not null,
  apellido_paterno text,
  apellido_materno text,
  nombre_completo text,
  sexo text,
  fecha_nacimiento date,
  telefono_celular text,
  telefono_fijo text,
  correo text,
  direccion text,
  direccion_numero_ext text,
  direccion_numero_int text,
  colonia text,
  localidad_id uuid references localidades(id),
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  tipo_asentamiento_id uuid references tipos_asentamiento(id),
  zona_asentamiento_id uuid references zonas_asentamiento(id),
  asentamiento_id uuid references asentamientos(id),
  codigo_postal_id uuid references codigos_postales(id),
  login text not null,
  password text not null,
  puesto text,
  link_fotografia text,
  administrador_sistema boolean default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estructuras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  descripcion text not null,
  usuario_responsable_id uuid references usuarios(id),
  campania_id uuid references campanias(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estructura_usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  estructura_id uuid not null references estructuras(id),
  usuario_padre_id uuid not null references usuarios(id),
  usuario_hijo_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table operadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table enlaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table candidatos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  usuario_id uuid references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table campania_candidatos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid not null references campanias(id),
  candidato_id uuid not null references candidatos(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table campania_operadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid not null references campanias(id),
  operador_id uuid not null references operadores(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table estado_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  estado_id uuid not null references estados(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table localidad_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  localidad_id uuid not null references localidades(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table municipio_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  municipio_id uuid not null references municipios(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table seccion_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  seccion_id uuid not null references secciones(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table campania_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid not null references campanias(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table tenant_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== CIUDADANOS Y PETICIONES =====
create table ciudadanos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  apellido_paterno text,
  apellido_materno text,
  nombre_completo text,
  sexo text,
  fecha_nacimiento date,
  edad integer,
  calle text,
  direccion text,
  numero_ext text,
  numero_int text,
  colonia text,
  codigo_postal text,
  codigo_postal_id uuid references codigos_postales(id),
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  localidad_id uuid references localidades(id),
  seccion_id uuid references secciones(id),
  tipo_asentamiento_id uuid references tipos_asentamiento(id),
  zona_asentamiento_id uuid references zonas_asentamiento(id),
  asentamiento_id uuid references asentamientos(id),
  telefono_fijo text,
  telefono_movil text,
  correo text,
  facebook text,
  twitter text,
  red_social text,
  codigo_credencial text,
  credencial_frente_url text,
  credencial_reverso_url text,
  credencial_seccion_id uuid references secciones(id),
  clave_elector text,
  numero_peticiones integer,
  afiliado boolean,
  credencializado boolean,
  beneficiado boolean,
  contactar boolean,
  votante boolean,
  pertenencia boolean,
  funnel_id uuid references embudos(id),
  profesion_id uuid references profesiones(id),
  estado_nacimiento_id uuid references estados(id),
  partido_preferencia_id uuid references partidos(id),
  usuario_responsable_id uuid references usuarios(id),
  campania_id uuid references campanias(id),
  codigo_adicional text,
  codigo_adicional_2 text,
  codigo_adicional_3 text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table dependencia_problematicas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  dependencia_id uuid not null references dependencias(id),
  problematica_id uuid not null references problematicas(id),
  enlace_id uuid references enlaces(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table peticiones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id),
  problematica_id uuid references problematicas(id),
  subproblematica_id uuid references subproblematicas(id),
  descripcion text,
  fecha_apertura timestamptz not null,
  fecha_cierre timestamptz,
  fuente_id uuid references fuentes(id),
  operador_id uuid references operadores(id),
  origen_audio boolean default false,
  audio_url text,
  origen_video boolean default false,
  video_url text,
  origen_fotografia boolean default false,
  fotografia_url text,
  origen_captura boolean default false,
  latitud numeric(10,7),
  longitud numeric(10,7),
  notas text,
  adjuntos text,
  estatus_id uuid references estatus_peticiones(id),
  prioridad_id uuid references prioridades(id),
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  seccion_id uuid references secciones(id),
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  funnel_id uuid references embudos(id),
  dependencia_id uuid references dependencias(id),
  enlace_id uuid references enlaces(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== EVENTOS Y RECORRIDOS =====
create table eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid references campanias(id),
  usuario_responsable_id uuid references usuarios(id),
  titulo text not null,
  descripcion text,
  fecha_evento date,
  calle text,
  numero text,
  entre_calle_1 text,
  entre_calle_2 text,
  colonia text,
  codigo_postal text,
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  seccion_id uuid references secciones(id),
  municipio_id uuid references municipios(id),
  hora_inicia timestamptz,
  hora_termina timestamptz,
  vestimenta_id uuid references vestimentas(id),
  tipo_visita_id uuid references tipos_visita(id),
  prensa boolean default false,
  montaje boolean default false,
  asistentes_programados integer,
  asistentes_reales integer,
  detalle_logistica text,
  notas_adicionales text,
  vigente_hasta date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table evento_peticiones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  evento_id uuid not null references eventos(id),
  peticion_id uuid not null references peticiones(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table evento_asistentes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  evento_id uuid not null references eventos(id),
  ciudadano_id uuid not null references ciudadanos(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table evento_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  evento_id uuid not null references eventos(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table recorridos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campania_id uuid references campanias(id),
  usuario_responsable_id uuid references usuarios(id),
  titulo text not null,
  descripcion text,
  fecha_recorrido date,
  punto_inicia text,
  punto_finaliza text,
  colonia text,
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  seccion_id uuid references secciones(id),
  municipio_id uuid references municipios(id),
  hora_inicia timestamptz,
  hora_termina timestamptz,
  vestimenta_id uuid references vestimentas(id),
  prensa boolean default false,
  montaje boolean default false,
  asistentes_programados integer,
  asistentes_reales integer,
  detalle_logistica text,
  notas_adicionales text,
  vigente_hasta date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table recorrido_peticiones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recorrido_id uuid not null references recorridos(id),
  peticion_id uuid not null references peticiones(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table recorrido_asistentes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recorrido_id uuid not null references recorridos(id),
  ciudadano_id uuid not null references ciudadanos(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table recorrido_responsables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recorrido_id uuid not null references recorridos(id),
  usuario_id uuid not null references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== ACTIVISTAS Y MOVILIZADORES =====
create table activistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  tipo_activista_id uuid references tipos_activista(id),
  estructura_id uuid references estructuras(id),
  telefono_contacto text,
  distrito_federal_id uuid references distritos_federales(id),
  distrito_local_id uuid references distritos_locales(id),
  seccion_id uuid references secciones(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table activista_campanias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  activista_id uuid not null references activistas(id),
  campania_id uuid not null references campanias(id),
  usuario_id uuid references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table movilizadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nombre text not null,
  apellido_paterno text,
  apellido_materno text,
  sexo text,
  fecha_nacimiento date,
  telefono text,
  correo text,
  direccion text,
  direccion_numero_ext text,
  colonia text,
  codigo_postal_id uuid references codigos_postales(id),
  estado_id uuid references estados(id),
  municipio_id uuid references municipios(id),
  usuario_id uuid not null references usuarios(id),
  tipo_movilizador_id uuid references tipos_movilizador(id),
  link_fotografia text,
  administrador_sistema boolean default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);
create table movilizador_campanias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  movilizador_id uuid not null references movilizadores(id),
  campania_id uuid not null references campanias(id),
  usuario_id uuid references usuarios(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== PADRON DE BENEFICIARIOS =====
create table padron_beneficiarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ciudadano_id uuid not null references ciudadanos(id),
  dependencia_id uuid references dependencias(id),
  programa_id uuid references programas_beneficio(id),
  subprograma_id uuid references subprogramas_beneficio(id),
  unidad_regional_id uuid references unidades_regionales(id),
  origen_id uuid references origenes(id),
  metodo_pago_id uuid references metodos_pago(id),
  tipo_beneficiario_id uuid references tipos_beneficiario(id),
  tipo_beneficiario_detalle_id uuid references tipos_beneficiario_detalle(id),
  tipo_expedicion_id uuid references tipos_expedicion(id),
  beneficio_id uuid references beneficios(id),
  estatus_beneficiario_id uuid references estatus_beneficiario(id),
  estado_civil_id uuid references estados_civiles(id),
  anio_empadronado integer,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz,
  actualizado_por uuid
);

-- ===== LLAVES FORANEAS DIFERIDAS (dependencias circulares) =====
-- usuarios.campania_id -> campanias y campanias.responsable_id -> usuarios forman un ciclo;
-- se crea campanias.responsable_id sin constraint inline y se agrega aqui, ya que ambas tablas existen.
alter table campanias add constraint fk_campanias_responsable_id foreign key (responsable_id) references usuarios(id);

-- ===== INDICES =====
-- un indice por cada tenant_id (aislamiento multi-tenant)
create index idx_activista_campanias_tenant_id on activista_campanias(tenant_id);
create index idx_activistas_tenant_id on activistas(tenant_id);
create index idx_beneficios_tenant_id on beneficios(tenant_id);
create index idx_campania_candidatos_tenant_id on campania_candidatos(tenant_id);
create index idx_campania_operadores_tenant_id on campania_operadores(tenant_id);
create index idx_campania_responsables_tenant_id on campania_responsables(tenant_id);
create index idx_campanias_tenant_id on campanias(tenant_id);
create index idx_candidatos_tenant_id on candidatos(tenant_id);
create index idx_ciudadanos_tenant_id on ciudadanos(tenant_id);
create index idx_concentrado_general_tenant_id on concentrado_general(tenant_id);
create index idx_dependencia_problematicas_tenant_id on dependencia_problematicas(tenant_id);
create index idx_dependencias_tenant_id on dependencias(tenant_id);
create index idx_embudos_tenant_id on embudos(tenant_id);
create index idx_enlaces_tenant_id on enlaces(tenant_id);
create index idx_estado_responsables_tenant_id on estado_responsables(tenant_id);
create index idx_estatus_beneficiario_tenant_id on estatus_beneficiario(tenant_id);
create index idx_estatus_peticiones_tenant_id on estatus_peticiones(tenant_id);
create index idx_estructura_usuarios_tenant_id on estructura_usuarios(tenant_id);
create index idx_estructuras_tenant_id on estructuras(tenant_id);
create index idx_evento_asistentes_tenant_id on evento_asistentes(tenant_id);
create index idx_evento_peticiones_tenant_id on evento_peticiones(tenant_id);
create index idx_evento_responsables_tenant_id on evento_responsables(tenant_id);
create index idx_eventos_tenant_id on eventos(tenant_id);
create index idx_fuentes_tenant_id on fuentes(tenant_id);
create index idx_localidad_responsables_tenant_id on localidad_responsables(tenant_id);
create index idx_mapas_estrategicos_tenant_id on mapas_estrategicos(tenant_id);
create index idx_metodos_pago_tenant_id on metodos_pago(tenant_id);
create index idx_movilizador_campanias_tenant_id on movilizador_campanias(tenant_id);
create index idx_movilizadores_tenant_id on movilizadores(tenant_id);
create index idx_municipio_responsables_tenant_id on municipio_responsables(tenant_id);
create index idx_operadores_tenant_id on operadores(tenant_id);
create index idx_origenes_tenant_id on origenes(tenant_id);
create index idx_padron_beneficiarios_tenant_id on padron_beneficiarios(tenant_id);
create index idx_perfiles_tenant_id on perfiles(tenant_id);
create index idx_permisos_tenant_id on permisos(tenant_id);
create index idx_peticiones_tenant_id on peticiones(tenant_id);
create index idx_prioridades_tenant_id on prioridades(tenant_id);
create index idx_problematicas_tenant_id on problematicas(tenant_id);
create index idx_programas_beneficio_tenant_id on programas_beneficio(tenant_id);
create index idx_recorrido_asistentes_tenant_id on recorrido_asistentes(tenant_id);
create index idx_recorrido_peticiones_tenant_id on recorrido_peticiones(tenant_id);
create index idx_recorrido_responsables_tenant_id on recorrido_responsables(tenant_id);
create index idx_recorridos_tenant_id on recorridos(tenant_id);
create index idx_seccion_responsables_tenant_id on seccion_responsables(tenant_id);
create index idx_sectores_tenant_id on sectores(tenant_id);
create index idx_subproblematicas_tenant_id on subproblematicas(tenant_id);
create index idx_subprogramas_beneficio_tenant_id on subprogramas_beneficio(tenant_id);
create index idx_tenant_responsables_tenant_id on tenant_responsables(tenant_id);
create index idx_tipos_activista_tenant_id on tipos_activista(tenant_id);
create index idx_tipos_beneficiario_tenant_id on tipos_beneficiario(tenant_id);
create index idx_tipos_beneficiario_detalle_tenant_id on tipos_beneficiario_detalle(tenant_id);
create index idx_tipos_campania_tenant_id on tipos_campania(tenant_id);
create index idx_tipos_expedicion_tenant_id on tipos_expedicion(tenant_id);
create index idx_tipos_movilizador_tenant_id on tipos_movilizador(tenant_id);
create index idx_tipos_visita_tenant_id on tipos_visita(tenant_id);
create index idx_unidades_regionales_tenant_id on unidades_regionales(tenant_id);
create index idx_usuarios_tenant_id on usuarios(tenant_id);
create index idx_vestimentas_tenant_id on vestimentas(tenant_id);

-- indices compuestos para busquedas frecuentes
create index idx_ciudadanos_tenant_nombre on ciudadanos(tenant_id, nombre_completo);
create index idx_ciudadanos_tenant_seccion on ciudadanos(tenant_id, seccion_id);
create index idx_ciudadanos_tenant_telefono on ciudadanos(tenant_id, telefono_movil);
create index idx_peticiones_tenant_estatus on peticiones(tenant_id, estatus_id);
create index idx_peticiones_tenant_fecha on peticiones(tenant_id, fecha_apertura);
create index idx_peticiones_tenant_seccion on peticiones(tenant_id, seccion_id);

-- ===== ROW LEVEL SECURITY =====
alter table activista_campanias enable row level security;
create policy tenant_aislamiento on activista_campanias
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table activistas enable row level security;
create policy tenant_aislamiento on activistas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table beneficios enable row level security;
create policy tenant_aislamiento on beneficios
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table campania_candidatos enable row level security;
create policy tenant_aislamiento on campania_candidatos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table campania_operadores enable row level security;
create policy tenant_aislamiento on campania_operadores
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table campania_responsables enable row level security;
create policy tenant_aislamiento on campania_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table campanias enable row level security;
create policy tenant_aislamiento on campanias
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table candidatos enable row level security;
create policy tenant_aislamiento on candidatos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table ciudadanos enable row level security;
create policy tenant_aislamiento on ciudadanos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table concentrado_general enable row level security;
create policy tenant_aislamiento on concentrado_general
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table dependencia_problematicas enable row level security;
create policy tenant_aislamiento on dependencia_problematicas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table dependencias enable row level security;
create policy tenant_aislamiento on dependencias
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table embudos enable row level security;
create policy tenant_aislamiento on embudos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table enlaces enable row level security;
create policy tenant_aislamiento on enlaces
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table estado_responsables enable row level security;
create policy tenant_aislamiento on estado_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table estatus_beneficiario enable row level security;
create policy tenant_aislamiento on estatus_beneficiario
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table estatus_peticiones enable row level security;
create policy tenant_aislamiento on estatus_peticiones
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table estructura_usuarios enable row level security;
create policy tenant_aislamiento on estructura_usuarios
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table estructuras enable row level security;
create policy tenant_aislamiento on estructuras
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table evento_asistentes enable row level security;
create policy tenant_aislamiento on evento_asistentes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table evento_peticiones enable row level security;
create policy tenant_aislamiento on evento_peticiones
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table evento_responsables enable row level security;
create policy tenant_aislamiento on evento_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table eventos enable row level security;
create policy tenant_aislamiento on eventos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table fuentes enable row level security;
create policy tenant_aislamiento on fuentes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table localidad_responsables enable row level security;
create policy tenant_aislamiento on localidad_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table mapas_estrategicos enable row level security;
create policy tenant_aislamiento on mapas_estrategicos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table metodos_pago enable row level security;
create policy tenant_aislamiento on metodos_pago
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table movilizador_campanias enable row level security;
create policy tenant_aislamiento on movilizador_campanias
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table movilizadores enable row level security;
create policy tenant_aislamiento on movilizadores
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table municipio_responsables enable row level security;
create policy tenant_aislamiento on municipio_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table operadores enable row level security;
create policy tenant_aislamiento on operadores
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table origenes enable row level security;
create policy tenant_aislamiento on origenes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table padron_beneficiarios enable row level security;
create policy tenant_aislamiento on padron_beneficiarios
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table perfiles enable row level security;
create policy tenant_aislamiento on perfiles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table permisos enable row level security;
create policy tenant_aislamiento on permisos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table peticiones enable row level security;
create policy tenant_aislamiento on peticiones
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table prioridades enable row level security;
create policy tenant_aislamiento on prioridades
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table problematicas enable row level security;
create policy tenant_aislamiento on problematicas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table programas_beneficio enable row level security;
create policy tenant_aislamiento on programas_beneficio
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table recorrido_asistentes enable row level security;
create policy tenant_aislamiento on recorrido_asistentes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table recorrido_peticiones enable row level security;
create policy tenant_aislamiento on recorrido_peticiones
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table recorrido_responsables enable row level security;
create policy tenant_aislamiento on recorrido_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table recorridos enable row level security;
create policy tenant_aislamiento on recorridos
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table seccion_responsables enable row level security;
create policy tenant_aislamiento on seccion_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table sectores enable row level security;
create policy tenant_aislamiento on sectores
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table subproblematicas enable row level security;
create policy tenant_aislamiento on subproblematicas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table subprogramas_beneficio enable row level security;
create policy tenant_aislamiento on subprogramas_beneficio
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tenant_responsables enable row level security;
create policy tenant_aislamiento on tenant_responsables
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_activista enable row level security;
create policy tenant_aislamiento on tipos_activista
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_beneficiario enable row level security;
create policy tenant_aislamiento on tipos_beneficiario
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_beneficiario_detalle enable row level security;
create policy tenant_aislamiento on tipos_beneficiario_detalle
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_campania enable row level security;
create policy tenant_aislamiento on tipos_campania
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_expedicion enable row level security;
create policy tenant_aislamiento on tipos_expedicion
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_movilizador enable row level security;
create policy tenant_aislamiento on tipos_movilizador
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tipos_visita enable row level security;
create policy tenant_aislamiento on tipos_visita
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table unidades_regionales enable row level security;
create policy tenant_aislamiento on unidades_regionales
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table usuarios enable row level security;
create policy tenant_aislamiento on usuarios
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table vestimentas enable row level security;
create policy tenant_aislamiento on vestimentas
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

