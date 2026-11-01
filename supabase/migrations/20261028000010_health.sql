-- LOTE 1 · Bloco A · Sanidade: produtos, aplicações (vacinas/medicamentos), carência e alertas
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: tratamentos com diagnóstico/doença, calendário sanitário por categoria, alertas por e-mail/WhatsApp.

-- Permissões do novo módulo
insert into public.permissions (key, resource, action, description)
select 'health.' || a, 'health', a, 'health · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.resource = 'health' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista') and p.action in ('view','create','update','print','export'))
  or (r.name in ('funcionario','operador') and p.action in ('view','create'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system
on conflict do nothing;

create table public.health_products (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('vacina','medicamento')),
  withdrawal_days integer not null default 0 check (withdrawal_days between 0 and 365),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  unique (farm_id, id)
);
create unique index health_products_name_uq on public.health_products (farm_id, lower(name));
create trigger health_products_created before insert on public.health_products for each row execute function app.set_created();

create table public.health_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  animal_id uuid not null,
  product_id uuid not null,
  event_date date not null,
  dose text,
  product_lot text,
  next_due_date date,
  withdrawal_until date,
  notes text,
  batch_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, animal_id) references public.animals (farm_id, id),
  foreign key (farm_id, product_id) references public.health_products (farm_id, id),
  check (next_due_date is null or next_due_date > event_date)
);
create index health_events_animal_idx on public.health_events (animal_id, event_date desc);
create index health_events_due_idx on public.health_events (farm_id, next_due_date) where voided_at is null;

-- Imutável: só a anulação é permitida (mesmo gatilho das pesagens)
create trigger health_events_guard before update or delete on public.health_events
  for each row execute function app.weighings_guard();
create trigger health_events_no_truncate before truncate on public.health_events
  for each statement execute function app.block_change();

-- Produtos iniciais para cada fazenda (a carência dos medicamentos deve ser ajustada conforme a bula)
create function app.seed_health_products() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.health_products (farm_id, name, kind)
    select new.id, n, k from (values
      ('Febre aftosa','vacina'), ('Brucelose','vacina'), ('Raiva','vacina'),
      ('Clostridioses','vacina'), ('Vermífugo','medicamento')) v(n, k);
  return new;
end $$;
create trigger farms_seed_health after insert on public.farms for each row execute function app.seed_health_products();
insert into public.health_products (farm_id, name, kind)
  select f.id, v.n, v.k from public.farms f cross join (values
    ('Febre aftosa','vacina'), ('Brucelose','vacina'), ('Raiva','vacina'),
    ('Clostridioses','vacina'), ('Vermífugo','medicamento')) v(n, k)
  on conflict do nothing;

-- Privilégios e RLS
revoke all on public.health_products, public.health_events from anon;
revoke insert, update, delete, truncate on public.health_products, public.health_events from authenticated;
grant insert (farm_id, name, kind, withdrawal_days, notes) on public.health_products to authenticated;
grant update (name, withdrawal_days, active, notes) on public.health_products to authenticated;
alter table public.health_products enable row level security;
alter table public.health_events enable row level security;
create policy hp_select on public.health_products for select to authenticated using (app.has_permission(farm_id, 'health.view'));
create policy hp_insert on public.health_products for insert to authenticated with check (app.has_permission(farm_id, 'health.create'));
create policy hp_update on public.health_products for update to authenticated
  using (app.has_permission(farm_id, 'health.update')) with check (app.has_permission(farm_id, 'health.update'));
create policy he_select on public.health_events for select to authenticated using (app.has_permission(farm_id, 'health.view'));
grant select on public.health_events to authenticated;

-- Aplicação em um ou vários animais, em uma única transação
create function public.register_health(p_farm uuid, p_animal_ids uuid[], p_product uuid, p_date date,
                                       p_dose text, p_next date, p_lot text, p_notes text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_want integer; v_batch uuid := gen_random_uuid(); v_days integer;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'health.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select hp.withdrawal_days into v_days from public.health_products hp
    where hp.id = p_product and hp.farm_id = p_farm and hp.active;
  if not found then raise exception 'invalid_product'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  if p_next is not null and p_next <= p_date then raise exception 'invalid_next_date'; end if;
  if p_animal_ids is null or cardinality(p_animal_ids) = 0 or cardinality(p_animal_ids) > 500 then
    raise exception 'invalid_batch_size';
  end if;
  select count(distinct x) into v_want from unnest(p_animal_ids) x;
  select count(*) into v_n from (
    select id from public.animals
    where farm_id = p_farm and id = any(p_animal_ids) and deleted_at is null and status = 'ativo'
    order by id for update) t;
  if v_n <> v_want then raise exception 'invalid_animals'; end if;

  insert into public.health_events (farm_id, animal_id, product_id, event_date, dose, product_lot, next_due_date,
                                    withdrawal_until, notes, batch_id, created_by)
  select p_farm, a.id, p_product, p_date, nullif(trim(p_dose), ''), nullif(trim(p_lot), ''), p_next,
         case when v_days > 0 then p_date + v_days end, nullif(trim(p_notes), ''), v_batch, auth.uid()
  from public.animals a where a.farm_id = p_farm and a.id = any(p_animal_ids);
  return v_n;
end $$;

create function public.void_health_event(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.health_events where id = p_id and voided_at is null;
  if v_farm is null then raise exception 'invalid_event'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'health.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  update public.health_events set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;

-- Alertas: doses atrasadas, a vencer em 30 dias e animais em carência (respeita a RLS de quem chama)
create function public.health_alerts(p_farm uuid) returns jsonb
language sql stable set search_path = '' as $$
  with last_ev as (
    select distinct on (e.animal_id, e.product_id) e.animal_id, e.product_id, e.next_due_date
    from public.health_events e
    join public.animals a on a.id = e.animal_id and a.status = 'ativo' and a.deleted_at is null
    where e.farm_id = p_farm and e.voided_at is null
    order by e.animal_id, e.product_id, e.event_date desc, e.created_at desc
  ),
  due as (
    select l.animal_id, l.product_id, l.next_due_date,
           case when l.next_due_date < current_date then 'atrasada' else 'a_vencer' end as st
    from last_ev l
    where l.next_due_date is not null and l.next_due_date <= current_date + 30
  ),
  wd as (
    select e.animal_id
    from public.health_events e
    join public.animals a on a.id = e.animal_id and a.status = 'ativo' and a.deleted_at is null
    where e.farm_id = p_farm and e.voided_at is null and e.withdrawal_until >= current_date
    group by e.animal_id
  )
  select jsonb_build_object(
    'overdue', (select count(*) from due where st = 'atrasada'),
    'upcoming', (select count(*) from due where st = 'a_vencer'),
    'in_withdrawal', (select count(*) from wd),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('animal_id', d.animal_id, 'ear_tag', an.ear_tag, 'product', p.name,
                                          'due', d.next_due_date, 'status', d.st) order by d.next_due_date)
      from (select * from due order by next_due_date limit 20) d
      join public.animals an on an.id = d.animal_id
      join public.health_products p on p.id = d.product_id), '[]'::jsonb))
$$;

revoke execute on function public.register_health(uuid, uuid[], uuid, date, text, date, text, text) from public, anon;
revoke execute on function public.void_health_event(uuid, text) from public, anon;
revoke execute on function public.health_alerts(uuid) from public, anon;
grant execute on function public.register_health(uuid, uuid[], uuid, date, text, date, text, text) to authenticated;
grant execute on function public.void_health_event(uuid, text) to authenticated;
grant execute on function public.health_alerts(uuid) to authenticated;

create trigger z_audit after insert or update on public.health_products for each row execute function app.audit_row();
create trigger z_audit after insert or update on public.health_events for each row execute function app.audit_row();
