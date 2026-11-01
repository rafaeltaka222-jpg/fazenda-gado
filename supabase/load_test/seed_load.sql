-- Carga de dados para medir desempenho (NÃO roda no db reset). STATUS: escrito, AINDA NÃO EXECUTADO.
-- Uso (PowerShell, na pasta do projeto; a fazenda precisa existir):
--   Get-Content supabase\load_test\seed_load.sql | docker exec -i supabase_db_fazenda-gado psql -U postgres -v farm_code=F001 -v n=100000
-- Cria n animais ("LT0000001"...), 10 lotes, 3 pesagens por animal e o evento de entrada. Desliga gatilhos só nesta carga.
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;

create temp table _farm as select id from public.farms where code = :'farm_code' limit 1;
do $$ begin if not exists (select 1 from _farm) then raise exception 'Fazenda não encontrada: crie a fazenda antes'; end if; end $$;

insert into public.lots (farm_id, name) select (select id from _farm), 'LT-' || g from generate_series(1, 10) g
  on conflict do nothing;
create temp table _lots as
  select id, row_number() over (order by name) as rn from public.lots
  where farm_id = (select id from _farm) and name like 'LT-%';
create temp table _breeds as
  select id, row_number() over (order by name) as rn, count(*) over () as c from public.breeds where farm_id = (select id from _farm);

insert into public.animals (farm_id, ear_tag, sex, lot_id, breed_id, birth_date, entry_date)
select (select id from _farm), 'LT' || lpad(g::text, 7, '0'), case when random() < 0.5 then 'M' else 'F' end,
       l.id, b.id, current_date - (200 + (random() * 600)::int), current_date - 90
from generate_series(1, :n) g
join _lots l on l.rn = 1 + (g % 10)
join _breeds b on b.rn = 1 + (g % (select max(c) from _breeds))
on conflict do nothing;

insert into public.animal_events (farm_id, animal_id, event_type, event_date, details)
select a.farm_id, a.id, 'entrada', coalesce(a.entry_date, current_date), '{}'::jsonb
from public.animals a where a.farm_id = (select id from _farm) and a.ear_tag like 'LT%'
  and not exists (select 1 from public.animal_events e where e.animal_id = a.id);

insert into public.weighings (farm_id, animal_id, weighed_at, weight_kg, source, device_id)
select a.farm_id, a.id, now() - make_interval(days => v.d), round((250 + random() * 100 + v.k * 20)::numeric, 2), 'importacao', 'carga'
from public.animals a cross join (values (60, 0), (30, 1), (1, 2)) v(d, k)
where a.farm_id = (select id from _farm) and a.ear_tag like 'LT%'
on conflict do nothing;

commit;
analyze;
