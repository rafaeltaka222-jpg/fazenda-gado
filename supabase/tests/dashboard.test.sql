-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('88888888-8888-8888-8888-888888888888', 'f@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.lots (farm_id, name) values (current_setting('t.farm_a')::uuid, 'L1');
insert into public.animals (farm_id, ear_tag, sex, lot_id) values
  (current_setting('t.farm_a')::uuid, 'D1', 'M', (select id from public.lots where name = 'L1')),
  (current_setting('t.farm_a')::uuid, 'D2', 'M', (select id from public.lots where name = 'L1')),
  (current_setting('t.farm_a')::uuid, 'D3', 'F', null),
  (current_setting('t.farm_a')::uuid, 'D4', 'F', null);
select public.register_movement(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'D4')], 'venda', current_date, null, null, null);
select public.register_weighings(current_setting('t.farm_a')::uuid, jsonb_build_array(
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'D1'),
    'weighed_at', (now() - interval '20 days')::text, 'weight_kg', 400),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'D1'),
    'weighed_at', (now() - interval '10 days')::text, 'weight_kg', 420),
  jsonb_build_object('animal_id', (select id from public.animals where ear_tag = 'D2'),
    'weighed_at', (now() - interval '70 days')::text, 'weight_kg', 300)));
select set_config('t.sum', public.dashboard_summary(current_setting('t.farm_a')::uuid)::text, true);

select is((current_setting('t.sum')::jsonb ->> 'active')::int, 3, 'conta os animais ativos');
select is((current_setting('t.sum')::jsonb ->> 'males') || '/' || (current_setting('t.sum')::jsonb ->> 'females')
          || '/' || (current_setting('t.sum')::jsonb ->> 'sold'), '2/1/1', 'conta machos, fêmeas e vendidos');
select is((current_setting('t.sum')::jsonb ->> 'avg_weight')::numeric, 360.0, 'peso médio usa a última pesagem de cada animal');
select is((current_setting('t.sum')::jsonb ->> 'avg_gmd')::numeric, 2.00, 'ganho médio diário entre as duas últimas pesagens');
select is((current_setting('t.sum')::jsonb ->> 'never_weighed') || '/' || (current_setting('t.sum')::jsonb ->> 'stale_60d'),
          '1/1', 'conta animais nunca pesados e sem pesagem há mais de 60 dias');
select is(jsonb_array_length(current_setting('t.sum')::jsonb -> 'by_lot'), 2, 'distribuição por lote inclui "Sem lote"');

insert into public.memberships (user_id, farm_id, role_id) values
  ('88888888-8888-8888-8888-888888888888', current_setting('t.farm_a')::uuid,
   (select id from public.roles where is_system and name = 'funcionario'));
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select ok(public.my_permissions(current_setting('t.farm_a')::uuid) @> array['animals.view'],
          'funcionário tem permissão de ver animais');
select ok(not (public.my_permissions(current_setting('t.farm_a')::uuid) @> array['users.delete']),
          'funcionário não tem permissão de excluir usuários');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((public.dashboard_summary(current_setting('t.farm_a')::uuid) ->> 'active')::int, 0,
          'fazenda B não enxerga indicadores da fazenda A');

select * from finish();
rollback;
