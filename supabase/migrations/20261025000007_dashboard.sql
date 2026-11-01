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
