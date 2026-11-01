-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('a3a3a3a3-0000-0000-0000-a3a3a3a3a3a3', 'f@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'SX1', 'M'), (current_setting('t.farm_a')::uuid, 'SX2', 'F');
insert into public.people (farm_id, name) values (current_setting('t.farm_a')::uuid, 'Joao SX');
insert into public.memberships (user_id, farm_id, role_id) values
  ('a3a3a3a3-0000-0000-0000-a3a3a3a3a3a3', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'funcionario'));
select public.register_weighings(current_setting('t.farm_a')::uuid, jsonb_build_array(
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'SX1'), 'weighed_at', (now() - interval '40 days')::text, 'weight_kg', 300),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'SX1'), 'weighed_at', (now() - interval '1 hour')::text, 'weight_kg', 400),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'SX2'), 'weighed_at', (now() - interval '2 hours')::text, 'weight_kg', 420)));

select is((select count(*)::int from public.weight_trend(current_setting('t.farm_a')::uuid, 6)), 2, 'evolução do peso agrupa por mês');
select is((select avg_weight from public.weight_trend(current_setting('t.farm_a')::uuid, 6) order by month desc limit 1), 410.0,
  'peso médio do mês atual');
select is(jsonb_array_length(public.global_search(current_setting('t.farm_a')::uuid, 'SX') -> 'animals'), 2, 'busca encontra animais pelo brinco');
select is(jsonb_array_length(public.global_search(current_setting('t.farm_a')::uuid, '%%') -> 'animals'), 0, 'curinga é tratado como texto literal');
select is(jsonb_array_length(public.global_search(current_setting('t.farm_a')::uuid, 'Joao') -> 'people'), 1, 'administrador encontra pessoas');

select set_config('request.jwt.claims', '{"sub":"a3a3a3a3-0000-0000-0000-a3a3a3a3a3a3","role":"authenticated"}', true);
select is(jsonb_array_length(public.global_search(current_setting('t.farm_a')::uuid, 'Joao') -> 'people'), 0, 'funcionário não encontra pessoas');

select * from finish();
rollback;
