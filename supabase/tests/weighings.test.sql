-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('66666666-6666-6666-6666-666666666666', 'y@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

reset role;
insert into public.animals (id, farm_id, ear_tag, sex)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from public.farms where code = 'B1'), 'B-001', 'M');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.animals (farm_id, ear_tag, sex) values
  ((select id from public.farms where code = 'A1'), 'W1', 'M'),
  ((select id from public.farms where code = 'A1'), 'W2', 'F');

select is((select (public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-01T08:00:00-03:00', 'weight_kg', 400))))->>'inserted'), '1',
  'pesagem manual é registrada');
select is((select jsonb_array_length((public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-21T08:00:00-03:00', 'weight_kg', 420))))->'warnings')), 0,
  'variação normal não gera aviso');
select is((select jsonb_array_length((public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-22T08:00:00-03:00', 'weight_kg', 700))))->'warnings')), 1,
  'variação brusca gera aviso, sem bloquear');
select is((select last_weight from public.animal_weight_summary(array[(select id from public.animals where ear_tag = 'W1')])),
  700.00, 'resumo traz a última pesagem');
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-01T08:00:00-03:00', 'weight_kg', 405)))$$,
  '23505', null, 'mesma pesagem não é duplicada');
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2999-01-01T00:00:00Z', 'weight_kg', 400)))$$,
  'P0001', 'invalid_date', 'data futura é recusada');
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-05T08:00:00-03:00', 'weight_kg', 0)))$$,
  'P0001', 'invalid_weight', 'peso zero é recusado');

select public.register_movement((select id from public.farms where code = 'A1'),
  array[(select id from public.animals where ear_tag = 'W2')], 'venda', current_date, null, null, null);
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W2'),
    'weighed_at', '2026-09-05T08:00:00-03:00', 'weight_kg', 300)))$$,
  'P0001', 'invalid_animals', 'animal vendido não pode ser pesado');
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'weighed_at', '2026-09-05T08:00:00-03:00', 'weight_kg', 300)))$$,
  'P0001', 'invalid_animals', 'animal de outra fazenda não pode ser pesado');

select public.void_weighing((select id from public.weighings where weight_kg = 700), 'erro de digitação');
select is((select last_weight::int from public.animal_weight_summary(array[(select id from public.animals where ear_tag = 'W1')])),
  420, 'pesagem anulada deixa de contar nos cálculos');
select throws_ok($$update public.weighings set weight_kg = 1$$, '42501', null, 'pesagens não são editáveis diretamente');

insert into public.memberships (user_id, farm_id, role_id) values
  ('66666666-6666-6666-6666-666666666666', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'visualizacao'));
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select throws_ok($$select public.register_weighings((select id from public.farms where code = 'A1'),
  jsonb_build_array(jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'W1'),
    'weighed_at', '2026-09-10T08:00:00-03:00', 'weight_kg', 410)))$$,
  '42501', null, 'visualização não lança pesagem');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.weighings), 0, 'fazenda B não enxerga pesagens da fazenda A');

select * from finish();
rollback;
