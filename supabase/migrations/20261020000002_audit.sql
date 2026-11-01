-- ETAPA 1 · Bloco 2 · Auditoria somente-inserção com cadeia de hash
-- STATUS: escrito, AINDA NÃO EXECUTADO.
create table public.audit_log (
  id bigint generated always as identity primary key,
  farm_id uuid,                      -- sem FK de propósito: o rastro sobrevive à exclusão
  user_id uuid,
  occurred_at timestamptz not null,
  operation text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  changed_fields jsonb,
  source text not null,
  request_id text,
  ip text,
  user_agent text,
  prev_hash text,
  row_hash text not null
);
create index audit_log_farm_idx on public.audit_log (farm_id, id desc);
create index audit_log_table_rec_idx on public.audit_log (table_name, record_id);

create function app.audit_hash(p_prev text, p_farm uuid, p_user uuid, p_ts timestamptz, p_op text,
  p_table text, p_rid text, p_old jsonb, p_new jsonb) returns text
language sql stable set search_path = '' as $$
  select encode(extensions.digest(concat_ws('|',
    coalesce(p_prev,''), coalesce(p_farm::text,''), coalesce(p_user::text,''),
    to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    p_op, p_table, coalesce(p_rid,''), coalesce(p_old::text,''), coalesce(p_new::text,'')
  ), 'sha256'), 'hex')
$$;

create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_farm uuid; v_rid text; v_prev text; v_hash text;
  v_changed jsonb; v_hdr json; v_ts timestamptz := clock_timestamp(); v_user uuid := auth.uid();
begin
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_rid := coalesce(v_new, v_old) ->> 'id';
  v_farm := coalesce((coalesce(v_new, v_old) ->> 'farm_id')::uuid,
                     case when tg_table_name = 'farms' then (coalesce(v_new, v_old) ->> 'id')::uuid end);
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value)), '{}'::jsonb)
      into v_changed
      from jsonb_each(v_new) n
      where (v_old -> n.key) is distinct from n.value
        and n.key not in ('updated_at','updated_by','version');
    if v_changed = '{}'::jsonb then return null; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_farm::text, 'global'), 0));
  select row_hash into v_prev from public.audit_log
    where farm_id is not distinct from v_farm order by id desc limit 1;
  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;
  v_hash := app.audit_hash(v_prev, v_farm, v_user, v_ts, tg_op, tg_table_name, v_rid, v_old, v_new);
  insert into public.audit_log (farm_id, user_id, occurred_at, operation, table_name, record_id,
    old_data, new_data, changed_fields, source, request_id, ip, user_agent, prev_hash, row_hash)
  values (v_farm, v_user, v_ts, tg_op, tg_table_name, v_rid, v_old, v_new, v_changed,
    case when v_user is null then 'database' else coalesce(nullif(current_setting('app.source', true), ''), 'api') end,
    coalesce(v_hdr ->> 'x-request-id', v_hdr ->> 'sb-request-id'),
    split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1),
    v_hdr ->> 'user-agent', v_prev, v_hash);
  return null;
end $$;

create function app.audit_block_change() returns trigger language plpgsql as $$
begin raise exception 'audit_log_is_append_only' using errcode = '42501'; end $$;
create trigger audit_no_update_delete before update or delete on public.audit_log
  for each row execute function app.audit_block_change();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function app.audit_block_change();

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated
  using (farm_id is not null and app.has_permission(farm_id, 'audit.view'));

-- Retorna o id da primeira linha com a cadeia quebrada, ou NULL se a cadeia está íntegra
create function public.verify_audit_chain(p_farm uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev text := null;
begin
  if not app.has_permission(p_farm, 'audit.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in select * from public.audit_log where farm_id = p_farm order by id loop
    if r.prev_hash is distinct from v_prev
       or r.row_hash <> app.audit_hash(r.prev_hash, r.farm_id, r.user_id, r.occurred_at, r.operation,
                                       r.table_name, r.record_id, r.old_data, r.new_data) then
      return r.id;
    end if;
    v_prev := r.row_hash;
  end loop;
  return null;
end $$;
revoke execute on function public.verify_audit_chain(uuid) from public, anon;
grant execute on function public.verify_audit_chain(uuid) to authenticated;

-- Gatilhos de auditoria nas tabelas críticas
create trigger z_audit after insert or update or delete on public.organizations
  for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.farms
  for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.memberships
  for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.roles
  for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.role_permissions
  for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.field_permissions
  for each row execute function app.audit_row();
