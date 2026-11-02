-- =============================================================================
-- JR COMERCIO E EXPORTACAO DE CAFE - SETUP COMPLETO SUPABASE CLOUD
-- Projeto: tyghcaaemyttafwrdrhv
-- =============================================================================

-- >>> MIGRATION: 20261020000001_core.sql
-- ETAPA 1 · Bloco 1 · Núcleo: organizações, fazendas, perfis, permissões, vínculos e RLS
-- STATUS: escrito, AINDA NÃO EXECUTADO (sem banco disponível no ambiente de geração).
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;

-- ---------- Tabelas ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  legal_name text, tax_id text, state_registration text,
  address text, city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  latitude numeric(9,6), longitude numeric(9,6),
  area_ha numeric(12,2) check (area_ha is null or area_ha >= 0),
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid,
  version integer not null default 1,
  unique (organization_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key,
  resource text not null,
  action text not null,
  description text
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_system = (organization_id is null))
);
create unique index roles_name_uq on public.roles
  (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key),
  primary key (role_id, permission_key)
);

create table public.field_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  entity text not null,
  field_key text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  unique (role_id, entity, field_key),
  check (can_view or not can_edit)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  unique (user_id, farm_id)
);
create index memberships_farm_idx on public.memberships (farm_id);

-- ---------- Catálogo de permissões e perfis iniciais ----------
insert into public.permissions (key, resource, action, description)
select r || '.' || a, r, a, r || ' · ' || a
from unnest(array['farms','users','roles','animals','lots','pastures','movements','weighings','imports','reports','settings']) r
cross join unnest(array['view','create','update','delete','export','print','import']) a
on conflict do nothing;
insert into public.permissions (key, resource, action, description) values
  ('audit.view','audit','view','Consultar auditoria'),
  ('reports.builder','reports','builder','Usar o gerador de relatórios')
on conflict do nothing;

insert into public.roles (name, description, is_system) values
  ('administrador','Acesso total', true),
  ('gerente','Gestão da fazenda, sem administrar perfis', true),
  ('veterinario','Rebanho, pesagens e manejo', true),
  ('zootecnista','Rebanho, pesagens e manejo', true),
  ('funcionario','Consulta e lançamentos básicos', true),
  ('operador','Consulta e lançamentos básicos', true),
  ('visualizacao','Somente consulta', true)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on (
     r.name = 'administrador'
  or (r.name = 'gerente' and (p.resource <> 'roles' or p.action = 'view') and p.key not in ('users.delete','farms.delete'))
  or (r.name in ('veterinario','zootecnista')
      and p.resource in ('animals','weighings','movements','lots','pastures')
      and p.action in ('view','create','update','print','export'))
  or (r.name in ('funcionario','operador')
      and p.resource in ('animals','weighings','movements') and p.action in ('view','create'))
  or (r.name = 'visualizacao' and p.action = 'view' and p.key <> 'audit.view')
)
where r.is_system
on conflict do nothing;

-- ---------- Funções auxiliares (security definer evita recursão de RLS) ----------
create function app.user_farm_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select farm_id from public.memberships where user_id = auth.uid() and status = 'active'
$$;

create function app.user_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select f.organization_id from public.farms f
  join public.memberships m on m.farm_id = f.id
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create function app.has_permission(p_farm uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.user_id = auth.uid() and m.farm_id = p_farm
      and m.status = 'active' and rp.permission_key = p_perm)
$$;

create function app.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end $$;
create trigger farms_touch before update on public.farms
  for each row execute function app.touch();

create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Proteções de vínculo: último administrador e escalada de privilégios
create function app.memberships_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid;
begin
  select id into v_admin from public.roles where is_system and name = 'administrador';
  if tg_op in ('UPDATE','DELETE') and old.role_id = v_admin and old.status = 'active' then
    if tg_op = 'DELETE' or new.role_id <> old.role_id or new.status <> 'active' then
      if not exists (select 1 from public.memberships m
                     where m.farm_id = old.farm_id and m.id <> old.id
                       and m.role_id = v_admin and m.status = 'active') then
        raise exception 'last_admin' using errcode = 'P0001';
      end if;
    end if;
  end if;
  -- O primeiro vínculo de uma fazenda (criado só pela função de bootstrap) não tem quem conceda;
  -- a partir do segundo, o autor só concede perfis cujas permissões ele mesmo possui.
  if tg_op in ('INSERT','UPDATE') and auth.uid() is not null
     and exists (select 1 from public.memberships m0 where m0.farm_id = new.farm_id) then
    if exists (
      select 1 from public.role_permissions rp
      where rp.role_id = new.role_id
        and not exists (
          select 1 from public.memberships m
          join public.role_permissions r2 on r2.role_id = m.role_id
          where m.user_id = auth.uid() and m.farm_id = new.farm_id
            and m.status = 'active' and r2.permission_key = rp.permission_key)
    ) then
      raise exception 'privilege_escalation' using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger a_memberships_guard before insert or update or delete on public.memberships
  for each row execute function app.memberships_guard();

-- Criação da primeira organização + fazenda (o usuário vira administrador)
create function public.create_organization_with_farm(p_org_name text, p_farm_code text, p_farm_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_farm uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select id into v_admin from public.roles where is_system and name = 'administrador';
  insert into public.organizations (name, created_by) values (p_org_name, auth.uid()) returning id into v_org;
  insert into public.farms (organization_id, code, name, created_by)
    values (v_org, p_farm_code, p_farm_name, auth.uid()) returning id into v_farm;
  insert into public.memberships (user_id, farm_id, role_id) values (auth.uid(), v_farm, v_admin);
  return v_farm;
end $$;

-- ---------- Privilégios (mínimo necessário) ----------
revoke all on public.organizations, public.farms, public.profiles, public.permissions, public.roles,
  public.role_permissions, public.field_permissions, public.memberships from anon;
revoke insert, update, delete, truncate on public.organizations, public.permissions, public.roles,
  public.role_permissions, public.field_permissions from authenticated;
revoke insert, delete, truncate on public.farms from authenticated;
revoke update on public.farms from authenticated;
grant update (code, name, legal_name, tax_id, state_registration, address, city, state,
              latitude, longitude, area_ha, notes) on public.farms to authenticated;
revoke update on public.memberships from authenticated;
grant update (role_id, status) on public.memberships to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke truncate on public.memberships, public.profiles from authenticated;

revoke execute on function public.create_organization_with_farm(text,text,text) from public, anon;
grant execute on function public.create_organization_with_farm(text,text,text) to authenticated;
grant usage on schema app to authenticated;
grant execute on function app.user_farm_ids(), app.user_org_ids(), app.has_permission(uuid, text) to authenticated;

-- ---------- Row-Level Security ----------
alter table public.organizations enable row level security;
alter table public.farms enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.field_permissions enable row level security;
alter table public.memberships enable row level security;

create policy org_select on public.organizations for select to authenticated
  using (id in (select app.user_org_ids()));
create policy farm_select on public.farms for select to authenticated
  using (id in (select app.user_farm_ids()) and deleted_at is null);
create policy farm_update on public.farms for update to authenticated
  using (app.has_permission(id, 'farms.update'))
  with check (app.has_permission(id, 'farms.update'));
create policy profile_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profile_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perm_select on public.permissions for select to authenticated using (true);
create policy role_select on public.roles for select to authenticated
  using (is_system or organization_id in (select app.user_org_ids()));
create policy roleperm_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and (r.is_system or r.organization_id in (select app.user_org_ids()))));
create policy fieldperm_select on public.field_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and (r.is_system or r.organization_id in (select app.user_org_ids()))));
create policy member_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.has_permission(farm_id, 'users.view'));
create policy member_insert on public.memberships for insert to authenticated
  with check (app.has_permission(farm_id, 'users.create'));
create policy member_update on public.memberships for update to authenticated
  using (app.has_permission(farm_id, 'users.update'))
  with check (app.has_permission(farm_id, 'users.update'));
create policy member_delete on public.memberships for delete to authenticated
  using (app.has_permission(farm_id, 'users.delete'));


-- >>> MIGRATION: 20261020000002_audit.sql
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


-- >>> MIGRATION: 20261021000003_herd.sql
-- ETAPA 2 · Bloco 1 · Estrutura (lotes, pastos), catálogos (raças, categorias) e animais
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO (Bloco 2): eventos de movimentação (animal_events) e histórico; hoje o histórico fica só na auditoria.
-- TODO: identificadores eletrônicos/SISBOV (tabela animal_identifiers), exclusão lógica por função, campos personalizados.

create table public.breeds (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (farm_id, id), unique (farm_id, name)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (farm_id, id), unique (farm_id, name)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'ativo' check (status in ('ativo','encerrado')),
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid,
  version integer not null default 1,
  unique (farm_id, id)
);
create unique index lots_name_uq on public.lots (farm_id, lower(name)) where deleted_at is null;

create table public.pastures (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  area_ha numeric(10,2) check (area_ha is null or area_ha >= 0),
  capacity_heads integer check (capacity_heads is null or capacity_heads >= 0),
  status text not null default 'ativo' check (status in ('ativo','em_descanso','inativo')),
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid,
  version integer not null default 1,
  unique (farm_id, id)
);
create unique index pastures_name_uq on public.pastures (farm_id, lower(name)) where deleted_at is null;

create table public.animals (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  ear_tag text not null check (length(trim(ear_tag)) > 0),
  name text,
  sex text not null check (sex in ('M','F')),
  breed_id uuid, category_id uuid, lot_id uuid, pasture_id uuid, sire_id uuid, dam_id uuid,
  birth_date date, origin text,
  status text not null default 'ativo' check (status in ('ativo','vendido','morto','transferido')),
  entry_date date, exit_date date, notes text,
  custom jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid,
  version integer not null default 1,
  unique (farm_id, id),
  -- FKs compostas: o banco impede apontar para um registro de outra fazenda
  foreign key (farm_id, breed_id) references public.breeds (farm_id, id),
  foreign key (farm_id, category_id) references public.categories (farm_id, id),
  foreign key (farm_id, lot_id) references public.lots (farm_id, id),
  foreign key (farm_id, pasture_id) references public.pastures (farm_id, id),
  foreign key (farm_id, sire_id) references public.animals (farm_id, id),
  foreign key (farm_id, dam_id) references public.animals (farm_id, id),
  check (exit_date is null or entry_date is null or exit_date >= entry_date)
);
create unique index animals_tag_uq on public.animals (farm_id, ear_tag) where deleted_at is null;
create index animals_farm_lot_status_idx on public.animals (farm_id, lot_id, status);

-- Gatilhos de controle
create function app.set_created() returns trigger language plpgsql as $$
begin new.created_by := auth.uid(); return new; end $$;
create trigger lots_created before insert on public.lots for each row execute function app.set_created();
create trigger pastures_created before insert on public.pastures for each row execute function app.set_created();
create trigger animals_created before insert on public.animals for each row execute function app.set_created();
create trigger lots_touch before update on public.lots for each row execute function app.touch();
create trigger pastures_touch before update on public.pastures for each row execute function app.touch();
create trigger animals_touch before update on public.animals for each row execute function app.touch();

-- Catálogos iniciais para cada fazenda nova
create function app.seed_farm_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.breeds (farm_id, name)
    select new.id, n from unnest(array['Nelore','Angus','Brangus','Cruzado','Girolando','Outra']) n;
  insert into public.categories (farm_id, name)
    select new.id, n from unnest(array['Bezerro','Bezerra','Garrote','Novilha','Boi','Vaca','Touro']) n;
  return new;
end $$;
create trigger farms_seed after insert on public.farms for each row execute function app.seed_farm_defaults();

-- Fazendas que já existiam
insert into public.breeds (farm_id, name)
  select f.id, n from public.farms f cross join unnest(array['Nelore','Angus','Brangus','Cruzado','Girolando','Outra']) n
  on conflict do nothing;
insert into public.categories (farm_id, name)
  select f.id, n from public.farms f cross join unnest(array['Bezerro','Bezerra','Garrote','Novilha','Boi','Vaca','Touro']) n
  on conflict do nothing;

-- Privilégios
revoke all on public.breeds, public.categories, public.lots, public.pastures, public.animals from anon;
revoke delete, truncate on public.breeds, public.categories, public.lots, public.pastures, public.animals from authenticated;
revoke insert, update on public.breeds, public.categories, public.lots, public.pastures, public.animals from authenticated;
grant insert (farm_id, name, status, notes) on public.lots to authenticated;
grant update (name, status, notes) on public.lots to authenticated;
grant insert (farm_id, name, area_ha, capacity_heads, status, notes) on public.pastures to authenticated;
grant update (name, area_ha, capacity_heads, status, notes) on public.pastures to authenticated;
grant insert (farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id,
              birth_date, origin, status, entry_date, exit_date, notes, custom) on public.animals to authenticated;
grant update (ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id,
              birth_date, origin, status, entry_date, exit_date, notes, custom) on public.animals to authenticated;

-- RLS
alter table public.breeds enable row level security;
alter table public.categories enable row level security;
alter table public.lots enable row level security;
alter table public.pastures enable row level security;
alter table public.animals enable row level security;

create policy breeds_select on public.breeds for select to authenticated using (farm_id in (select app.user_farm_ids()));
create policy categories_select on public.categories for select to authenticated using (farm_id in (select app.user_farm_ids()));

create policy lots_select on public.lots for select to authenticated
  using (deleted_at is null and app.has_permission(farm_id, 'lots.view'));
create policy lots_insert on public.lots for insert to authenticated
  with check (app.has_permission(farm_id, 'lots.create'));
create policy lots_update on public.lots for update to authenticated
  using (app.has_permission(farm_id, 'lots.update')) with check (app.has_permission(farm_id, 'lots.update'));

create policy pastures_select on public.pastures for select to authenticated
  using (deleted_at is null and app.has_permission(farm_id, 'pastures.view'));
create policy pastures_insert on public.pastures for insert to authenticated
  with check (app.has_permission(farm_id, 'pastures.create'));
create policy pastures_update on public.pastures for update to authenticated
  using (app.has_permission(farm_id, 'pastures.update')) with check (app.has_permission(farm_id, 'pastures.update'));

create policy animals_select on public.animals for select to authenticated
  using (deleted_at is null and app.has_permission(farm_id, 'animals.view'));
create policy animals_insert on public.animals for insert to authenticated
  with check (app.has_permission(farm_id, 'animals.create'));
create policy animals_update on public.animals for update to authenticated
  using (app.has_permission(farm_id, 'animals.update')) with check (app.has_permission(farm_id, 'animals.update'));

-- Auditoria
create trigger z_audit after insert or update or delete on public.lots for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.pastures for each row execute function app.audit_row();
create trigger z_audit after insert or update or delete on public.animals for each row execute function app.audit_row();


-- >>> MIGRATION: 20261022000004_movements.sql
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


-- >>> MIGRATION: 20261023000005_weighings.sql
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


-- >>> MIGRATION: 20261024000006_import.sql
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


-- >>> MIGRATION: 20261025000007_dashboard.sql
-- ETAPA 5 (parte) · Painel: indicadores calculados no banco, sempre sob a RLS de quem consulta
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: alertas de vacina e estoque, nascimentos, indicadores financeiros (dependem de módulos ainda inexistentes);
-- desempenho com muitos animais (revisar na Etapa 7).

-- Permissões do usuário logado em uma fazenda (a tela usa para decidir quais indicadores exibir)
create function public.my_permissions(p_farm uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(rp.permission_key), '{}'::text[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.user_id = auth.uid() and m.farm_id = p_farm and m.status = 'active'
$$;
revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Resumo do rebanho. SECURITY INVOKER: quem não tem permissão de ver animais ou pesagens recebe zeros.
create function public.dashboard_summary(p_farm uuid) returns jsonb
language sql stable set search_path = '' as $$
  with act as (
    select a.id, a.sex, a.category_id, a.lot_id
    from public.animals a
    where a.farm_id = p_farm and a.status = 'ativo' and a.deleted_at is null
  ),
  ranked as (
    select w.animal_id, w.weight_kg, w.weighed_at,
           row_number() over (partition by w.animal_id order by w.weighed_at desc) as rn
    from public.weighings w
    where w.farm_id = p_farm and w.voided_at is null and w.animal_id in (select id from act)
  ),
  lw as (select animal_id, weight_kg, weighed_at from ranked where rn = 1),
  pw as (select animal_id, weight_kg, weighed_at from ranked where rn = 2),
  gmd as (
    select (l.weight_kg - p.weight_kg) / (extract(epoch from (l.weighed_at - p.weighed_at)) / 86400.0) as v
    from lw l join pw p on p.animal_id = l.animal_id
    where l.weighed_at > p.weighed_at
  )
  select jsonb_build_object(
    'active', (select count(*) from act),
    'males', (select count(*) from act where sex = 'M'),
    'females', (select count(*) from act where sex = 'F'),
    'sold', (select count(*) from public.animals where farm_id = p_farm and status = 'vendido' and deleted_at is null),
    'dead', (select count(*) from public.animals where farm_id = p_farm and status = 'morto' and deleted_at is null),
    'weighed', (select count(*) from lw),
    'avg_weight', (select round(avg(weight_kg), 1) from lw),
    'avg_gmd', (select round(avg(v), 2) from gmd),
    'never_weighed', (select count(*) from act where id not in (select animal_id from lw)),
    'stale_60d', (select count(*) from lw where weighed_at < now() - interval '60 days'),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.n, 'count', x.c) order by x.c desc, x.n)
      from (select coalesce(ct.name, 'Sem categoria') as n, count(*) as c
            from act left join public.categories ct on ct.id = act.category_id
            group by 1) x), '[]'::jsonb),
    'by_lot', coalesce((
      select jsonb_agg(jsonb_build_object('name', y.n, 'count', y.c, 'avg_weight', y.aw) order by y.n)
      from (select coalesce(l.name, 'Sem lote') as n, count(*) as c, round(avg(lw.weight_kg), 1) as aw
            from act
            left join public.lots l on l.id = act.lot_id
            left join lw on lw.animal_id = act.id
            group by 1) y), '[]'::jsonb)
  )
$$;
revoke execute on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;


-- >>> MIGRATION: 20261026000008_reports.sql
-- ETAPA 4 · Bloco 1 · Relatórios e consultas (fonte: animais): catálogo, compilador seguro, consultas salvas, registro de execuções
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: outras fontes (pesagens, movimentações, vendas), agrupamento/totais/campos calculados, campos personalizados (cf:),
-- permissão por campo, exportação Excel/PDF nativos, execução assíncrona de consultas grandes.

-- Visão de relatório: SECURITY INVOKER, então a RLS das tabelas de origem vale para quem consulta
create view public.v_report_animals with (security_invoker = true) as
select
  a.farm_id, a.id, a.ear_tag, a.name,
  case a.sex when 'M' then 'Macho' else 'Fêmea' end as sex,
  b.name as breed, c.name as category, l.name as lot, p.name as pasture,
  a.status, a.birth_date, a.entry_date, a.exit_date, a.origin,
  case when a.birth_date is not null
       then (extract(year from age(current_date, a.birth_date)) * 12 + extract(month from age(current_date, a.birth_date)))::int
  end as age_months,
  w1.weight_kg as last_weight,
  w1.weighed_at::date as last_weighed_on,
  (current_date - w1.weighed_at::date) as days_since_weighing,
  case when w1.weighed_at is not null and w2.weighed_at is not null and w1.weighed_at > w2.weighed_at
       then round((w1.weight_kg - w2.weight_kg) / (extract(epoch from (w1.weighed_at - w2.weighed_at)) / 86400.0), 2)
  end as gmd
from public.animals a
left join public.breeds b on b.id = a.breed_id
left join public.categories c on c.id = a.category_id
left join public.lots l on l.id = a.lot_id
left join public.pastures p on p.id = a.pasture_id
left join lateral (
  select w.weight_kg, w.weighed_at from public.weighings w
  where w.animal_id = a.id and w.voided_at is null order by w.weighed_at desc limit 1) w1 on true
left join lateral (
  select w.weight_kg, w.weighed_at from public.weighings w
  where w.animal_id = a.id and w.voided_at is null order by w.weighed_at desc offset 1 limit 1) w2 on true
where a.deleted_at is null;

-- Catálogo de campos disponíveis (o usuário nunca digita nome de tabela ou coluna)
create table public.report_fields (
  source text not null,
  key text not null,
  label text not null,
  type text not null check (type in ('text','number','date')),
  position integer not null,
  primary key (source, key)
);
insert into public.report_fields (source, key, label, type, position) values
  ('animals','ear_tag','Brinco','text',1),
  ('animals','name','Nome','text',2),
  ('animals','sex','Sexo','text',3),
  ('animals','breed','Raça','text',4),
  ('animals','category','Categoria','text',5),
  ('animals','lot','Lote','text',6),
  ('animals','pasture','Pasto','text',7),
  ('animals','status','Situação','text',8),
  ('animals','birth_date','Nascimento','date',9),
  ('animals','age_months','Idade (meses)','number',10),
  ('animals','entry_date','Data de entrada','date',11),
  ('animals','exit_date','Data de saída','date',12),
  ('animals','origin','Origem','text',13),
  ('animals','last_weight','Peso atual (kg)','number',14),
  ('animals','last_weighed_on','Data da última pesagem','date',15),
  ('animals','days_since_weighing','Dias sem pesar','number',16),
  ('animals','gmd','GMD (kg/dia)','number',17);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  user_id uuid,
  channel text not null check (channel in ('tela','csv')),
  definition jsonb not null,
  row_count bigint not null,
  created_at timestamptz not null default now()
);
create index report_runs_farm_idx on public.report_runs (farm_id, created_at desc);

create function app.log_report_run(p_farm uuid, p_def jsonb, p_rows bigint, p_channel text) returns void
language sql security definer set search_path = '' as $$
  insert into public.report_runs (farm_id, user_id, channel, definition, row_count)
  values (p_farm, auth.uid(), p_channel, p_def, p_rows)
$$;
revoke execute on function app.log_report_run(uuid, jsonb, bigint, text) from public, anon;
grant execute on function app.log_report_run(uuid, jsonb, bigint, text) to authenticated;

-- Compilador: definição JSON -> SQL. Só identificadores do catálogo; valores sempre escapados com %L.
-- {"source":"animals","fields":["ear_tag","breed"],
--  "filters":[{"field":"sex","op":"eq","value":"Macho"},{"field":"last_weight","op":"gt","value":400}],
--  "order_by":[{"field":"ear_tag","dir":"asc"}]}
-- Operadores: eq, ne, gt, gte, lt, lte, between, contains (texto), in (texto), empty, notempty.
create function public.run_report(p_farm uuid, p_def jsonb, p_limit integer default 1000,
                                  p_offset integer default 0, p_channel text default 'tela')
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_fields text[] := '{}'; v_key text; v_f record; v_cols text := ''; v_where text := ''; v_order text := '';
  v_item jsonb; v_op text; v_val jsonb; v_expr text; v_total bigint; v_rows jsonb; v_sql text; v_t text; v_sym text;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_def is null or jsonb_typeof(p_def) <> 'object' or coalesce(p_def ->> 'source', '') <> 'animals' then
    raise exception 'invalid_source';
  end if;
  if p_channel not in ('tela','csv') then raise exception 'invalid_channel'; end if;
  p_limit := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if coalesce(jsonb_typeof(p_def -> 'fields'), '') <> 'array'
     or jsonb_array_length(p_def -> 'fields') not between 1 and 30 then
    raise exception 'invalid_fields';
  end if;
  for v_key in select jsonb_array_elements_text(p_def -> 'fields') loop
    if not exists (select 1 from public.report_fields rf where rf.source = 'animals' and rf.key = v_key) then
      raise exception 'invalid_field';
    end if;
    if v_key = any(v_fields) then continue; end if;
    v_fields := v_fields || v_key;
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%I', v_key);
  end loop;

  if coalesce(jsonb_typeof(p_def -> 'filters'), '') = 'array' then
    if jsonb_array_length(p_def -> 'filters') > 20 then raise exception 'too_many_filters'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'filters') loop
      select rf.key as key, rf.type as type into v_f
        from public.report_fields rf where rf.source = 'animals' and rf.key = (v_item ->> 'field');
      if not found then raise exception 'invalid_field'; end if;
      v_op := v_item ->> 'op';
      v_val := v_item -> 'value';
      v_expr := format('%I', v_f.key);
      v_t := case v_f.type when 'number' then 'numeric' else 'date' end;

      if v_op = 'empty' then
        v_where := v_where || format(' and %s is null', v_expr);
      elsif v_op = 'notempty' then
        v_where := v_where || format(' and %s is not null', v_expr);
      elsif v_op in ('eq','ne','gt','gte','lt','lte') then
        if v_val is null or jsonb_typeof(v_val) in ('array','object','null') then raise exception 'invalid_value'; end if;
        v_sym := case v_op when 'eq' then '=' when 'ne' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end;
        if v_f.type = 'text' then
          if v_op not in ('eq','ne') then raise exception 'invalid_operator'; end if;
          v_where := v_where || format(' and lower(%s) %s lower(%L)', v_expr, v_sym, v_val #>> '{}');
        else
          v_where := v_where || format(' and %s %s %L::%s', v_expr, v_sym, v_val #>> '{}', v_t);
        end if;
      elsif v_op = 'between' then
        if v_f.type = 'text' then raise exception 'invalid_operator'; end if;
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) <> 2 then raise exception 'invalid_value'; end if;
        v_where := v_where || format(' and %s between %L::%s and %L::%s', v_expr, v_val ->> 0, v_t, v_val ->> 1, v_t);
      elsif v_op = 'contains' then
        if v_f.type <> 'text' or v_val is null or jsonb_typeof(v_val) <> 'string' then raise exception 'invalid_operator'; end if;
        v_where := v_where || format(' and %s ilike %L', v_expr,
          '%' || replace(replace(replace(v_val #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%');
      elsif v_op = 'in' then
        if v_f.type <> 'text' or jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 100 then
          raise exception 'invalid_operator';
        end if;
        v_where := v_where || format(' and lower(%s) = any (array(select lower(x) from jsonb_array_elements_text(%L::jsonb) x))',
          v_expr, v_val::text);
      else
        raise exception 'invalid_operator';
      end if;
    end loop;
  end if;

  if coalesce(jsonb_typeof(p_def -> 'order_by'), '') = 'array' then
    if jsonb_array_length(p_def -> 'order_by') > 5 then raise exception 'too_many_orders'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'order_by') loop
      if not exists (select 1 from public.report_fields rf where rf.source = 'animals' and rf.key = (v_item ->> 'field')) then
        raise exception 'invalid_field';
      end if;
      if coalesce(v_item ->> 'dir', 'asc') not in ('asc','desc') then raise exception 'invalid_direction'; end if;
      v_order := v_order || case when v_order = '' then '' else ', ' end
                 || format('%I %s nulls last', v_item ->> 'field', coalesce(v_item ->> 'dir', 'asc'));
    end loop;
  end if;
  v_order := case when v_order = '' then 'ear_tag asc, id' else v_order || ', id' end;

  execute format('select count(*) from public.v_report_animals where farm_id = %L%s', p_farm, v_where) into v_total;
  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''rn'' order by t.rn), ''[]''::jsonb) from ('
    || 'select %s, row_number() over (order by %s) as rn from public.v_report_animals '
    || 'where farm_id = %L%s order by %s limit %s offset %s) t',
    v_cols, v_order, p_farm, v_where, v_order, p_limit, p_offset);
  execute v_sql into v_rows;

  if p_offset = 0 then perform app.log_report_run(p_farm, p_def, v_total, p_channel); end if;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'columns', to_jsonb(v_fields));
end $$;

-- Consultas salvas ("Minhas consultas")
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  shared boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1
);
create unique index saved_reports_name_uq on public.saved_reports (farm_id, created_by, lower(name));
create trigger saved_reports_created before insert on public.saved_reports for each row execute function app.set_created();
create trigger saved_reports_touch before update on public.saved_reports for each row execute function app.touch();

-- Privilégios e RLS
revoke all on public.v_report_animals, public.report_fields, public.report_runs, public.saved_reports from anon;
grant select on public.v_report_animals to authenticated;
revoke insert, update, delete, truncate on public.report_fields, public.report_runs from authenticated;
revoke insert, update, delete, truncate on public.saved_reports from authenticated;
grant insert (farm_id, name, definition, shared) on public.saved_reports to authenticated;
grant update (name, definition, shared) on public.saved_reports to authenticated;
grant delete on public.saved_reports to authenticated;
revoke execute on function public.run_report(uuid, jsonb, integer, integer, text) from public, anon;
grant execute on function public.run_report(uuid, jsonb, integer, integer, text) to authenticated;

alter table public.report_fields enable row level security;
alter table public.report_runs enable row level security;
alter table public.saved_reports enable row level security;
create policy fields_select on public.report_fields for select to authenticated using (true);
create policy runs_select on public.report_runs for select to authenticated using (app.has_permission(farm_id, 'audit.view'));
create policy saved_select on public.saved_reports for select to authenticated
  using (app.has_permission(farm_id, 'reports.view') and (created_by = auth.uid() or shared));
create policy saved_insert on public.saved_reports for insert to authenticated
  with check (app.has_permission(farm_id, 'reports.builder'));
create policy saved_update on public.saved_reports for update to authenticated
  using (created_by = auth.uid() and app.has_permission(farm_id, 'reports.builder'))
  with check (created_by = auth.uid() and app.has_permission(farm_id, 'reports.builder'));
create policy saved_delete on public.saved_reports for delete to authenticated using (created_by = auth.uid());

create trigger z_audit after insert or update or delete on public.saved_reports for each row execute function app.audit_row();


-- >>> MIGRATION: 20261027000009_users_audit.sql
-- ETAPA 1 (pendências) · Tela de usuários da fazenda e consulta de auditoria
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Fluxo de convite: a pessoa cria a própria conta na tela de login e o administrador a adiciona pelo e-mail.
-- TODO: convite por e-mail com link, 2FA, criação/edição de perfis personalizados, permissão por campo na tela.

-- Membros da fazenda (com e-mail, que a aplicação não consegue ler diretamente)
create function public.farm_members(p_farm uuid)
returns table (membership_id uuid, user_id uuid, email text, full_name text, role_id uuid, role_name text,
               status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'users.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, u.email::text, pr.full_name, m.role_id, r.name, m.status, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.id = m.user_id
    join public.roles r on r.id = m.role_id
    where m.farm_id = p_farm
    order by u.email;
end $$;

-- Adiciona à fazenda alguém que já criou conta. As proteções de escalada de privilégios e de último
-- administrador continuam valendo (gatilho em memberships).
create function public.add_member_by_email(p_farm uuid, p_email text, p_role uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid; v_org uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'users.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select f.organization_id into v_org from public.farms f where f.id = p_farm;
  if not exists (select 1 from public.roles r where r.id = p_role and (r.is_system or r.organization_id = v_org)) then
    raise exception 'invalid_role';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user and m.farm_id = p_farm) then
    raise exception 'already_member';
  end if;
  insert into public.memberships (user_id, farm_id, role_id) values (v_user, p_farm, p_role) returning id into v_id;
  return v_id;
end $$;

-- Consulta de auditoria com o e-mail de quem fez a alteração
create function public.audit_entries(p_farm uuid, p_table text, p_op text, p_from date, p_to date,
                                     p_limit integer default 50, p_offset integer default 0)
returns table (id bigint, occurred_at timestamptz, user_email text, operation text, table_name text,
               record_id text, changed_fields jsonb, old_data jsonb, new_data jsonb, source text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'audit.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select l.id, l.occurred_at, u.email::text, l.operation, l.table_name, l.record_id,
           l.changed_fields, l.old_data, l.new_data, l.source, count(*) over ()
    from public.audit_log l
    left join auth.users u on u.id = l.user_id
    where l.farm_id = p_farm
      and (p_table is null or l.table_name = p_table)
      and (p_op is null or l.operation = p_op)
      and (p_from is null or l.occurred_at >= (p_from::timestamp at time zone 'America/Bahia'))
      and (p_to is null or l.occurred_at < ((p_to + 1)::timestamp at time zone 'America/Bahia'))
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function public.farm_members(uuid) from public, anon;
revoke execute on function public.add_member_by_email(uuid, text, uuid) from public, anon;
revoke execute on function public.audit_entries(uuid, text, text, date, date, integer, integer) from public, anon;
grant execute on function public.farm_members(uuid) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, uuid) to authenticated;
grant execute on function public.audit_entries(uuid, text, text, date, date, integer, integer) to authenticated;


-- >>> MIGRATION: 20261028000010_health.sql
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


-- >>> MIGRATION: 20261029000011_custom_fields.sql
-- LOTE 1 · Bloco B · Campos personalizados (híbrido: colunas reais + JSONB + metadados), com permissão por campo
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Decisões: opções ficam em JSONB na própria definição (em vez de tabela field_options); condição simples (campo = valor);
-- histórico de alterações da estrutura fica na auditoria (campos antigo/novo). Só a entidade "animal" por enquanto.
-- TODO: cadastros personalizados (Equipamentos...), tipos CPF/CNPJ e referência a outro cadastro, índices por expressão
-- nos campos filtráveis, mudança de tipo com migração assistida, gravação atômica na criação do animal.

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  entity text not null default 'animal' check (entity in ('animal')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(trim(label)) between 1 and 80),
  description text,
  data_type text not null check (data_type in ('text','longtext','integer','decimal','date','boolean','list','multilist','money','percent','email','phone')),
  required boolean not null default false,
  default_value text,
  max_length integer check (max_length is null or max_length between 1 and 5000),
  decimals integer check (decimals is null or decimals between 0 and 6),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  condition jsonb,
  position integer not null default 100,
  in_reports boolean not null default true,
  filterable boolean not null default true,
  sortable boolean not null default true,
  groupable boolean not null default false,
  visible_to text[],
  editable_to text[],
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (farm_id, entity, field_key)
);

create function app.field_def_validate() returns trigger language plpgsql set search_path = '' as $$
declare v_other text;
  c_roles constant text[] := array['administrador','gerente','veterinario','zootecnista','funcionario','operador','visualizacao'];
begin
  if tg_op = 'UPDATE' and (new.field_key <> old.field_key or new.data_type <> old.data_type
                           or new.entity <> old.entity or new.farm_id <> old.farm_id) then
    raise exception 'immutable_definition';
  end if;
  if new.data_type in ('list','multilist') then
    if jsonb_array_length(new.options) not between 1 and 100
       or exists (select 1 from jsonb_array_elements(new.options) x
                  where jsonb_typeof(x) <> 'string' or length(trim(x #>> '{}')) not between 1 and 80) then
      raise exception 'invalid_options';
    end if;
  else
    new.options := '[]'::jsonb;
  end if;
  if new.condition is not null then
    if jsonb_typeof(new.condition) <> 'object' or (new.condition ->> 'op') not in ('eq','ne')
       or coalesce(new.condition ->> 'value', '') = '' then
      raise exception 'invalid_condition';
    end if;
    v_other := new.condition ->> 'field';
    if v_other is null or (v_other <> 'sex' and (v_other = new.field_key or not exists (
         select 1 from public.field_definitions fd
         where fd.farm_id = new.farm_id and fd.entity = new.entity and fd.field_key = v_other))) then
      raise exception 'invalid_condition';
    end if;
  end if;
  if new.visible_to is not null and not (new.visible_to <@ c_roles) then raise exception 'invalid_roles'; end if;
  if new.editable_to is not null and not (new.editable_to <@ c_roles) then raise exception 'invalid_roles'; end if;
  return new;
end $$;
create trigger a_field_def_validate before insert or update on public.field_definitions
  for each row execute function app.field_def_validate();
create trigger field_definitions_created before insert on public.field_definitions for each row execute function app.set_created();
create trigger field_definitions_touch before update on public.field_definitions for each row execute function app.touch();

revoke all on public.field_definitions from anon;
revoke insert, update, delete, truncate on public.field_definitions from authenticated;
grant insert (farm_id, entity, field_key, label, description, data_type, required, default_value, max_length, decimals,
              options, condition, position, in_reports, filterable, sortable, groupable, visible_to, editable_to)
  on public.field_definitions to authenticated;
grant update (label, description, required, default_value, max_length, decimals, options, condition, position,
              in_reports, filterable, sortable, groupable, visible_to, editable_to, status)
  on public.field_definitions to authenticated;
alter table public.field_definitions enable row level security;
create policy fd_select on public.field_definitions for select to authenticated using (farm_id in (select app.user_farm_ids()));
create policy fd_insert on public.field_definitions for insert to authenticated with check (app.has_permission(farm_id, 'settings.create'));
create policy fd_update on public.field_definitions for update to authenticated
  using (app.has_permission(farm_id, 'settings.update')) with check (app.has_permission(farm_id, 'settings.update'));
create trigger z_audit after insert or update on public.field_definitions for each row execute function app.audit_row();

-- Valores personalizados: a coluna animals.custom deixa de ser legível/gravável diretamente.
-- Leitura só por get_animal_custom/relatórios (que aplicam a permissão por campo); gravação só por set_animal_custom (que valida).
revoke select on public.animals from authenticated;
grant select (id, farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id, birth_date,
              origin, status, entry_date, exit_date, notes, created_at, created_by, updated_at, updated_by,
              deleted_at, deleted_by, version) on public.animals to authenticated;
revoke insert (custom), update (custom) on public.animals from authenticated;

-- Validador único por tipo (usado por tela, API e importação)
create function app.cf_validate(p_type text, p_raw jsonb, p_max integer, p_dec integer, p_options jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare s text; n numeric; e text;
begin
  if p_type = 'multilist' then
    if jsonb_typeof(p_raw) <> 'array' then raise exception 'invalid_value'; end if;
    for e in select jsonb_array_elements_text(p_raw) loop
      if not (p_options ? e) then raise exception 'invalid_value'; end if;
    end loop;
    return p_raw;
  end if;
  if jsonb_typeof(p_raw) in ('array','object') then raise exception 'invalid_value'; end if;
  s := trim(p_raw #>> '{}');
  if p_type = 'text' then
    if length(s) > coalesce(p_max, 255) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'longtext' then
    if length(s) > coalesce(p_max, 5000) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'integer' then
    if s !~ '^-?[0-9]{1,15}$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s::bigint);
  elsif p_type in ('decimal','money','percent') then
    s := replace(s, ',', '.');
    if s !~ '^-?[0-9]{1,15}(\.[0-9]+)?$' then raise exception 'invalid_value'; end if;
    n := round(s::numeric, case p_type when 'money' then 2 else coalesce(p_dec, 6) end);
    if p_type = 'percent' and (n < 0 or n > 100) then raise exception 'invalid_value'; end if;
    return to_jsonb(n);
  elsif p_type = 'date' then
    if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_value'; end if;
    perform s::date;
    return to_jsonb(s);
  elsif p_type = 'boolean' then
    if s not in ('true','false') then raise exception 'invalid_value'; end if;
    return to_jsonb(s::boolean);
  elsif p_type = 'list' then
    if not (p_options ? s) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'email' then
    if length(s) > 120 or s !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'phone' then
    if s !~ '^[0-9()+[:space:]-]{8,20}$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  end if;
  raise exception 'invalid_type';
end $$;

-- Valor de um campo personalizado como texto, já respeitando a permissão por campo de quem consulta
create function app.cf_value(p_animal uuid, p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid; v_val jsonb; v_vis text[]; v_role text;
begin
  select a.farm_id, a.custom -> p_key into v_farm, v_val from public.animals a where a.id = p_animal;
  if v_farm is null or v_val is null or not app.has_permission(v_farm, 'animals.view') then return null; end if;
  select fd.visible_to into v_vis from public.field_definitions fd
    where fd.farm_id = v_farm and fd.entity = 'animal' and fd.field_key = p_key;
  if not found then return null; end if;
  if v_vis is not null then
    select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.farm_id = v_farm and m.status = 'active';
    if v_role is null or (v_role <> 'administrador' and not (v_role = any(v_vis))) then return null; end if;
  end if;
  return case when jsonb_typeof(v_val) = 'string' then v_val #>> '{}' else v_val::text end;
end $$;

create function public.get_animal_custom(p_animal uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a record; v_role text; v_out jsonb;
begin
  select an.farm_id as farm_id, an.custom as custom into a from public.animals an where an.id = p_animal and an.deleted_at is null;
  if not found or auth.uid() is null or not app.has_permission(a.farm_id, 'animals.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.farm_id = a.farm_id and m.status = 'active';
  select coalesce(jsonb_object_agg(fd.field_key, a.custom -> fd.field_key), '{}'::jsonb) into v_out
    from public.field_definitions fd
    where fd.farm_id = a.farm_id and fd.entity = 'animal' and a.custom ? fd.field_key
      and (fd.visible_to is null or v_role = 'administrador' or v_role = any(fd.visible_to));
  return v_out;
end $$;

create function public.set_animal_custom(p_animal uuid, p_values jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a record; d record; v_role text; v_new jsonb; v_key text; v_raw jsonb; v_cond boolean; v_other text;
begin
  select an.id as id, an.farm_id as farm_id, an.custom as custom, an.sex as sex, an.created_by as created_by, an.created_at as created_at
    into a from public.animals an where an.id = p_animal and an.deleted_at is null;
  if not found then raise exception 'invalid_animal'; end if;
  if auth.uid() is null or not (
       app.has_permission(a.farm_id, 'animals.update')
       or (app.has_permission(a.farm_id, 'animals.create') and a.created_by = auth.uid()
           and a.created_at > now() - interval '5 minutes')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'invalid_values'; end if;
  select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.farm_id = a.farm_id and m.status = 'active';
  v_new := a.custom;

  for v_key, v_raw in select * from jsonb_each(p_values) loop
    select * into d from public.field_definitions fd
      where fd.farm_id = a.farm_id and fd.entity = 'animal' and fd.field_key = v_key;
    if not found or d.status <> 'active' then raise exception 'invalid_field'; end if;
    if d.editable_to is not null and v_role <> 'administrador' and not (v_role = any(d.editable_to)) then
      raise exception 'forbidden_field' using errcode = '42501';
    end if;
    if v_raw is null or jsonb_typeof(v_raw) = 'null'
       or (jsonb_typeof(v_raw) = 'string' and trim(v_raw #>> '{}') = '')
       or (jsonb_typeof(v_raw) = 'array' and jsonb_array_length(v_raw) = 0) then
      v_new := v_new - v_key;
    else
      v_new := v_new || jsonb_build_object(v_key, app.cf_validate(d.data_type, v_raw, d.max_length, d.decimals, d.options));
    end if;
  end loop;

  -- Condições (campo só vale quando a condição é atendida) e obrigatoriedade
  for d in select * from public.field_definitions fd
           where fd.farm_id = a.farm_id and fd.entity = 'animal' and fd.status = 'active' loop
    v_cond := true;
    if d.condition is not null then
      v_other := case when d.condition ->> 'field' = 'sex' then a.sex else v_new ->> (d.condition ->> 'field') end;
      v_cond := case d.condition ->> 'op'
                  when 'eq' then coalesce(v_other, '') = (d.condition ->> 'value')
                  else coalesce(v_other, '') <> (d.condition ->> 'value') end;
    end if;
    if v_cond then
      if d.required and not (v_new ? d.field_key)
         and (d.editable_to is null or v_role = 'administrador' or v_role = any(d.editable_to)) then
        raise exception 'required_missing:%', d.field_key;
      end if;
    else
      v_new := v_new - d.field_key;
    end if;
  end loop;

  update public.animals set custom = v_new where id = p_animal;
end $$;

-- Relatórios com campos personalizados: resolve a expressão de cada campo (núcleo ou "cf:chave")
create function app.report_field(p_farm uuid, p_key text, p_use text)
returns table (expr text, ftype text) language plpgsql stable security definer set search_path = '' as $$
declare d record;
begin
  if p_key like 'cf:%' then
    select fd.data_type as data_type, fd.in_reports as in_reports, fd.filterable as filterable, fd.sortable as sortable
      into d from public.field_definitions fd
      where fd.farm_id = p_farm and fd.entity = 'animal' and fd.field_key = substr(p_key, 4);
    if not found then return; end if;
    if (p_use = 'select' and not d.in_reports) or (p_use = 'filter' and not d.filterable)
       or (p_use = 'order' and not d.sortable) then return; end if;
    return query select format('app.cf_value(id, %L)', substr(p_key, 4)),
      (case when d.data_type in ('integer','decimal','money','percent') then 'number'
            when d.data_type = 'date' then 'date' else 'text' end)::text;
  else
    return query select format('%I', rf.key), rf.type::text from public.report_fields rf
      where rf.source = 'animals' and rf.key = p_key;
  end if;
end $$;

create or replace function public.run_report(p_farm uuid, p_def jsonb, p_limit integer default 1000,
                                             p_offset integer default 0, p_channel text default 'tela')
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_fields text[] := '{}'; v_key text; v_f record; v_cols text := ''; v_where text := ''; v_order text := '';
  v_item jsonb; v_op text; v_val jsonb; v_expr text; v_total bigint; v_rows jsonb; v_sql text; v_t text; v_sym text;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_def is null or jsonb_typeof(p_def) <> 'object' or coalesce(p_def ->> 'source', '') <> 'animals' then
    raise exception 'invalid_source';
  end if;
  if p_channel not in ('tela','csv') then raise exception 'invalid_channel'; end if;
  p_limit := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if coalesce(jsonb_typeof(p_def -> 'fields'), '') <> 'array'
     or jsonb_array_length(p_def -> 'fields') not between 1 and 30 then
    raise exception 'invalid_fields';
  end if;
  for v_key in select jsonb_array_elements_text(p_def -> 'fields') loop
    select * into v_f from app.report_field(p_farm, v_key, 'select');
    if not found then raise exception 'invalid_field'; end if;
    if v_key = any(v_fields) then continue; end if;
    v_fields := v_fields || v_key;
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%s as %I', v_f.expr, v_key);
  end loop;

  if coalesce(jsonb_typeof(p_def -> 'filters'), '') = 'array' then
    if jsonb_array_length(p_def -> 'filters') > 20 then raise exception 'too_many_filters'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'filters') loop
      select * into v_f from app.report_field(p_farm, v_item ->> 'field', 'filter');
      if not found then raise exception 'invalid_field'; end if;
      v_op := v_item ->> 'op';
      v_val := v_item -> 'value';
      v_expr := v_f.expr;
      v_t := case v_f.ftype when 'number' then 'numeric' else 'date' end;

      if v_op = 'empty' then
        v_where := v_where || format(' and %s is null', v_expr);
      elsif v_op = 'notempty' then
        v_where := v_where || format(' and %s is not null', v_expr);
      elsif v_op in ('eq','ne','gt','gte','lt','lte') then
        if v_val is null or jsonb_typeof(v_val) in ('array','object','null') then raise exception 'invalid_value'; end if;
        v_sym := case v_op when 'eq' then '=' when 'ne' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end;
        if v_f.ftype = 'text' then
          if v_op not in ('eq','ne') then raise exception 'invalid_operator'; end if;
          v_where := v_where || format(' and lower(%s) %s lower(%L)', v_expr, v_sym, v_val #>> '{}');
        else
          v_where := v_where || format(' and (%s)::%s %s %L::%s', v_expr, v_t, v_sym, v_val #>> '{}', v_t);
        end if;
      elsif v_op = 'between' then
        if v_f.ftype = 'text' then raise exception 'invalid_operator'; end if;
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) <> 2 then raise exception 'invalid_value'; end if;
        v_where := v_where || format(' and (%s)::%s between %L::%s and %L::%s', v_expr, v_t, v_val ->> 0, v_t, v_val ->> 1, v_t);
      elsif v_op = 'contains' then
        if v_f.ftype <> 'text' or v_val is null or jsonb_typeof(v_val) <> 'string' then raise exception 'invalid_operator'; end if;
        v_where := v_where || format(' and %s ilike %L', v_expr,
          '%' || replace(replace(replace(v_val #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%');
      elsif v_op = 'in' then
        if v_f.ftype <> 'text' or jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 100 then
          raise exception 'invalid_operator';
        end if;
        v_where := v_where || format(' and lower(%s) = any (array(select lower(x) from jsonb_array_elements_text(%L::jsonb) x))',
          v_expr, v_val::text);
      else
        raise exception 'invalid_operator';
      end if;
    end loop;
  end if;

  if coalesce(jsonb_typeof(p_def -> 'order_by'), '') = 'array' then
    if jsonb_array_length(p_def -> 'order_by') > 5 then raise exception 'too_many_orders'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'order_by') loop
      select * into v_f from app.report_field(p_farm, v_item ->> 'field', 'order');
      if not found then raise exception 'invalid_field'; end if;
      if coalesce(v_item ->> 'dir', 'asc') not in ('asc','desc') then raise exception 'invalid_direction'; end if;
      v_expr := case v_f.ftype when 'number' then format('(%s)::numeric', v_f.expr)
                               when 'date' then format('(%s)::date', v_f.expr) else v_f.expr end;
      v_order := v_order || case when v_order = '' then '' else ', ' end
                 || format('%s %s nulls last', v_expr, coalesce(v_item ->> 'dir', 'asc'));
    end loop;
  end if;
  v_order := case when v_order = '' then 'ear_tag asc, id' else v_order || ', id' end;

  execute format('select count(*) from public.v_report_animals where farm_id = %L%s', p_farm, v_where) into v_total;
  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''rn'' order by t.rn), ''[]''::jsonb) from ('
    || 'select %s, row_number() over (order by %s) as rn from public.v_report_animals '
    || 'where farm_id = %L%s order by %s limit %s offset %s) t',
    v_cols, v_order, p_farm, v_where, v_order, p_limit, p_offset);
  execute v_sql into v_rows;

  if p_offset = 0 then perform app.log_report_run(p_farm, p_def, v_total, p_channel); end if;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'columns', to_jsonb(v_fields));
end $$;

revoke execute on function public.get_animal_custom(uuid) from public, anon;
revoke execute on function public.set_animal_custom(uuid, jsonb) from public, anon;
grant execute on function public.get_animal_custom(uuid) to authenticated;
grant execute on function public.set_animal_custom(uuid, jsonb) to authenticated;


-- >>> MIGRATION: 20261030000012_security.sql
-- LOTE 1 · Bloco C · Segurança: restrição de criação de organizações e criação de fazendas por administradores
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- 2FA e renovação de sessão são feitos na aplicação (Supabase Auth). TODO: exigir nível aal2 também no banco (RLS).

-- Só quem ainda não tem acesso a nenhuma fazenda pode criar uma nova organização
create or replace function public.create_organization_with_farm(p_org_name text, p_farm_code text, p_farm_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_farm uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships m where m.user_id = auth.uid()) then
    raise exception 'already_has_access';
  end if;
  select id into v_admin from public.roles where is_system and name = 'administrador';
  insert into public.organizations (name, created_by) values (p_org_name, auth.uid()) returning id into v_org;
  insert into public.farms (organization_id, code, name, created_by)
    values (v_org, p_farm_code, p_farm_name, auth.uid()) returning id into v_farm;
  insert into public.memberships (user_id, farm_id, role_id) values (auth.uid(), v_farm, v_admin);
  return v_farm;
end $$;

-- Administrador de uma fazenda da organização cria outra fazenda na mesma organização
create function public.create_farm_in_org(p_org uuid, p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select id into v_admin from public.roles where is_system and name = 'administrador';
  if not exists (
    select 1 from public.memberships m join public.farms f on f.id = m.farm_id
    where m.user_id = auth.uid() and m.status = 'active' and m.role_id = v_admin and f.organization_id = p_org
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.farms (organization_id, code, name, created_by) values (p_org, p_code, p_name, auth.uid())
    returning id into v_farm;
  insert into public.memberships (user_id, farm_id, role_id) values (auth.uid(), v_farm, v_admin);
  return v_farm;
end $$;
revoke execute on function public.create_farm_in_org(uuid, text, text) from public, anon;
grant execute on function public.create_farm_in_org(uuid, text, text) to authenticated;


-- >>> MIGRATION: 20261031000013_stock_costs.sql
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


-- >>> MIGRATION: 20261101000014_api.sql
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


-- >>> MIGRATION: 20261102000015_reproduction.sql
-- LOTE 3 · Bloco G · Reprodução, partos e genealogia
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Gestação: usa 283 dias após a última cobertura/inseminação como ESTIMATIVA média para bovinos (ajuste conforme a raça/orientação técnica).
-- TODO: reprodutor com histórico próprio na tela, estação de monta, descarte e coberturas múltiplas, calendário reprodutivo por categoria,
-- alertas fora do sistema (e-mail/WhatsApp).

insert into public.permissions (key, resource, action, description)
select 'reproduction.' || a, 'reproduction', a, 'reproduction · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource = 'reproduction' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista') and p.action in ('view','create','update','print','export'))
  or (r.name in ('funcionario','operador') and p.action in ('view','create'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

-- Pai deve ser macho, mãe deve ser fêmea, ninguém é pai/mãe de si mesmo
create function app.animals_parentage() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sire_id is not null and (new.sire_id = new.id or not exists (
       select 1 from public.animals p where p.id = new.sire_id and p.farm_id = new.farm_id and p.sex = 'M')) then
    raise exception 'invalid_parent';
  end if;
  if new.dam_id is not null and (new.dam_id = new.id or not exists (
       select 1 from public.animals p where p.id = new.dam_id and p.farm_id = new.farm_id and p.sex = 'F')) then
    raise exception 'invalid_parent';
  end if;
  return new;
end $$;
create trigger a_animals_parentage before insert or update of sire_id, dam_id on public.animals
  for each row execute function app.animals_parentage();

create table public.reproduction_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  female_id uuid not null,
  male_id uuid,
  event_type text not null check (event_type in ('cobertura','inseminacao','diagnostico','parto','aborto')),
  event_date date not null,
  semen text,
  result text,
  calf_id uuid,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, female_id) references public.animals (farm_id, id),
  foreign key (farm_id, male_id) references public.animals (farm_id, id),
  foreign key (farm_id, calf_id) references public.animals (farm_id, id),
  check (event_type <> 'diagnostico' or result in ('positivo','negativo')),
  check (event_type <> 'parto' or result in ('vivo','natimorto'))
);
create index reproduction_female_idx on public.reproduction_events (female_id, event_date desc);
create index reproduction_farm_idx on public.reproduction_events (farm_id, event_date desc) where voided_at is null;
create trigger reproduction_guard before update or delete on public.reproduction_events for each row execute function app.weighings_guard();
create trigger reproduction_no_truncate before truncate on public.reproduction_events for each statement execute function app.block_change();

revoke all on public.reproduction_events from anon;
revoke insert, update, delete, truncate on public.reproduction_events from authenticated;
grant select on public.reproduction_events to authenticated;
alter table public.reproduction_events enable row level security;
create policy re_select on public.reproduction_events for select to authenticated using (app.has_permission(farm_id, 'reproduction.view'));

-- Cobertura, inseminação, diagnóstico de gestação e aborto
create function public.register_reproduction(p_farm uuid, p_female uuid, p_type text, p_date date, p_male uuid,
                                             p_semen text, p_result text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reproduction.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type not in ('cobertura','inseminacao','diagnostico','aborto') then raise exception 'invalid_type'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  perform 1 from public.animals where id = p_female and farm_id = p_farm and sex = 'F' and status = 'ativo' and deleted_at is null for update;
  if not found then raise exception 'invalid_female'; end if;
  if p_male is not null and not exists (
       select 1 from public.animals where id = p_male and farm_id = p_farm and sex = 'M' and deleted_at is null) then
    raise exception 'invalid_male';
  end if;
  if p_type = 'diagnostico' and coalesce(p_result, '') not in ('positivo','negativo') then raise exception 'invalid_result'; end if;
  insert into public.reproduction_events (farm_id, female_id, male_id, event_type, event_date, semen, result, notes, created_by)
  values (p_farm, p_female, case when p_type in ('cobertura','inseminacao') then p_male end, p_type, p_date,
          case when p_type = 'inseminacao' then nullif(trim(p_semen), '') end,
          case when p_type = 'diagnostico' then p_result end, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Parto: registra o evento e cria o bezerro com pai (da última cobertura, se não informado) e mãe
create function public.register_birth(p_farm uuid, p_dam uuid, p_date date, p_outcome text, p_calf_tag text, p_calf_sex text,
                                      p_sire uuid, p_lot uuid, p_pasture uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_calf uuid; v_sire uuid := p_sire; v_dam record;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reproduction.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_outcome not in ('vivo','natimorto') then raise exception 'invalid_result'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  select a.id as id, a.lot_id as lot_id, a.pasture_id as pasture_id into v_dam from public.animals a
    where a.id = p_dam and a.farm_id = p_farm and a.sex = 'F' and a.status = 'ativo' and a.deleted_at is null for update;
  if not found then raise exception 'invalid_female'; end if;
  if v_sire is null then
    select e.male_id into v_sire from public.reproduction_events e
      where e.female_id = p_dam and e.voided_at is null and e.event_type in ('cobertura','inseminacao') and e.male_id is not null
        and e.event_date <= p_date and e.event_date >= p_date - 320
      order by e.event_date desc limit 1;
  end if;
  if p_outcome = 'vivo' then
    if nullif(trim(p_calf_tag), '') is null or p_calf_sex not in ('M','F') then raise exception 'invalid_calf'; end if;
    insert into public.animals (farm_id, ear_tag, sex, birth_date, entry_date, origin, dam_id, sire_id, lot_id, pasture_id, notes)
    values (p_farm, trim(p_calf_tag), p_calf_sex, p_date, p_date, 'Nascimento na fazenda', p_dam, v_sire,
            coalesce(p_lot, v_dam.lot_id), coalesce(p_pasture, v_dam.pasture_id), nullif(trim(p_notes), ''))
    returning id into v_calf;
  end if;
  insert into public.reproduction_events (farm_id, female_id, male_id, event_type, event_date, result, calf_id, notes, created_by)
  values (p_farm, p_dam, v_sire, 'parto', p_date, p_outcome, v_calf, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.void_reproduction(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  select * into e from public.reproduction_events where id = p_id and voided_at is null;
  if not found then raise exception 'invalid_event'; end if;
  if auth.uid() is null or not app.has_permission(e.farm_id, 'reproduction.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.calf_id is not null then raise exception 'birth_has_calf'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  update public.reproduction_events set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;

-- Situação reprodutiva de cada fêmea ativa (respeita a RLS de quem chama)
create function public.reproduction_status(p_farm uuid)
returns table (animal_id uuid, ear_tag text, status text, last_event_date date, expected_calving date)
language sql stable set search_path = '' as $$
  with fem as (
    select a.id, a.ear_tag from public.animals a
    where a.farm_id = p_farm and a.sex = 'F' and a.status = 'ativo' and a.deleted_at is null),
  last_any as (
    select distinct on (e.female_id) e.female_id, e.event_type, e.result, e.event_date
    from public.reproduction_events e where e.farm_id = p_farm and e.voided_at is null
    order by e.female_id, e.event_date desc, e.created_at desc),
  last_serv as (
    select e.female_id, max(e.event_date) as d from public.reproduction_events e
    where e.farm_id = p_farm and e.voided_at is null and e.event_type in ('cobertura','inseminacao')
    group by e.female_id)
  select f.id, f.ear_tag,
         case when l.event_type is null then 'sem_registro'
              when l.event_type in ('cobertura','inseminacao') then 'servida'
              when l.event_type = 'diagnostico' and l.result = 'positivo' then 'prenha'
              when l.event_type = 'parto' then 'parida'
              else 'vazia' end,
         l.event_date,
         case when l.event_type in ('cobertura','inseminacao') or (l.event_type = 'diagnostico' and l.result = 'positivo')
              then s.d + 283 end
  from fem f left join last_any l on l.female_id = f.id left join last_serv s on s.female_id = f.id
  order by f.ear_tag
$$;

create function public.reproduction_alerts(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  with s as (select * from public.reproduction_status(p_farm))
  select jsonb_build_object(
    'servida', (select count(*) from s where status = 'servida'),
    'prenha', (select count(*) from s where status = 'prenha'),
    'vazia', (select count(*) from s where status = 'vazia'),
    'parida', (select count(*) from s where status = 'parida'),
    'calving_30d', (select count(*) from s where expected_calving between current_date and current_date + 30),
    'overdue_calving', (select count(*) from s where expected_calving < current_date),
    'diagnosis_pending', (select count(*) from s where status = 'servida' and last_event_date < current_date - 45),
    'births_30d', (select count(*) from public.reproduction_events e
                   where e.farm_id = p_farm and e.event_type = 'parto' and e.voided_at is null and e.result = 'vivo'
                     and e.event_date >= current_date - 30),
    'items', coalesce((select jsonb_agg(jsonb_build_object('animal_id', x.animal_id, 'ear_tag', x.ear_tag, 'expected', x.expected_calving) order by x.expected_calving)
                       from (select * from s where expected_calving is not null and expected_calving <= current_date + 30
                             order by expected_calving limit 20) x), '[]'::jsonb))
$$;

revoke execute on function public.register_reproduction(uuid, uuid, text, date, uuid, text, text, text) from public, anon;
revoke execute on function public.register_birth(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.void_reproduction(uuid, text) from public, anon;
revoke execute on function public.reproduction_status(uuid) from public, anon;
revoke execute on function public.reproduction_alerts(uuid) from public, anon;
grant execute on function public.register_reproduction(uuid, uuid, text, date, uuid, text, text, text) to authenticated;
grant execute on function public.register_birth(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.void_reproduction(uuid, text) to authenticated;
grant execute on function public.reproduction_status(uuid) to authenticated;
grant execute on function public.reproduction_alerts(uuid) to authenticated;

create trigger z_audit after insert or update on public.reproduction_events for each row execute function app.audit_row();


-- >>> MIGRATION: 20261103000016_people_sales.sql
-- LOTE 3 · Bloco H · Pessoas (cadastro) e vendas com valor
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- LGPD: cadastro de pessoas só para administrador e gerente (minimização). Documento (CPF/CNPJ) validado pelos dígitos.
-- TODO: GTA, compras de animais com valor, estorno de venda, transportador na venda, preço por kg e por animal.

insert into public.permissions (key, resource, action, description)
select r || '.' || a, r, a, r || ' · ' || a
from unnest(array['people','trade']) r cross join unnest(array['view','create','update','delete','export','print','import']) a
on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource in ('people','trade') and r.name in ('administrador','gerente')
where r.is_system on conflict do nothing;

create function app.valid_cpf_cnpj(p text) returns boolean language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); s integer; r integer; w integer[];
begin
  if length(d) = 11 then
    if d ~ '^(.)\1{10}$' then return false; end if;
    for k in 0..1 loop
      s := 0;
      for i in 1..(9 + k) loop s := s + substr(d, i, 1)::integer * (11 + k - i); end loop;
      r := (s * 10) % 11;
      if r = 10 then r := 0; end if;
      if r <> substr(d, 10 + k, 1)::integer then return false; end if;
    end loop;
    return true;
  elsif length(d) = 14 then
    if d ~ '^(.)\1{13}$' then return false; end if;
    for k in 0..1 loop
      w := case k when 0 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
      s := 0;
      for i in 1..(12 + k) loop s := s + substr(d, i, 1)::integer * w[i]; end loop;
      r := s % 11;
      r := case when r < 2 then 0 else 11 - r end;
      if r <> substr(d, 13 + k, 1)::integer then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end $$;

-- CPF/CNPJ da fazenda também passa a ser validado pelos dígitos
alter table public.farms add constraint farms_tax_id_valid check (tax_id is null or app.valid_cpf_cnpj(tax_id));

create table public.people (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  person_roles text[] not null default '{}'
    check (person_roles <@ array['funcionario','proprietario','veterinario','zootecnista','fornecedor','comprador','transportador']),
  document text check (document is null or app.valid_cpf_cnpj(document)),
  phone text, email text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (farm_id, id)
);
create unique index people_doc_uq on public.people (farm_id, regexp_replace(document, '[^0-9]', '', 'g')) where document is not null;
create trigger people_created before insert on public.people for each row execute function app.set_created();
create trigger people_touch before update on public.people for each row execute function app.touch();

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  sale_date date not null,
  buyer_id uuid,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  animal_count integer not null check (animal_count > 0),
  document text, notes text,
  created_at timestamptz not null default now(), created_by uuid,
  unique (farm_id, id),
  foreign key (farm_id, buyer_id) references public.people (farm_id, id)
);
create table public.sale_items (
  sale_id uuid not null references public.sales(id),
  farm_id uuid not null,
  animal_id uuid not null,
  primary key (sale_id, animal_id),
  foreign key (farm_id, animal_id) references public.animals (farm_id, id)
);
create index sales_farm_idx on public.sales (farm_id, sale_date desc);
create trigger sales_immutable before update or delete on public.sales for each row execute function app.block_change();
create trigger sale_items_immutable before update or delete on public.sale_items for each row execute function app.block_change();

revoke all on public.people, public.sales, public.sale_items from anon;
revoke insert, update, delete, truncate on public.people, public.sales, public.sale_items from authenticated;
grant select on public.sales, public.sale_items to authenticated;
grant insert (farm_id, name, person_roles, document, phone, email, notes) on public.people to authenticated;
grant update (name, person_roles, document, phone, email, notes, active) on public.people to authenticated;
alter table public.people enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
create policy people_select on public.people for select to authenticated using (app.has_permission(farm_id, 'people.view'));
create policy people_insert on public.people for insert to authenticated with check (app.has_permission(farm_id, 'people.create'));
create policy people_update on public.people for update to authenticated
  using (app.has_permission(farm_id, 'people.update')) with check (app.has_permission(farm_id, 'people.update'));
create policy sales_select on public.sales for select to authenticated using (app.has_permission(farm_id, 'trade.view'));
create policy sale_items_select on public.sale_items for select to authenticated using (app.has_permission(farm_id, 'trade.view'));

-- Venda: encerra os animais (evento de venda) e registra comprador, valor total e documento, na mesma transação
create function public.register_sale(p_farm uuid, p_animal_ids uuid[], p_date date, p_buyer uuid, p_total numeric, p_doc text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n integer;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'trade.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_total is null or p_total < 0 then raise exception 'invalid_total'; end if;
  if p_buyer is not null and not exists (
       select 1 from public.people pe where pe.id = p_buyer and pe.farm_id = p_farm and pe.active and 'comprador' = any(pe.person_roles)) then
    raise exception 'invalid_buyer';
  end if;
  v_n := public.register_movement(p_farm, p_animal_ids, 'venda', p_date, null, null, p_notes);
  insert into public.sales (farm_id, sale_date, buyer_id, total_amount, animal_count, document, notes, created_by)
  values (p_farm, p_date, p_buyer, round(p_total, 2), v_n, nullif(trim(p_doc), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  insert into public.sale_items (sale_id, farm_id, animal_id) select v_id, p_farm, x from (select distinct unnest(p_animal_ids) as x) u;
  return v_id;
end $$;

create function public.sales_summary(p_farm uuid, p_from date, p_to date) returns jsonb language sql stable set search_path = '' as $$
  with s as (select * from public.sales where farm_id = p_farm and sale_date between p_from and p_to)
  select jsonb_build_object(
    'total', (select coalesce(sum(total_amount), 0) from s),
    'sales', (select count(*) from s),
    'animals', (select coalesce(sum(animal_count), 0) from s),
    'avg_per_head', (select case when sum(animal_count) > 0 then round(sum(total_amount) / sum(animal_count), 2) end from s),
    'by_buyer', coalesce((select jsonb_agg(jsonb_build_object('buyer', y.name, 'amount', y.t) order by y.t desc)
                          from (select coalesce(pe.name, 'Sem comprador informado') as name, sum(s.total_amount) as t
                                from s left join public.people pe on pe.id = s.buyer_id group by 1) y), '[]'::jsonb))
$$;
revoke execute on function public.register_sale(uuid, uuid[], date, uuid, numeric, text, text) from public, anon;
revoke execute on function public.sales_summary(uuid, date, date) from public, anon;
grant execute on function public.register_sale(uuid, uuid[], date, uuid, numeric, text, text) to authenticated;
grant execute on function public.sales_summary(uuid, date, date) to authenticated;

create trigger z_audit after insert or update on public.people for each row execute function app.audit_row();
create trigger z_audit after insert on public.sales for each row execute function app.audit_row();


-- >>> MIGRATION: 20261104000017_dashboard_extras.sql
-- LOTE 4 · Bloco A · Painel: evolução do peso e busca global
-- STATUS: escrito, AINDA NÃO EXECUTADO.

-- Peso médio por mês (últimos p_months meses, fuso de Brasília). Respeita a RLS de quem chama.
create function public.weight_trend(p_farm uuid, p_months integer default 6)
returns table (month date, avg_weight numeric, weighings bigint, animals bigint)
language sql stable set search_path = '' as $$
  select date_trunc('month', w.weighed_at at time zone 'America/Bahia')::date,
         round(avg(w.weight_kg), 1), count(*), count(distinct w.animal_id)
  from public.weighings w
  where w.farm_id = p_farm and w.voided_at is null
    and (w.weighed_at at time zone 'America/Bahia')
        >= date_trunc('month', (now() at time zone 'America/Bahia') - make_interval(months => greatest(coalesce(p_months, 6), 1) - 1))
  group by 1
  order by 1
$$;

-- Busca global: animais (brinco/nome), lotes, pastos e pessoas. O que o perfil não pode ver (RLS) não aparece.
create function public.global_search(p_farm uuid, p_q text) returns jsonb language sql stable set search_path = '' as $$
  with q as (
    select '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    where length(trim(coalesce(p_q, ''))) >= 2)
  select jsonb_build_object(
    'animals', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select a.id, a.ear_tag, a.name, a.status from public.animals a, q
        where a.farm_id = p_farm and a.deleted_at is null and (a.ear_tag ilike q.pat or a.name ilike q.pat)
        order by a.ear_tag limit 8) x), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.name from public.lots l, q
        where l.farm_id = p_farm and l.deleted_at is null and l.name ilike q.pat order by l.name limit 8) x), '[]'::jsonb),
    'pastures', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.name from public.pastures p, q
        where p.farm_id = p_farm and p.deleted_at is null and p.name ilike q.pat order by p.name limit 8) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select pe.id, pe.name from public.people pe, q
        where pe.farm_id = p_farm and pe.name ilike q.pat order by pe.name limit 8) x), '[]'::jsonb))
$$;
revoke execute on function public.weight_trend(uuid, integer) from public, anon;
revoke execute on function public.global_search(uuid, text) from public, anon;
grant execute on function public.weight_trend(uuid, integer) to authenticated;
grant execute on function public.global_search(uuid, text) to authenticated;


-- >>> MIGRATION: 20261105000018_inventory_count.sql
-- LOTE 4 · Bloco B · Contagem (inventário) do rebanho: compara os brincos encontrados com os animais ativos do sistema
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- A contagem NÃO altera o cadastro: ela aponta faltas e sobras; a correção é feita depois (movimentação, cadastro, venda, morte).
-- TODO: ação de correção a partir do resultado e leitura por leitor de brinco eletrônico.

insert into public.permissions (key, resource, action, description)
select 'counts.' || a, 'counts', a, 'counts · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource = 'counts' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista','funcionario','operador') and p.action in ('view','create'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  count_date date not null,
  scope text not null check (scope in ('fazenda','lote','pasto')),
  lot_id uuid, pasture_id uuid,
  counted_total integer not null, expected_total integer not null,
  missing_total integer not null, extra_total integer not null,
  missing jsonb not null default '[]'::jsonb,
  extra jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  foreign key (farm_id, lot_id) references public.lots (farm_id, id),
  foreign key (farm_id, pasture_id) references public.pastures (farm_id, id),
  check ((scope = 'fazenda' and lot_id is null and pasture_id is null)
      or (scope = 'lote' and lot_id is not null and pasture_id is null)
      or (scope = 'pasto' and pasture_id is not null and lot_id is null))
);
create index inventory_counts_farm_idx on public.inventory_counts (farm_id, count_date desc);
create trigger inventory_counts_immutable before update or delete on public.inventory_counts for each row execute function app.block_change();
revoke all on public.inventory_counts from anon;
revoke insert, update, delete, truncate on public.inventory_counts from authenticated;
grant select on public.inventory_counts to authenticated;
alter table public.inventory_counts enable row level security;
create policy ic_select on public.inventory_counts for select to authenticated using (app.has_permission(farm_id, 'counts.view'));

create function public.register_count(p_farm uuid, p_date date, p_scope text, p_ref uuid, p_tags text[], p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tags text[]; v_exp text[]; v_miss text[]; v_extr text[]; v_expected integer;
  v_missing jsonb; v_extra jsonb; v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'counts.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  if p_scope not in ('fazenda','lote','pasto') then raise exception 'invalid_scope'; end if;
  if (p_scope = 'fazenda' and p_ref is not null)
     or (p_scope = 'lote' and not exists (select 1 from public.lots l where l.id = p_ref and l.farm_id = p_farm and l.deleted_at is null))
     or (p_scope = 'pasto' and not exists (select 1 from public.pastures p where p.id = p_ref and p.farm_id = p_farm and p.deleted_at is null)) then
    raise exception 'invalid_scope';
  end if;
  select coalesce(array_agg(distinct trim(t)) filter (where trim(t) <> ''), '{}') into v_tags from unnest(coalesce(p_tags, '{}')) t;
  if cardinality(v_tags) > 5000 then raise exception 'invalid_size'; end if;

  select array_agg(a.ear_tag), count(*) into v_exp, v_expected from public.animals a
    where a.farm_id = p_farm and a.status = 'ativo' and a.deleted_at is null
      and (p_scope = 'fazenda' or (p_scope = 'lote' and a.lot_id = p_ref) or (p_scope = 'pasto' and a.pasture_id = p_ref));
  v_exp := coalesce(v_exp, '{}');
  v_miss := array(select unnest(v_exp) except select unnest(v_tags));
  v_extr := array(select unnest(v_tags) except select unnest(v_exp));

  v_missing := coalesce((select jsonb_agg(jsonb_build_object('animal_id', m.id, 'ear_tag', m.ear_tag) order by m.ear_tag)
                         from (select a.id, a.ear_tag from public.animals a
                               where a.farm_id = p_farm and a.status = 'ativo' and a.deleted_at is null and a.ear_tag = any(v_miss)
                               order by a.ear_tag limit 500) m), '[]'::jsonb);
  v_extra := coalesce((select jsonb_agg(jsonb_build_object('tag', t.tag, 'animal_id', an.id,
                         'status', case when an.id is null then 'desconhecido'
                                        when an.status <> 'ativo' then 'nao_ativo' else 'outro_local' end) order by t.tag)
                       from (select u as tag from unnest(v_extr) u order by u limit 500) t
                       left join public.animals an on an.farm_id = p_farm and an.ear_tag = t.tag and an.deleted_at is null), '[]'::jsonb);

  insert into public.inventory_counts (farm_id, count_date, scope, lot_id, pasture_id, counted_total, expected_total,
                                       missing_total, extra_total, missing, extra, notes, created_by)
  values (p_farm, p_date, p_scope, case when p_scope = 'lote' then p_ref end, case when p_scope = 'pasto' then p_ref end,
          cardinality(v_tags), v_expected, cardinality(v_miss), cardinality(v_extr), v_missing, v_extra, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.register_count(uuid, date, text, uuid, text[], text) from public, anon;
grant execute on function public.register_count(uuid, date, text, uuid, text[], text) to authenticated;
create trigger z_audit after insert on public.inventory_counts for each row execute function app.audit_row();


-- >>> MIGRATION: 20261106000019_tasks.sql
-- LOTE 4 · Bloco C · Tarefas (agenda da fazenda)
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: tarefas recorrentes, geradas automaticamente por alertas (vacina, pesagem), notificações por e-mail/WhatsApp.

insert into public.permissions (key, resource, action, description)
select 'tasks.' || a, 'tasks', a, 'tasks · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource = 'tasks' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista','funcionario','operador') and p.action in ('view','create','update'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  due_date date,
  priority text not null default 'normal' check (priority in ('baixa','normal','alta')),
  status text not null default 'aberta' check (status in ('aberta','concluida','cancelada')),
  assigned_to uuid references auth.users(id),
  animal_id uuid, lot_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  completed_at timestamptz, completed_by uuid,
  foreign key (farm_id, animal_id) references public.animals (farm_id, id),
  foreign key (farm_id, lot_id) references public.lots (farm_id, id)
);
create index tasks_farm_idx on public.tasks (farm_id, status, due_date);
revoke all on public.tasks from anon;
revoke insert, update, delete, truncate on public.tasks from authenticated;
grant select on public.tasks to authenticated;
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (app.has_permission(farm_id, 'tasks.view'));

create function public.create_task(p_farm uuid, p_title text, p_desc text, p_due date, p_priority text,
                                   p_assignee uuid, p_animal uuid, p_lot uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'tasks.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_assignee is not null and not exists (
       select 1 from public.memberships m where m.user_id = p_assignee and m.farm_id = p_farm and m.status = 'active') then
    raise exception 'invalid_assignee';
  end if;
  if p_animal is not null and not exists (select 1 from public.animals a where a.id = p_animal and a.farm_id = p_farm and a.deleted_at is null) then
    raise exception 'invalid_animal';
  end if;
  if p_lot is not null and not exists (select 1 from public.lots l where l.id = p_lot and l.farm_id = p_farm and l.deleted_at is null) then
    raise exception 'invalid_lot';
  end if;
  insert into public.tasks (farm_id, title, description, due_date, priority, assigned_to, animal_id, lot_id, created_by)
  values (p_farm, trim(p_title), nullif(trim(p_desc), ''), p_due, coalesce(p_priority, 'normal'), p_assignee, p_animal, p_lot, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.set_task_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.tasks where id = p_id;
  if v_farm is null then raise exception 'invalid_task'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'tasks.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('aberta','concluida','cancelada') then raise exception 'invalid_status'; end if;
  update public.tasks set status = p_status,
    completed_at = case when p_status = 'concluida' then now() end,
    completed_by = case when p_status = 'concluida' then auth.uid() end
  where id = p_id;
end $$;

-- Lista com e-mail do responsável (o e-mail só é lido aqui, para quem pode ver tarefas)
create function public.task_list(p_farm uuid, p_status text default null)
returns table (id uuid, title text, description text, due_date date, priority text, status text,
               assignee_id uuid, assignee_email text, animal_id uuid, ear_tag text, lot_name text, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'tasks.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.id, t.title, t.description, t.due_date, t.priority, t.status, t.assigned_to, u.email::text,
           t.animal_id, a.ear_tag, l.name, t.completed_at
    from public.tasks t
    left join auth.users u on u.id = t.assigned_to
    left join public.animals a on a.id = t.animal_id
    left join public.lots l on l.id = t.lot_id
    where t.farm_id = p_farm and (p_status is null or t.status = p_status)
    order by t.due_date nulls last, t.created_at
    limit 200;
end $$;

create function public.tasks_summary(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  with o as (select t.id, t.title, t.due_date, t.priority from public.tasks t where t.farm_id = p_farm and t.status = 'aberta')
  select jsonb_build_object(
    'open', (select count(*) from o),
    'overdue', (select count(*) from o where due_date < current_date),
    'today', (select count(*) from o where due_date = current_date),
    'next7', (select count(*) from o where due_date between current_date + 1 and current_date + 7),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'due', x.due_date, 'priority', x.priority) order by x.due_date)
                       from (select * from o where due_date is not null and due_date <= current_date + 7 order by due_date limit 10) x), '[]'::jsonb))
$$;
revoke execute on function public.create_task(uuid, text, text, date, text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.set_task_status(uuid, text) from public, anon;
revoke execute on function public.task_list(uuid, text) from public, anon;
revoke execute on function public.tasks_summary(uuid) from public, anon;
grant execute on function public.create_task(uuid, text, text, date, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.set_task_status(uuid, text) to authenticated;
grant execute on function public.task_list(uuid, text) to authenticated;
grant execute on function public.tasks_summary(uuid) to authenticated;
create trigger z_audit after insert or update on public.tasks for each row execute function app.audit_row();


-- >>> MIGRATION: 20261107000020_sales_void_and_presets.sql
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


-- >>> SEED INICIAL DA FAZENDA E PERFIS DE BALANCA PARA rafaeltaka222@gmail.com
DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid := 'a1b2c3d4-0001-4000-8000-000000000001';
  v_farm_id uuid := '912643de-ce02-4fe1-be4b-b6a2dbd87ef5';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'rafaeltaka222@gmail.com' LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.organizations (id, name, document, owner_id)
    VALUES (v_org_id, 'JR Comércio e Exportação de Café', '', v_user_id)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.farms (id, org_id, code, name, city, state)
    VALUES (v_farm_id, v_org_id, '01', 'jr faz', 'São Paulo', 'SP')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.farm_members (farm_id, user_id, role, active)
    VALUES (v_farm_id, v_user_id, 'admin', true)
    ON CONFLICT (farm_id, user_id) DO UPDATE SET role = 'admin', active = true;

    INSERT INTO public.import_layouts (farm_id, name, delimiter, has_header, date_format, decimal_separator, col_animal, col_date, col_time, col_weight, default_time, device_name)
    SELECT v_farm_id, v.name, v.delimiter, v.has_header, v.date_format, v.decimal_separator, v.col_animal, v.col_date, v.col_time, v.col_weight, v.default_time, v.device_name
    FROM (VALUES
      ('Balança Coimma KM-3 Plus (CSV)', 'ponto_e_virgula', true, 'DD/MM/YYYY', ',', 1, 2, 3, 4, '08:00'::time, 'Coimma KM-3 Plus'),
      ('Tru-Test XR5000 / S3 (CSV)', 'virgula', true, 'DD/MM/YYYY', '.', 1, 2, 3, 4, '08:00'::time, 'Tru-Test XR5000'),
      ('IdBeck 3.0 Curral (TXT)', 'tab', false, 'YYYY-MM-DD', '.', 1, 2, NULL, 3, '12:00'::time, 'IdBeck 3.0')
    ) AS v(name, delimiter, has_header, date_format, decimal_separator, col_animal, col_date, col_time, col_weight, default_time, device_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.import_layouts il
      WHERE il.farm_id = v_farm_id AND lower(il.name) = lower(v.name)
    );
  END IF;
END $$;
