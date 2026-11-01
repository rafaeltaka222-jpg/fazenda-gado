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
