-- ETAPA 2 · Bloco 2 · Eventos do animal, movimentações (individual e em lote) e histórico
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Regra: lote, pasto, status e data de saída só mudam pela função register_movement,
-- que grava o evento e a alteração na mesma transação.

create table public.animal_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  animal_id uuid not null,
  event_type text not null check (event_type in ('entrada','transferencia','venda','morte')),
  event_date date not null,
  batch_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (farm_id, animal_id) references public.animals (farm_id, id)
);
create index animal_events_animal_idx on public.animal_events (animal_id, event_date desc, created_at desc);
create index animal_events_farm_idx on public.animal_events (farm_id, event_date desc);

-- Livro-razão imutável
create function app.block_change() returns trigger language plpgsql as $$
begin raise exception 'immutable_table' using errcode = '42501'; end $$;
create trigger events_no_update_delete before update or delete on public.animal_events
  for each row execute function app.block_change();
create trigger events_no_truncate before truncate on public.animal_events
  for each statement execute function app.block_change();

-- Todo animal novo gera o evento de entrada
create function app.animal_entry_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.animal_events (farm_id, animal_id, event_type, event_date, details, created_by)
  values (new.farm_id, new.id, 'entrada', coalesce(new.entry_date, current_date),
          jsonb_strip_nulls(jsonb_build_object('to_lot_id', new.lot_id, 'to_pasture_id', new.pasture_id)),
          auth.uid());
  return new;
end $$;
create trigger animals_entry after insert on public.animals
  for each row execute function app.animal_entry_event();

-- Animais que já existiam
insert into public.animal_events (farm_id, animal_id, event_type, event_date, details, created_by)
select a.farm_id, a.id, 'entrada', coalesce(a.entry_date, a.created_at::date),
       jsonb_strip_nulls(jsonb_build_object('to_lot_id', a.lot_id, 'to_pasture_id', a.pasture_id)), a.created_by
from public.animals a
where not exists (select 1 from public.animal_events e where e.animal_id = a.id);

-- Movimentação (um ou vários animais) em uma única transação
create function public.register_movement(
  p_farm uuid, p_animal_ids uuid[], p_event text, p_date date,
  p_lot uuid, p_pasture uuid, p_notes text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_want integer; v_batch uuid := gen_random_uuid();
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'movements.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event not in ('transferencia','venda','morte') then raise exception 'invalid_event'; end if;
  if p_animal_ids is null or cardinality(p_animal_ids) = 0 or cardinality(p_animal_ids) > 500 then
    raise exception 'invalid_batch_size';
  end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  if p_event = 'transferencia' and p_lot is null and p_pasture is null then
    raise exception 'destination_required';
  end if;
  if p_lot is not null and not exists (
       select 1 from public.lots where id = p_lot and farm_id = p_farm and deleted_at is null and status = 'ativo') then
    raise exception 'invalid_destination';
  end if;
  if p_pasture is not null and not exists (
       select 1 from public.pastures where id = p_pasture and farm_id = p_farm and deleted_at is null and status <> 'inativo') then
    raise exception 'invalid_destination';
  end if;

  select count(distinct x) into v_want from unnest(p_animal_ids) x;
  select count(*) into v_n from (
    select id from public.animals
    where farm_id = p_farm and id = any(p_animal_ids) and deleted_at is null and status = 'ativo'
    order by id for update) t;
  if v_n <> v_want then raise exception 'invalid_animals'; end if;

  insert into public.animal_events (farm_id, animal_id, event_type, event_date, batch_id, details, created_by)
  select a.farm_id, a.id, p_event, p_date, v_batch,
         jsonb_strip_nulls(jsonb_build_object(
           'from_lot_id', a.lot_id,
           'to_lot_id', case when p_event = 'transferencia' then coalesce(p_lot, a.lot_id) end,
           'from_pasture_id', a.pasture_id,
           'to_pasture_id', case when p_event = 'transferencia' then coalesce(p_pasture, a.pasture_id) end,
           'notes', nullif(trim(p_notes), ''))),
         auth.uid()
  from public.animals a where a.farm_id = p_farm and a.id = any(p_animal_ids);

  if p_event = 'transferencia' then
    update public.animals set lot_id = coalesce(p_lot, lot_id), pasture_id = coalesce(p_pasture, pasture_id)
      where farm_id = p_farm and id = any(p_animal_ids);
  elsif p_event = 'venda' then
    update public.animals set status = 'vendido', exit_date = p_date where farm_id = p_farm and id = any(p_animal_ids);
  else
    update public.animals set status = 'morto', exit_date = p_date where farm_id = p_farm and id = any(p_animal_ids);
  end if;
  return v_n;
end $$;
revoke execute on function public.register_movement(uuid, uuid[], text, date, uuid, uuid, text) from public, anon;
grant execute on function public.register_movement(uuid, uuid[], text, date, uuid, uuid, text) to authenticated;

-- Privilégios: lote, pasto, status e saída deixam de ser editáveis diretamente
revoke insert, update on public.animals from authenticated;
grant insert (farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id,
              birth_date, origin, entry_date, notes, custom) on public.animals to authenticated;
grant update (ear_tag, name, sex, breed_id, category_id, sire_id, dam_id,
              birth_date, origin, entry_date, notes, custom) on public.animals to authenticated;

revoke all on public.animal_events from anon, authenticated;
grant select on public.animal_events to authenticated;
alter table public.animal_events enable row level security;
create policy events_select on public.animal_events for select to authenticated
  using (app.has_permission(farm_id, 'movements.view'));

create trigger z_audit after insert on public.animal_events for each row execute function app.audit_row();
