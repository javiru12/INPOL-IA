-- ============================================================
-- 20 · Quién responde ante quién
-- ------------------------------------------------------------
-- El modelo heredado traía dos tablas para esto —`estructuras` y
-- `estructura_usuarios`— que permiten que la misma persona cuelgue
-- de jefes distintos según la campaña. Llevan vacías desde el
-- principio y nadie las ha pedido así.
--
-- Lo que el cliente necesita es más simple y es lo que se usa en la
-- práctica: cada quien tiene UN responsable, y quien no tiene es la
-- cabeza. Con eso sale el organigrama completo, y migrar a las
-- tablas de estructura después no rompe nada.
--
-- Las tablas viejas se quedan donde están: no estorban y guardan la
-- posibilidad de estructuras paralelas por campaña si algún día hace
-- falta.
-- ============================================================

alter table usuarios
  add column if not exists usuario_responsable_id uuid references usuarios(id) on delete set null;

create index if not exists usuarios_responsable_idx
  on usuarios (tenant_id, usuario_responsable_id);

-- Nadie es su propio jefe.
alter table usuarios drop constraint if exists usuarios_no_es_su_jefe;
alter table usuarios add constraint usuarios_no_es_su_jefe
  check (usuario_responsable_id is null or usuario_responsable_id <> id);

/**
 * Un ciclo deja el organigrama sin cabeza y cuelga cualquier consulta
 * recursiva que lo recorra. La restricción de arriba solo atrapa el caso
 * directo (A jefe de A); este dispara también con la vuelta larga:
 * A manda a B, B manda a C y alguien pone a C de jefe de A.
 */
create or replace function revisar_ciclo_jerarquia() returns trigger
language plpgsql as $$
declare
  actual uuid := new.usuario_responsable_id;
  saltos int := 0;
begin
  while actual is not null loop
    if actual = new.id then
      raise exception 'Esa asignación haría un círculo en el organigrama'
        using errcode = 'check_violation';
    end if;

    -- Red de seguridad: si la tabla ya trajera un ciclo de antes, el
    -- recorrido no debe quedarse dando vueltas para siempre.
    saltos := saltos + 1;
    if saltos > 100 then
      raise exception 'La cadena de responsables es demasiado larga o tiene un círculo'
        using errcode = 'check_violation';
    end if;

    select usuario_responsable_id into actual from usuarios where id = actual;
  end loop;
  return new;
end $$;

drop trigger if exists usuarios_sin_ciclos on usuarios;
create trigger usuarios_sin_ciclos
  before insert or update of usuario_responsable_id on usuarios
  for each row
  when (new.usuario_responsable_id is not null)
  execute function revisar_ciclo_jerarquia();
