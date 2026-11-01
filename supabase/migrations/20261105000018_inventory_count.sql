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
