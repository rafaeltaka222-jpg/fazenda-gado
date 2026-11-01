-- ETAPA 3 · Bloco 1 · Pesagens (lançamento manual, anulação, resumo de peso)
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO (Bloco 2): importador configurável, layouts, prévia e histórico de importações (import_batch_id já reservado).

create table public.weighings (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  animal_id uuid not null,
  weighed_at timestamptz not null,
  weight_kg numeric(7,2) not null check (weight_kg > 0 and weight_kg <= 2000),
  source text not null default 'manual' check (source in ('manual','importacao','api')),
  device_id text not null default '',
  import_batch_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, animal_id) references public.animals (farm_id, id)
);
-- Não duplica a mesma pesagem (mesmo animal, instante e dispositivo) entre as válidas
create unique index weighings_dedupe_uq on public.weighings (animal_id, weighed_at, device_id) where voided_at is null;
create index weighings_animal_idx on public.weighings (animal_id, weighed_at desc);
create index weighings_farm_idx on public.weighings (farm_id, weighed_at desc);

-- Imutável: a única alteração permitida é a anulação (feita pela função void_weighing)
create function app.weighings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'immutable_table' using errcode = '42501'; end if;
  if old.voided_at is not null
     or (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
        is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'immutable_table' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger weighings_guard before update or delete on public.weighings
  for each row execute function app.weighings_guard();
create trigger weighings_no_truncate before truncate on public.weighings
  for each statement execute function app.block_change();

revoke all on public.weighings from anon, authenticated;
grant select on public.weighings to authenticated;
alter table public.weighings enable row level security;
create policy weighings_select on public.weighings for select to authenticated
  using (app.has_permission(farm_id, 'weighings.view'));

-- Lançamento de uma ou várias pesagens, em uma única transação.
-- p_items: [{"animal_id": "...", "weighed_at": "2026-09-01T08:00:00-03:00", "weight_kg": 412.5, "notes": "...", "device_id": "..."}]
-- Retorna {"inserted": n, "warnings": [{"animal_id","ear_tag","message":"variacao_brusca"}]}
create function public.register_weighings(p_farm uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb; v_animal record; v_prev numeric; v_w numeric; v_at timestamptz;
  v_count integer := 0; v_warn jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'weighings.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid_batch_size';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_w := round((v_item ->> 'weight_kg')::numeric, 2);
    v_at := (v_item ->> 'weighed_at')::timestamptz;
    if v_w is null or v_w <= 0 or v_w > 2000 then raise exception 'invalid_weight'; end if;
    if v_at is null or v_at > now() then raise exception 'invalid_date'; end if;
    select id, ear_tag into v_animal from public.animals
      where id = (v_item ->> 'animal_id')::uuid and farm_id = p_farm
        and deleted_at is null and status = 'ativo'
      for update;
    if not found then raise exception 'invalid_animals'; end if;
    select weight_kg into v_prev from public.weighings
      where animal_id = v_animal.id and voided_at is null and weighed_at < v_at
      order by weighed_at desc limit 1;
    if v_prev is not null and abs(v_w - v_prev) / v_prev > 0.30 then
      v_warn := v_warn || jsonb_build_array(jsonb_build_object(
        'animal_id', v_animal.id, 'ear_tag', v_animal.ear_tag, 'message', 'variacao_brusca'));
    end if;
    insert into public.weighings (farm_id, animal_id, weighed_at, weight_kg, source, device_id, notes, created_by)
    values (p_farm, v_animal.id, v_at, v_w, 'manual',
            coalesce(nullif(trim(v_item ->> 'device_id'), ''), ''),
            nullif(trim(v_item ->> 'notes'), ''), auth.uid());
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('inserted', v_count, 'warnings', v_warn);
end $$;
revoke execute on function public.register_weighings(uuid, jsonb) from public, anon;
grant execute on function public.register_weighings(uuid, jsonb) to authenticated;

-- Anulação (estorno): a pesagem continua no histórico, mas deixa de contar nos cálculos
create function public.void_weighing(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.weighings where id = p_id and voided_at is null;
  if v_farm is null then raise exception 'invalid_weighing'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'weighings.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  update public.weighings set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;
revoke execute on function public.void_weighing(uuid, text) from public, anon;
grant execute on function public.void_weighing(uuid, text) to authenticated;

-- Última e penúltima pesagem válidas por animal (respeita a RLS de quem chama)
create function public.animal_weight_summary(p_animal_ids uuid[])
returns table (animal_id uuid, last_weight numeric, last_at timestamptz, prev_weight numeric, prev_at timestamptz)
language sql stable set search_path = '' as $$
  select t.animal_id,
         max(t.weight_kg) filter (where t.rn = 1), max(t.weighed_at) filter (where t.rn = 1),
         max(t.weight_kg) filter (where t.rn = 2), max(t.weighed_at) filter (where t.rn = 2)
  from (select w.animal_id, w.weight_kg, w.weighed_at,
               row_number() over (partition by w.animal_id order by w.weighed_at desc) as rn
        from public.weighings w
        where w.animal_id = any(p_animal_ids) and w.voided_at is null) t
  where t.rn <= 2
  group by t.animal_id
$$;
revoke execute on function public.animal_weight_summary(uuid[]) from public, anon;
grant execute on function public.animal_weight_summary(uuid[]) to authenticated;

create trigger z_audit after insert or update on public.weighings for each row execute function app.audit_row();
