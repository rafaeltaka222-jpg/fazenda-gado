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
