-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('99999999-9999-9999-9999-999999999999', 'v@teste.local'),
  ('12121212-1212-1212-1212-121212121212', 't@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'R1', 'M'), (current_setting('t.farm_a')::uuid, 'R2', 'M'),
  (current_setting('t.farm_a')::uuid, 'R3', 'F'), (current_setting('t.farm_a')::uuid, 'R4', 'F');
select public.register_weighings(current_setting('t.farm_a')::uuid, jsonb_build_array(
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'R1'), 'weighed_at', '2026-09-01T08:00:00-03:00', 'weight_kg', 450),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'R2'), 'weighed_at', '2026-09-01T08:00:00-03:00', 'weight_kg', 380),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'R4'), 'weighed_at', '2026-09-01T08:00:00-03:00', 'weight_kg', 300)));
insert into public.memberships (user_id, farm_id, role_id) values
  ('99999999-9999-9999-9999-999999999999', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao')),
  ('12121212-1212-1212-1212-121212121212', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'veterinario'));

select is((public.run_report(current_setting('t.farm_a')::uuid, '{"source":"animals","fields":["ear_tag"]}'::jsonb) ->> 'total')::int, 4,
  'consulta sem filtro traz todos os animais');
select is((public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag"],"filters":[{"field":"sex","op":"eq","value":"Macho"}]}'::jsonb) ->> 'total')::int, 2,
  'filtro por sexo');
select is((public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag"],"filters":[{"field":"last_weight","op":"gt","value":400}]}'::jsonb) ->> 'total')::int, 1,
  'filtro numérico: peso acima de 400 kg');
select throws_ok($$select public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag; drop table public.animals"]}'::jsonb)$$,
  'P0001', 'invalid_field', 'nome de campo fora do catálogo é recusado');
select is((public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag"],"filters":[{"field":"name","op":"eq","value":"x'' or ''1''=''1"}]}'::jsonb) ->> 'total')::int, 0,
  'tentativa de injeção no valor do filtro não retorna nada');
select is((select count(*)::int from public.animals), 4, 'a tabela de animais continua intacta');
select is((public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag"],"filters":[{"field":"ear_tag","op":"contains","value":"%"}]}'::jsonb) ->> 'total')::int, 0,
  'caractere curinga é tratado como texto literal');
select is((public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag","last_weight"],"order_by":[{"field":"last_weight","dir":"desc"}]}'::jsonb) -> 'rows' -> 0 ->> 'ear_tag'),
  'R1', 'ordenação decrescente por peso');
select throws_ok($$select public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag"],"filters":[{"field":"name","op":"gt","value":"a"}]}'::jsonb)$$,
  'P0001', 'invalid_operator', 'operador incompatível com o tipo do campo é recusado');

insert into public.saved_reports (farm_id, name, definition)
  values (current_setting('t.farm_a')::uuid, 'Minha consulta', '{"source":"animals","fields":["ear_tag"]}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
select is((select count(*)::int from public.saved_reports), 0, 'consulta não compartilhada não aparece para outro usuário');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
update public.saved_reports set shared = true where name = 'Minha consulta';
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
select is((select count(*)::int from public.saved_reports), 1, 'consulta compartilhada aparece para quem pode ver relatórios');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select public.run_report(current_setting('t.farm_a')::uuid, '{"source":"animals","fields":["ear_tag"]}'::jsonb)$$,
  '42501', null, 'outra fazenda não executa relatórios da fazenda A');

select set_config('request.jwt.claims', '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}', true);
select throws_ok($$select public.run_report(current_setting('t.farm_a')::uuid, '{"source":"animals","fields":["ear_tag"]}'::jsonb)$$,
  '42501', null, 'perfil sem permissão de relatórios é barrado');

select * from finish();
rollback;
