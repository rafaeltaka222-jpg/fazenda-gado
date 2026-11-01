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
