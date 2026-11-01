-- LOTE 2 · Bloco D · Estoque (insumos) e custos
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Simplificações: validade fica na entrada (alerta aproxima por saldo do item, não por lote físico); custo médio ponderado
-- das entradas; custo por cabeça = custo do lote / animais ativos hoje no lote (aproximação).
-- TODO: baixa por lote físico (PEPS), custos por animal individual na tela, rateio automático, contas a pagar/receber.

insert into public.permissions (key, resource, action, description)
select r || '.' || a, r, a, r || ' · ' || a
from unnest(array['inventory','costs']) r cross join unnest(array['view','create','update','delete','export','print','import']) a
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on (
     (p.resource in ('inventory','costs') and r.name in ('administrador','gerente'))
  or (p.resource = 'inventory' and r.name in ('veterinario','zootecnista','funcionario','operador') and p.action in ('view','create'))
  or (p.resource = 'inventory' and r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  unit text not null check (length(trim(unit)) between 1 and 12),
  category text not null default 'outro' check (category in ('racao','sal_mineral','medicamento','vacina','combustivel','outro')),
  min_quantity numeric(14,3) not null default 0 check (min_quantity >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  unique (farm_id, id)
);
create unique index stock_items_name_uq on public.stock_items (farm_id, lower(name));
create trigger stock_items_created before insert on public.stock_items for each row execute function app.set_created();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  item_id uuid not null,
  kind text not null check (kind in ('entrada','saida','ajuste_mais','ajuste_menos')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  movement_date date not null,
  expiry_date date,
  supplier text, document text,
  lot_id uuid,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, item_id) references public.stock_items (farm_id, id),
  foreign key (farm_id, lot_id) references public.lots (farm_id, id)
);
create index stock_movements_item_idx on public.stock_movements (item_id, movement_date desc);
create trigger stock_movements_guard before update or delete on public.stock_movements for each row execute function app.weighings_guard();
create trigger stock_movements_no_truncate before truncate on public.stock_movements for each statement execute function app.block_change();

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  cost_date date not null,
  description text not null check (length(trim(description)) > 0),
  category text not null check (category in ('racao','sanidade','mao_de_obra','combustivel','manutencao','outros')),
  amount numeric(14,2) not null check (amount > 0),
  target_type text not null default 'fazenda' check (target_type in ('fazenda','lote','pasto','animal')),
  lot_id uuid, pasture_id uuid, animal_id uuid,
  stock_movement_id uuid references public.stock_movements(id),
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, lot_id) references public.lots (farm_id, id),
  foreign key (farm_id, pasture_id) references public.pastures (farm_id, id),
  foreign key (farm_id, animal_id) references public.animals (farm_id, id),
  check ((target_type = 'fazenda' and lot_id is null and pasture_id is null and animal_id is null)
      or (target_type = 'lote' and lot_id is not null and pasture_id is null and animal_id is null)
      or (target_type = 'pasto' and pasture_id is not null and lot_id is null and animal_id is null)
      or (target_type = 'animal' and animal_id is not null and lot_id is null and pasture_id is null))
);
create index cost_entries_farm_idx on public.cost_entries (farm_id, cost_date desc) where voided_at is null;
create trigger cost_entries_created before insert on public.cost_entries for each row execute function app.set_created();
create trigger cost_entries_guard before update or delete on public.cost_entries for each row execute function app.weighings_guard();
create trigger cost_entries_no_truncate before truncate on public.cost_entries for each statement execute function app.block_change();

revoke all on public.stock_items, public.stock_movements, public.cost_entries from anon;
revoke insert, update, delete, truncate on public.stock_items, public.stock_movements, public.cost_entries from authenticated;
grant insert (farm_id, name, unit, category, min_quantity) on public.stock_items to authenticated;
grant update (name, unit, category, min_quantity, active) on public.stock_items to authenticated;
grant insert (farm_id, cost_date, description, category, amount, target_type, lot_id, pasture_id, animal_id, notes) on public.cost_entries to authenticated;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cost_entries enable row level security;
create policy si_select on public.stock_items for select to authenticated using (app.has_permission(farm_id, 'inventory.view'));
create policy si_insert on public.stock_items for insert to authenticated with check (app.has_permission(farm_id, 'inventory.create'));
create policy si_update on public.stock_items for update to authenticated
  using (app.has_permission(farm_id, 'inventory.update')) with check (app.has_permission(farm_id, 'inventory.update'));
create policy sm_select on public.stock_movements for select to authenticated using (app.has_permission(farm_id, 'inventory.view'));
create policy ce_select on public.cost_entries for select to authenticated using (app.has_permission(farm_id, 'costs.view'));
create policy ce_insert on public.cost_entries for insert to authenticated with check (app.has_permission(farm_id, 'costs.create'));

-- Movimentação de estoque. Saída gera custo (custo médio das entradas), quando há custo conhecido.
create function public.register_stock_movement(
  p_farm uuid, p_item uuid, p_kind text, p_qty numeric, p_date date, p_unit_cost numeric,
  p_expiry date, p_supplier text, p_doc text, p_lot uuid, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item record; v_balance numeric; v_id uuid; v_avg numeric; v_cat text; v_amount numeric;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'inventory.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('entrada','saida','ajuste_mais','ajuste_menos') then raise exception 'invalid_kind'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid_quantity'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  select i.name as name, i.category as category into v_item from public.stock_items i
    where i.id = p_item and i.farm_id = p_farm and i.active for update;
  if not found then raise exception 'invalid_item'; end if;
  if p_lot is not null and (p_kind <> 'saida' or not exists (
       select 1 from public.lots l where l.id = p_lot and l.farm_id = p_farm and l.deleted_at is null)) then
    raise exception 'invalid_lot';
  end if;
  select coalesce(sum(case when m.kind in ('entrada','ajuste_mais') then m.quantity else -m.quantity end), 0)
    into v_balance from public.stock_movements m where m.item_id = p_item and m.voided_at is null;
  if p_kind in ('saida','ajuste_menos') and v_balance < p_qty then raise exception 'insufficient_stock'; end if;

  insert into public.stock_movements (farm_id, item_id, kind, quantity, unit_cost, movement_date, expiry_date,
                                      supplier, document, lot_id, notes, created_by)
  values (p_farm, p_item, p_kind, p_qty, case when p_kind = 'entrada' then p_unit_cost end, p_date,
          case when p_kind = 'entrada' then p_expiry end, nullif(trim(p_supplier), ''), nullif(trim(p_doc), ''),
          p_lot, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  if p_kind = 'saida' then
    select round(sum(e.quantity * e.unit_cost) / nullif(sum(e.quantity), 0), 4) into v_avg
      from public.stock_movements e
      where e.item_id = p_item and e.kind = 'entrada' and e.unit_cost is not null and e.voided_at is null;
    v_amount := round(coalesce(v_avg, 0) * p_qty, 2);
    if v_amount > 0 then
      v_cat := case v_item.category when 'racao' then 'racao' when 'sal_mineral' then 'racao'
                 when 'medicamento' then 'sanidade' when 'vacina' then 'sanidade' when 'combustivel' then 'combustivel' else 'outros' end;
      insert into public.cost_entries (farm_id, cost_date, description, category, amount, target_type, lot_id, stock_movement_id, created_by)
      values (p_farm, p_date, 'Consumo de estoque: ' || v_item.name, v_cat, v_amount,
              case when p_lot is null then 'fazenda' else 'lote' end, p_lot, v_id, auth.uid());
    end if;
  end if;
  return v_id;
end $$;

create function public.void_stock_movement(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare m record; v_balance numeric;
begin
  select * into m from public.stock_movements where id = p_id and voided_at is null;
  if not found then raise exception 'invalid_movement'; end if;
  if auth.uid() is null or not app.has_permission(m.farm_id, 'inventory.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  perform 1 from public.stock_items where id = m.item_id for update;
  select coalesce(sum(case when x.kind in ('entrada','ajuste_mais') then x.quantity else -x.quantity end), 0)
    into v_balance from public.stock_movements x where x.item_id = m.item_id and x.voided_at is null and x.id <> m.id;
  if v_balance < 0 then raise exception 'would_make_negative'; end if;
  update public.stock_movements set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
  update public.cost_entries set voided_at = now(), voided_by = auth.uid(), void_reason = 'Movimento de estoque anulado'
    where stock_movement_id = p_id and voided_at is null;
end $$;

create function public.void_cost(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.cost_entries where id = p_id and voided_at is null;
  if v_farm is null then raise exception 'invalid_cost'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'costs.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  update public.cost_entries set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;

-- Saldos (respeita a RLS de quem chama)
create function public.stock_balances(p_farm uuid)
returns table (item_id uuid, name text, unit text, category text, balance numeric, min_quantity numeric,
               avg_cost numeric, below_min boolean, active boolean)
language sql stable set search_path = '' as $$
  select t.id, t.name, t.unit, t.category, t.balance, t.min_quantity, t.avg_cost,
         (t.min_quantity > 0 and t.balance < t.min_quantity), t.active
  from (
    select i.id, i.name, i.unit, i.category, i.min_quantity, i.active,
           coalesce(sum(case when m.kind in ('entrada','ajuste_mais') then m.quantity else -m.quantity end), 0) as balance,
           (select round(sum(e.quantity * e.unit_cost) / nullif(sum(e.quantity), 0), 4) from public.stock_movements e
             where e.item_id = i.id and e.kind = 'entrada' and e.unit_cost is not null and e.voided_at is null) as avg_cost
    from public.stock_items i
    left join public.stock_movements m on m.item_id = i.id and m.voided_at is null
    where i.farm_id = p_farm
    group by i.id
  ) t
  order by t.name
$$;

create function public.stock_alerts(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  with b as (select * from public.stock_balances(p_farm)),
  exp as (
    select b.name, min(m.expiry_date) as expiry
    from b join public.stock_movements m on m.item_id = b.item_id
    where b.balance > 0 and m.kind = 'entrada' and m.voided_at is null and m.expiry_date is not null
      and m.expiry_date <= current_date + 30
    group by b.name)
  select jsonb_build_object(
    'low', (select count(*) from b where below_min and active),
    'expiring', (select count(*) from exp),
    'low_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'balance', balance, 'unit', unit, 'min', min_quantity) order by name)
                           from b where below_min and active), '[]'::jsonb),
    'expiring_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'expiry', expiry) order by expiry) from exp), '[]'::jsonb))
$$;

create function public.cost_summary(p_farm uuid, p_from date, p_to date) returns jsonb language sql stable set search_path = '' as $$
  with c as (
    select ce.category, ce.amount, ce.target_type, ce.lot_id, ce.pasture_id
    from public.cost_entries ce
    where ce.farm_id = p_farm and ce.voided_at is null and ce.cost_date between p_from and p_to)
  select jsonb_build_object(
    'total', (select coalesce(sum(amount), 0) from c),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.s) order by x.s desc)
                             from (select category, sum(amount) as s from c group by category) x), '[]'::jsonb),
    'by_target', coalesce((select jsonb_agg(jsonb_build_object('target_type', x.target_type, 'amount', x.s))
                           from (select target_type, sum(amount) as s from c group by target_type) x), '[]'::jsonb),
    'by_lot', coalesce((select jsonb_agg(jsonb_build_object('lot', y.name, 'amount', y.s, 'heads', y.heads,
                                         'per_head', case when y.heads > 0 then round(y.s / y.heads, 2) end) order by y.s desc)
                        from (select l.name, sum(c.amount) as s,
                                     (select count(*) from public.animals a where a.lot_id = l.id and a.status = 'ativo' and a.deleted_at is null) as heads
                              from c join public.lots l on l.id = c.lot_id group by l.id, l.name) y), '[]'::jsonb),
    'by_pasture', coalesce((select jsonb_agg(jsonb_build_object('pasture', z.name, 'amount', z.s) order by z.s desc)
                            from (select p.name, sum(c.amount) as s from c join public.pastures p on p.id = c.pasture_id group by p.id, p.name) z), '[]'::jsonb))
$$;

revoke execute on function public.register_stock_movement(uuid, uuid, text, numeric, date, numeric, date, text, text, uuid, text) from public, anon;
revoke execute on function public.void_stock_movement(uuid, text) from public, anon;
revoke execute on function public.void_cost(uuid, text) from public, anon;
revoke execute on function public.stock_balances(uuid) from public, anon;
revoke execute on function public.stock_alerts(uuid) from public, anon;
revoke execute on function public.cost_summary(uuid, date, date) from public, anon;
grant execute on function public.register_stock_movement(uuid, uuid, text, numeric, date, numeric, date, text, text, uuid, text) to authenticated;
grant execute on function public.void_stock_movement(uuid, text) to authenticated;
grant execute on function public.void_cost(uuid, text) to authenticated;
grant execute on function public.stock_balances(uuid) to authenticated;
grant execute on function public.stock_alerts(uuid) to authenticated;
grant execute on function public.cost_summary(uuid, date, date) to authenticated;

create trigger z_audit after insert or update on public.stock_items for each row execute function app.audit_row();
create trigger z_audit after insert or update on public.stock_movements for each row execute function app.audit_row();
create trigger z_audit after insert or update on public.cost_entries for each row execute function app.audit_row();
