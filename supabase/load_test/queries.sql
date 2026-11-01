-- Mede o tempo das consultas principais após a carga. STATUS: escrito, AINDA NÃO EXECUTADO.
-- Uso: Get-Content supabase\load_test\queries.sql | docker exec -i supabase_db_fazenda-gado psql -U postgres -v farm_code=F001
\timing on
select id as farm from public.farms where code = :'farm_code' \gset
select m.user_id as uid from public.memberships m join public.roles r on r.id = m.role_id
  where m.farm_id = :'farm' and r.name = 'administrador' limit 1 \gset

\echo '--- Painel (dashboard_summary)'
select public.dashboard_summary(:'farm') ->> 'active' as ativos;

set role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid'), false);

\echo '--- Relatório sem filtro (100 linhas)'
select (public.run_report(:'farm', '{"source":"animals","fields":["ear_tag","breed","lot","last_weight"]}'::jsonb, 100, 0) ->> 'total') as total;
\echo '--- Relatório com filtro e ordenação'
select (public.run_report(:'farm',
  '{"source":"animals","fields":["ear_tag","lot","last_weight","gmd"],"filters":[{"field":"last_weight","op":"gt","value":400}],"order_by":[{"field":"last_weight","dir":"desc"}]}'::jsonb, 100, 0) ->> 'total') as total;
\echo '--- Lista do rebanho (página de 25)'
select count(*) from (select id, ear_tag from public.animals where farm_id = :'farm' and status = 'ativo' order by ear_tag limit 25) t;
reset role;
-- Meta de referência do projeto: telas principais abaixo de ~2 s com 100 mil animais. Registre os tempos e as medições em docs.
