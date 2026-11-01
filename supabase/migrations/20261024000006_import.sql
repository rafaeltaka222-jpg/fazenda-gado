-- ETAPA 3 · Bloco 2 · Importador de pesagens (TXT/CSV) com layout configurável, prévia e histórico
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: Excel/JSON/XML, correção de data na prévia, conexão direta com balança (depende de arquivo/manual da Coimma KM-3).

create table public.import_layouts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  delimiter text not null default 'ponto_e_virgula' check (delimiter in ('ponto_e_virgula','virgula','tab','barra','espaco')),
  has_header boolean not null default true,
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY','DD-MM-YYYY','YYYY-MM-DD','MM/DD/YYYY')),
  decimal_separator text not null default ',' check (decimal_separator in (',','.')),
  col_animal integer not null default 1 check (col_animal between 1 and 50),
  col_date integer not null default 2 check (col_date between 1 and 50),
  col_time integer check (col_time is null or col_time between 1 and 50),
  col_weight integer not null default 4 check (col_weight between 1 and 50),
  default_time time not null default '12:00',
  device_name text not null default '',
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (farm_id, id),
  check (col_animal <> col_date and col_animal <> col_weight and col_date <> col_weight
         and (col_time is null or col_time not in (col_animal, col_date, col_weight)))
);
create unique index import_layouts_name_uq on public.import_layouts (farm_id, lower(name));
create trigger import_layouts_created before insert on public.import_layouts for each row execute function app.set_created();
create trigger import_layouts_touch before update on public.import_layouts for each row execute function app.touch();

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  layout_id uuid not null,
  device_id text not null default '',
  file_name text not null,
  file_hash text not null,
  status text not null default 'previa' check (status in ('previa','confirmado','cancelado')),
  total_rows integer not null default 0, ok_rows integer not null default 0, warn_rows integer not null default 0,
  error_rows integer not null default 0, dup_rows integer not null default 0, imported_rows integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  confirmed_at timestamptz, confirmed_by uuid,
  unique (farm_id, id),
  foreign key (farm_id, layout_id) references public.import_layouts (farm_id, id)
);
create index import_batches_farm_idx on public.import_batches (farm_id, created_at desc);
create index import_batches_hash_idx on public.import_batches (farm_id, file_hash);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  farm_id uuid not null references public.farms(id),
  line_no integer not null,
  raw text,
  ear_tag text,
  animal_id uuid,
  weighed_at timestamptz,
  weight_kg numeric,
  status text not null check (status in ('ok','aviso','erro','duplicada','ignorada','importada')),
  message text
);
create index import_rows_batch_idx on public.import_rows (batch_id, line_no);

alter table public.weighings
  add constraint weighings_import_batch_fk foreign key (import_batch_id) references public.import_batches(id);

-- Validação de uma linha (usada na prévia e de novo na confirmação)
create function app.import_check(p_farm uuid, p_tag text, p_at timestamptz, p_w numeric,
                                 p_device text, p_batch uuid, p_row uuid)
returns table (r_animal_id uuid, r_status text, r_message text)
language plpgsql security definer set search_path = '' as $$
declare v_animal record; v_prev numeric;
begin
  if p_tag is null or trim(p_tag) = '' then
    return query select null::uuid, 'erro'::text, 'Brinco não informado'::text; return;
  end if;
  if p_at is null then
    return query select null::uuid, 'erro'::text, 'Data ou hora inválida'::text; return;
  end if;
  if p_w is null or p_w <= 0 or p_w > 2000 then
    return query select null::uuid, 'erro'::text, 'Peso inválido (deve ser maior que zero e até 2000 kg)'::text; return;
  end if;
  if p_at > now() then
    return query select null::uuid, 'erro'::text, 'Data futura'::text; return;
  end if;
  select a.id as id, a.status as st into v_animal
    from public.animals a where a.farm_id = p_farm and a.ear_tag = trim(p_tag) and a.deleted_at is null;
  if not found then
    return query select null::uuid, 'erro'::text, ('Animal ' || trim(p_tag) || ' não encontrado')::text; return;
  end if;
  if v_animal.st <> 'ativo' then
    return query select v_animal.id, 'erro'::text, ('Animal ' || trim(p_tag) || ' não está ativo')::text; return;
  end if;
  if exists (select 1 from public.weighings w
             where w.animal_id = v_animal.id and w.weighed_at = p_at and w.device_id = p_device and w.voided_at is null) then
    return query select v_animal.id, 'duplicada'::text, 'Pesagem já registrada; será ignorada'::text; return;
  end if;
  if exists (select 1 from public.import_rows ir
             where ir.batch_id = p_batch and ir.id <> p_row and ir.animal_id = v_animal.id
               and ir.weighed_at = p_at and ir.status in ('ok','aviso','importada')) then
    return query select v_animal.id, 'erro'::text, 'Duplicada no próprio arquivo'::text; return;
  end if;
  -- Pesagem anterior: já gravada no banco ou lida antes, no mesmo arquivo
  select t.kg into v_prev from (
    select w.weight_kg as kg, w.weighed_at as ts from public.weighings w
      where w.animal_id = v_animal.id and w.voided_at is null and w.weighed_at < p_at
    union all
    select ir.weight_kg, ir.weighed_at from public.import_rows ir
      where ir.batch_id = p_batch and ir.id <> p_row and ir.animal_id = v_animal.id
        and ir.weighed_at < p_at and ir.status in ('ok','aviso','importada')
  ) t order by t.ts desc limit 1;
  if v_prev is not null and abs(p_w - v_prev) / v_prev > 0.30 then
    return query select v_animal.id, 'aviso'::text, ('Variação brusca (anterior: ' || v_prev || ' kg)')::text; return;
  end if;
  return query select v_animal.id, 'ok'::text, null::text;
end $$;

-- Etapa 1: leitura do arquivo (feita pela aplicação) -> linhas na área de prévia
-- p_rows: [{"line":2,"raw":"...","ear_tag":"000123","weighed_at":"2026-10-20T08:32:00-03:00","weight_kg":425,"parse_error":null}]
create function public.stage_import(p_farm uuid, p_layout uuid, p_file_name text, p_file_hash text, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_layout record; v_batch uuid := gen_random_uuid(); v_item jsonb; v_id uuid; v_tag text;
  v_at timestamptz; v_w numeric; v_animal uuid; v_status text; v_msg text; v_chk record;
  c_ok integer := 0; c_warn integer := 0; c_err integer := 0; c_dup integer := 0; c_total integer := 0;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'imports.import') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select l.id as id, l.device_name as device_name into v_layout
    from public.import_layouts l where l.id = p_layout and l.farm_id = p_farm;
  if not found then raise exception 'invalid_layout'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'invalid_rows';
  end if;
  insert into public.import_batches (id, farm_id, layout_id, device_id, file_name, file_hash, created_by)
  values (v_batch, p_farm, p_layout, v_layout.device_name, left(coalesce(p_file_name, ''), 200), p_file_hash, auth.uid());

  for v_item in select * from jsonb_array_elements(p_rows) loop
    v_id := gen_random_uuid();
    v_tag := nullif(trim(v_item ->> 'ear_tag'), '');
    v_at := nullif(v_item ->> 'weighed_at', '')::timestamptz;
    v_w := nullif(v_item ->> 'weight_kg', '')::numeric;
    v_animal := null;
    if nullif(v_item ->> 'parse_error', '') is not null then
      v_status := 'erro'; v_msg := v_item ->> 'parse_error';
    else
      select * into v_chk from app.import_check(p_farm, v_tag, v_at, v_w, v_layout.device_name, v_batch, v_id);
      v_animal := v_chk.r_animal_id; v_status := v_chk.r_status; v_msg := v_chk.r_message;
    end if;
    insert into public.import_rows (id, batch_id, farm_id, line_no, raw, ear_tag, animal_id, weighed_at, weight_kg, status, message)
    values (v_id, v_batch, p_farm, (v_item ->> 'line')::integer, left(v_item ->> 'raw', 500), v_tag, v_animal, v_at, v_w, v_status, v_msg);
    c_total := c_total + 1;
    if v_status = 'ok' then c_ok := c_ok + 1;
    elsif v_status = 'aviso' then c_warn := c_warn + 1;
    elsif v_status = 'duplicada' then c_dup := c_dup + 1;
    else c_err := c_err + 1; end if;
  end loop;

  update public.import_batches
    set total_rows = c_total, ok_rows = c_ok, warn_rows = c_warn, error_rows = c_err, dup_rows = c_dup
    where id = v_batch;
  return v_batch;
end $$;

-- Etapa 2: confirmação. Tudo ou nada: se sobrar linha com erro sem decisão, nada é gravado.
-- p_overrides: [{"row_id":"...","ignore":true}] ou [{"row_id":"...","ear_tag":"000789","weight_kg":410}]
create function public.commit_import(p_batch uuid, p_overrides jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b record; r record; o jsonb; v record; v_ign boolean; v_tag text; v_w numeric;
  v_imported integer := 0; v_ignored integer := 0; v_dups integer := 0; v_pending integer := 0;
begin
  select * into b from public.import_batches where id = p_batch for update;
  if not found then raise exception 'invalid_batch'; end if;
  if auth.uid() is null or not app.has_permission(b.farm_id, 'imports.import') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if b.status <> 'previa' then raise exception 'batch_not_pending'; end if;

  for r in select * from public.import_rows where batch_id = p_batch order by line_no loop
    select x into o from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) x where x ->> 'row_id' = r.id::text limit 1;
    v_ign := coalesce((o ->> 'ignore')::boolean, false);
    if v_ign then
      update public.import_rows set status = 'ignorada' where id = r.id;
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_tag := coalesce(nullif(trim(o ->> 'ear_tag'), ''), r.ear_tag);
    v_w := coalesce(nullif(o ->> 'weight_kg', '')::numeric, r.weight_kg);
    select * into v from app.import_check(b.farm_id, v_tag, r.weighed_at, v_w, b.device_id, p_batch, r.id);
    if v.r_status = 'duplicada' then
      update public.import_rows set status = 'duplicada', animal_id = v.r_animal_id, message = v.r_message where id = r.id;
      v_dups := v_dups + 1;
    elsif v.r_status = 'erro' then
      update public.import_rows set status = 'erro', message = v.r_message where id = r.id;
      v_pending := v_pending + 1;
    else
      insert into public.weighings (farm_id, animal_id, weighed_at, weight_kg, source, device_id, import_batch_id, created_by)
      values (b.farm_id, v.r_animal_id, r.weighed_at, round(v_w, 2), 'importacao', b.device_id, p_batch, auth.uid());
      update public.import_rows
        set status = 'importada', animal_id = v.r_animal_id, ear_tag = v_tag, weight_kg = v_w
        where id = r.id;
      v_imported := v_imported + 1;
    end if;
  end loop;

  if v_pending > 0 then raise exception 'rows_pending'; end if;

  update public.import_batches
    set status = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid(), imported_rows = v_imported
    where id = p_batch;
  return jsonb_build_object('imported', v_imported, 'ignored', v_ignored, 'duplicates', v_dups);
end $$;

create function public.cancel_import(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.import_batches where id = p_batch and status = 'previa';
  if v_farm is null then raise exception 'invalid_batch'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'imports.import') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.import_batches set status = 'cancelado' where id = p_batch;
end $$;

revoke execute on function public.stage_import(uuid, uuid, text, text, jsonb) from public, anon;
revoke execute on function public.commit_import(uuid, jsonb) from public, anon;
revoke execute on function public.cancel_import(uuid) from public, anon;
grant execute on function public.stage_import(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.commit_import(uuid, jsonb) to authenticated;
grant execute on function public.cancel_import(uuid) to authenticated;

-- Privilégios e RLS
revoke all on public.import_layouts, public.import_batches, public.import_rows from anon;
revoke insert, update, delete, truncate on public.import_layouts, public.import_batches, public.import_rows from authenticated;
grant insert (farm_id, name, delimiter, has_header, date_format, decimal_separator, col_animal, col_date,
              col_time, col_weight, default_time, device_name) on public.import_layouts to authenticated;
grant update (name, delimiter, has_header, date_format, decimal_separator, col_animal, col_date,
              col_time, col_weight, default_time, device_name) on public.import_layouts to authenticated;

alter table public.import_layouts enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

create policy layouts_select on public.import_layouts for select to authenticated using (app.has_permission(farm_id, 'imports.view'));
create policy layouts_insert on public.import_layouts for insert to authenticated with check (app.has_permission(farm_id, 'imports.create'));
create policy layouts_update on public.import_layouts for update to authenticated
  using (app.has_permission(farm_id, 'imports.update')) with check (app.has_permission(farm_id, 'imports.update'));
create policy batches_select on public.import_batches for select to authenticated using (app.has_permission(farm_id, 'imports.view'));
create policy rows_select on public.import_rows for select to authenticated using (app.has_permission(farm_id, 'imports.view'));

create trigger z_audit after insert or update or delete on public.import_layouts for each row execute function app.audit_row();
create trigger z_audit after insert or update on public.import_batches for each row execute function app.audit_row();
