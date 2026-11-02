-- LOTE 4 · Estorno auditado de vendas comerciais (void_sale) com reativação automática dos animais no rebanho

alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

drop trigger if exists sales_immutable on public.sales;

create or replace function app.sales_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'immutable_table' using errcode = '42501'; end if;
  if old.voided_at is not null
     or (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
        is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'immutable_table' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger sales_guard before update or delete on public.sales
  for each row execute function app.sales_guard();

drop trigger if exists z_audit on public.sales;
create trigger z_audit after insert or update on public.sales
  for each row execute function app.audit_row();

create or replace function public.void_sale(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_farm uuid;
  v_batch uuid := gen_random_uuid();
begin
  select farm_id into v_farm from public.sales where id = p_id and voided_at is null for update;
  if v_farm is null then raise exception 'invalid_sale'; end if;
  if auth.uid() is null or not (app.has_permission(v_farm, 'trade.update') or app.has_permission(v_farm, 'trade.delete')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;

  update public.sales
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_id;

  -- Registra evento de retorno ao rebanho ativo na trilha imutável de eventos do animal
  insert into public.animal_events (farm_id, animal_id, event_type, event_date, batch_id, details, created_by)
  select a.farm_id, a.id, 'entrada', current_date, v_batch,
         jsonb_strip_nulls(jsonb_build_object(
           'to_lot_id', a.lot_id,
           'to_pasture_id', a.pasture_id,
           'notes', 'Estorno comercial: ' || trim(p_reason),
           'voided_sale_id', p_id
         )),
         auth.uid()
  from public.animals a
  join public.sale_items si on si.animal_id = a.id and si.sale_id = p_id
  where a.farm_id = v_farm and a.status = 'vendido';

  -- Reativa os animais vinculados à venda estornada
  update public.animals a
  set status = 'ativo', exit_date = null
  from public.sale_items si
  where si.sale_id = p_id and si.animal_id = a.id and a.farm_id = v_farm and a.status = 'vendido';
end $$;

revoke execute on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated;

create or replace function public.sales_summary(p_farm uuid, p_from date, p_to date) returns jsonb language sql stable set search_path = '' as $$
  with s as (
    select * from public.sales
    where farm_id = p_farm and voided_at is null and sale_date between p_from and p_to
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(total_amount), 0) from s),
    'sales', (select count(*) from s),
    'animals', (select coalesce(sum(animal_count), 0) from s),
    'avg_per_head', (select case when sum(animal_count) > 0 then round(sum(total_amount) / sum(animal_count), 2) end from s),
    'by_buyer', coalesce((select jsonb_agg(jsonb_build_object('buyer', y.name, 'amount', y.t) order by y.t desc)
                          from (select coalesce(pe.name, 'Sem comprador informado') as name, sum(s.total_amount) as t
                                from s left join public.people pe on pe.id = s.buyer_id group by 1) y), '[]'::jsonb))
$$;
