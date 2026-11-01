-- LOTE 2 · Bloco E · API pública v1: chaves com escopo, limite de taxa, idempotência
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- A chave em texto nunca é guardada: só o hash SHA-256. As funções api_* são chamadas pela aplicação (rotas /api/v1) com a chave anônima.
-- TODO: webhooks de saída (precisam de um processo de envio agendado), limpeza das tabelas de taxa e idempotência,
-- limite por IP para chaves inválidas, campos personalizados na API, mais recursos (lotes, pastos, movimentações).

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['read','write_weighings']),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid
);
create table public.api_rate (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (key_id, bucket)
);
create table public.api_idempotency (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  idem_key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (key_id, idem_key)
);

revoke all on public.api_keys, public.api_rate, public.api_idempotency from anon, authenticated;
grant select on public.api_keys to authenticated;
alter table public.api_keys enable row level security;
alter table public.api_rate enable row level security;
alter table public.api_idempotency enable row level security;
create policy api_keys_select on public.api_keys for select to authenticated using (app.has_permission(farm_id, 'settings.update'));
create trigger z_audit after insert or update on public.api_keys for each row execute function app.audit_row();

create function public.create_api_key(p_farm uuid, p_name text, p_scopes text[], p_prefix text, p_hash text, p_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'settings.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hash'; end if;
  insert into public.api_keys (farm_id, name, key_prefix, key_hash, scopes, expires_at, created_by)
  values (p_farm, trim(p_name), left(p_prefix, 12), p_hash, p_scopes,
          case when p_days is not null and p_days > 0 then now() + make_interval(days => p_days) end, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.revoke_api_key(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.api_keys where id = p_id and revoked_at is null;
  if v_farm is null then raise exception 'invalid_key'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'settings.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = now() where id = p_id;
end $$;
revoke execute on function public.create_api_key(uuid, text, text[], text, text, integer) from public, anon;
revoke execute on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(uuid, text, text[], text, text, integer) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- Autenticação da chave, escopo e limite de 120 requisições por minuto
create function app.api_auth(p_hash text, p_scope text) returns table (r_key uuid, r_farm uuid, r_name text)
language plpgsql security definer set search_path = '' as $$
declare k record; v_n integer;
begin
  select ak.id as id, ak.farm_id as farm_id, ak.name as name, ak.scopes as scopes, ak.revoked_at as revoked_at, ak.expires_at as expires_at
    into k from public.api_keys ak where ak.key_hash = p_hash;
  if not found or k.revoked_at is not null or (k.expires_at is not null and k.expires_at < now()) then
    raise exception 'invalid_key' using errcode = '28000';
  end if;
  if not (p_scope = any(k.scopes)) then raise exception 'insufficient_scope' using errcode = '42501'; end if;
  insert into public.api_rate as r (key_id, bucket, n) values (k.id, date_trunc('minute', now()), 1)
    on conflict (key_id, bucket) do update set n = r.n + 1 returning r.n into v_n;
  if v_n > 120 then raise exception 'rate_limited' using errcode = 'P0429'; end if;
  update public.api_keys set last_used_at = now()
    where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return query select k.id, k.farm_id, k.name;
end $$;

create function public.api_list_animals(p_hash text, p_status text default null, p_limit integer default 50, p_after text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth record; v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); v_out jsonb;
begin
  select * into v_auth from app.api_auth(p_hash, 'read');
  if p_status is not null and p_status not in ('ativo','vendido','morto','transferido') then raise exception 'invalid_status'; end if;
  with q as (
    select a.id, a.ear_tag, a.name, a.sex, a.status, a.birth_date, a.entry_date, a.exit_date, a.origin,
           b.name as breed, c.name as category, l.name as lot, p.name as pasture,
           w.weight_kg as last_weight, w.weighed_at as last_weighed_at
    from public.animals a
    left join public.breeds b on b.id = a.breed_id
    left join public.categories c on c.id = a.category_id
    left join public.lots l on l.id = a.lot_id
    left join public.pastures p on p.id = a.pasture_id
    left join lateral (select x.weight_kg, x.weighed_at from public.weighings x
                       where x.animal_id = a.id and x.voided_at is null order by x.weighed_at desc limit 1) w on true
    where a.farm_id = v_auth.r_farm and a.deleted_at is null
      and (p_status is null or a.status = p_status) and (p_after is null or a.ear_tag > p_after)
    order by a.ear_tag limit v_lim + 1)
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(to_jsonb(x) order by x.ear_tag) from (select * from q order by ear_tag limit v_lim) x), '[]'::jsonb),
    'next_cursor', case when (select count(*) from q) > v_lim then (select ear_tag from q order by ear_tag offset v_lim - 1 limit 1) end)
  into v_out;
  return v_out;
end $$;

create function public.api_get_animal(p_hash text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_auth record; v_out jsonb;
begin
  select * into v_auth from app.api_auth(p_hash, 'read');
  select to_jsonb(t) into v_out from (
    select a.id, a.ear_tag, a.name, a.sex, a.status, a.birth_date, a.entry_date, a.exit_date, a.origin,
           b.name as breed, c.name as category, l.name as lot, p.name as pasture
    from public.animals a
    left join public.breeds b on b.id = a.breed_id
    left join public.categories c on c.id = a.category_id
    left join public.lots l on l.id = a.lot_id
    left join public.pastures p on p.id = a.pasture_id
    where a.id = p_id and a.farm_id = v_auth.r_farm and a.deleted_at is null) t;
  if v_out is null then raise exception 'not_found' using errcode = 'P0404'; end if;
  return v_out;
end $$;

create function public.api_list_weighings(p_hash text, p_ear_tag text default null, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_auth record; v_out jsonb;
begin
  select * into v_auth from app.api_auth(p_hash, 'read');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.weighed_at desc), '[]'::jsonb) into v_out from (
    select a.ear_tag, w.weighed_at, w.weight_kg, w.source, w.device_id
    from public.weighings w join public.animals a on a.id = w.animal_id
    where w.farm_id = v_auth.r_farm and w.voided_at is null and (p_ear_tag is null or a.ear_tag = p_ear_tag)
    order by w.weighed_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) t;
  return jsonb_build_object('data', v_out);
end $$;

-- p_items: [{"ear_tag":"000123","weighed_at":"2026-10-20T08:32:00-03:00","weight_kg":425,"device_id":"balanca-1","notes":""}]
create function public.api_register_weighings(p_hash text, p_items jsonb, p_idem text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_auth record; v_item jsonb; v_animal record; v_prev numeric; v_w numeric; v_at timestamptz;
  v_count integer := 0; v_warn jsonb := '[]'::jsonb; v_resp jsonb; v_old jsonb;
begin
  select * into v_auth from app.api_auth(p_hash, 'write_weighings');
  if p_idem is not null then
    if length(p_idem) > 100 then raise exception 'invalid_idempotency_key'; end if;
    select response into v_old from public.api_idempotency where key_id = v_auth.r_key and idem_key = p_idem;
    if found then return v_old || jsonb_build_object('replayed', true); end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'invalid_batch_size';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_w := round((v_item ->> 'weight_kg')::numeric, 2);
    v_at := (v_item ->> 'weighed_at')::timestamptz;
    if v_w is null or v_w <= 0 or v_w > 2000 then raise exception 'invalid_weight'; end if;
    if v_at is null or v_at > now() then raise exception 'invalid_date'; end if;
    select a.id as id, a.ear_tag as ear_tag into v_animal from public.animals a
      where a.farm_id = v_auth.r_farm and a.ear_tag = trim(v_item ->> 'ear_tag') and a.deleted_at is null and a.status = 'ativo'
      for update;
    if not found then raise exception 'invalid_animals'; end if;
    select w.weight_kg into v_prev from public.weighings w
      where w.animal_id = v_animal.id and w.voided_at is null and w.weighed_at < v_at order by w.weighed_at desc limit 1;
    if v_prev is not null and abs(v_w - v_prev) / v_prev > 0.30 then
      v_warn := v_warn || jsonb_build_array(jsonb_build_object('ear_tag', v_animal.ear_tag, 'message', 'variacao_brusca'));
    end if;
    insert into public.weighings (farm_id, animal_id, weighed_at, weight_kg, source, device_id, notes)
    values (v_auth.r_farm, v_animal.id, v_at, v_w, 'api',
            coalesce(nullif(trim(v_item ->> 'device_id'), ''), v_auth.r_name), nullif(trim(v_item ->> 'notes'), ''));
    v_count := v_count + 1;
  end loop;
  v_resp := jsonb_build_object('inserted', v_count, 'warnings', v_warn);
  if p_idem is not null then insert into public.api_idempotency (key_id, idem_key, response) values (v_auth.r_key, p_idem, v_resp); end if;
  return v_resp;
end $$;

revoke execute on function public.api_list_animals(text, text, integer, text) from public;
revoke execute on function public.api_get_animal(text, uuid) from public;
revoke execute on function public.api_list_weighings(text, text, integer) from public;
revoke execute on function public.api_register_weighings(text, jsonb, text) from public;
grant execute on function public.api_list_animals(text, text, integer, text) to anon, authenticated;
grant execute on function public.api_get_animal(text, uuid) to anon, authenticated;
grant execute on function public.api_list_weighings(text, text, integer) to anon, authenticated;
grant execute on function public.api_register_weighings(text, jsonb, text) to anon, authenticated;
