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
