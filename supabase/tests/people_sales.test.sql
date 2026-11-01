-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('a2a2a2a2-0000-0000-0000-a2a2a2a2a2a2', 'f@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'S1', 'M'), (current_setting('t.farm_a')::uuid, 'S2', 'M'), (current_setting('t.farm_a')::uuid, 'S3', 'F');
insert into public.memberships (user_id, farm_id, role_id) values
  ('a2a2a2a2-0000-0000-0000-a2a2a2a2a2a2', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'funcionario'));

select lives_ok($$insert into public.people (farm_id, name, person_roles, document) values
  (current_setting('t.farm_a')::uuid, 'Comprador X', array['comprador'], '529.982.247-25')$$, 'CPF válido é aceito');
select throws_ok($$insert into public.people (farm_id, name, document) values
  (current_setting('t.farm_a')::uuid, 'Inválido', '111.111.111-11')$$, '23514', null, 'CPF inválido é recusado');
select lives_ok($$insert into public.people (farm_id, name, person_roles, document) values
  (current_setting('t.farm_a')::uuid, 'Frigorífico', array['comprador','fornecedor'], '11.222.333/0001-81')$$, 'CNPJ válido é aceito');
select throws_ok($$insert into public.people (farm_id, name, document) values
  (current_setting('t.farm_a')::uuid, 'Duplicado', '52998224725')$$, '23505', null, 'mesmo documento na fazenda é recusado');

select isnt(public.register_sale(current_setting('t.farm_a')::uuid,
  array(select id from public.animals where ear_tag in ('S1','S2')), current_date,
  (select id from public.people where name = 'Comprador X'), 5000, 'NF 10', null), null, 'venda é registrada com comprador e valor');
select is((select count(*)::int from public.animals where status = 'vendido'), 2, 'venda encerra os animais');
select is(((public.sales_summary(current_setting('t.farm_a')::uuid, current_date - 1, current_date)) ->> 'total')::numeric, 5000.00,
  'resumo de vendas soma o valor');
select throws_ok($$select public.register_sale(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'S1')], current_date, null, 100, null, null)$$,
  'P0001', 'invalid_animals', 'animal já vendido não pode ser vendido de novo');
select throws_ok($$update public.sales set total_amount = 1$$, '42501', null, 'vendas não são editáveis');

select set_config('request.jwt.claims', '{"sub":"a2a2a2a2-0000-0000-0000-a2a2a2a2a2a2","role":"authenticated"}', true);
select throws_ok($$select public.register_sale(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'S3')], current_date, null, 100, null, null)$$,
  '42501', null, 'funcionário não registra vendas');
select is((select count(*)::int from public.people), 0, 'funcionário não vê o cadastro de pessoas');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is(((public.sales_summary(current_setting('t.farm_a')::uuid, current_date - 1, current_date)) ->> 'total')::numeric, 0::numeric,
  'fazenda B não enxerga as vendas da fazenda A');

select * from finish();
rollback;
