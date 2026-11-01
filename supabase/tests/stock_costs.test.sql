-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('e1e1e1e1-0000-0000-0000-e1e1e1e1e1e1', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.lots (farm_id, name) values (current_setting('t.farm_a')::uuid, 'L1');
insert into public.stock_items (farm_id, name, unit, category, min_quantity)
  values (current_setting('t.farm_a')::uuid, 'Sal mineral', 'kg', 'sal_mineral', 100);
insert into public.memberships (user_id, farm_id, role_id) values
  ('e1e1e1e1-0000-0000-0000-e1e1e1e1e1e1', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select public.register_stock_movement(current_setting('t.farm_a')::uuid, (select id from public.stock_items where name = 'Sal mineral'),
  'entrada', 500, current_date, 3.00, current_date + 10, 'Fornecedor X', 'NF 1', null, null);
select is((select balance from public.stock_balances(current_setting('t.farm_a')::uuid) where name = 'Sal mineral'), 500::numeric,
  'entrada aumenta o saldo');
select throws_ok($$select public.register_stock_movement(current_setting('t.farm_a')::uuid, (select id from public.stock_items where name = 'Sal mineral'),
  'saida', 600, current_date, null, null, null, null, null, null)$$, 'P0001', 'insufficient_stock', 'saída maior que o saldo é recusada');

select public.register_stock_movement(current_setting('t.farm_a')::uuid, (select id from public.stock_items where name = 'Sal mineral'),
  'saida', 200, current_date, null, null, null, null, (select id from public.lots where name = 'L1'), null);
select is((select amount from public.cost_entries where stock_movement_id is not null), 600.00,
  'saída gera custo pelo custo médio das entradas (200 kg x 3,00)');
select is((select balance from public.stock_balances(current_setting('t.farm_a')::uuid) where name = 'Sal mineral'), 300::numeric,
  'saída reduz o saldo');
select public.register_stock_movement(current_setting('t.farm_a')::uuid, (select id from public.stock_items where name = 'Sal mineral'),
  'saida', 250, current_date, null, null, null, null, null, null);
select is((select below_min from public.stock_balances(current_setting('t.farm_a')::uuid) where name = 'Sal mineral'), true,
  'saldo abaixo do mínimo é sinalizado');
select is((public.stock_alerts(current_setting('t.farm_a')::uuid) ->> 'low')::int, 1, 'alerta de estoque baixo');

select public.void_stock_movement((select id from public.stock_movements where quantity = 200 and kind = 'saida'), 'lançamento errado');
select is((select count(*)::int from public.cost_entries where voided_at is not null), 1, 'anular a saída anula o custo gerado');
select throws_ok($$select public.void_stock_movement((select id from public.stock_movements where kind = 'entrada'), 'teste')$$,
  'P0001', 'would_make_negative', 'não anula entrada que deixaria o saldo negativo');

insert into public.cost_entries (farm_id, cost_date, description, category, amount, target_type, lot_id)
  values (current_setting('t.farm_a')::uuid, current_date, 'Veterinário', 'sanidade', 100.00, 'lote', (select id from public.lots where name = 'L1'));
select is(((public.cost_summary(current_setting('t.farm_a')::uuid, current_date - 30, current_date)) ->> 'total')::numeric, 850.00,
  'resumo soma os custos válidos do período');
select throws_ok($$update public.stock_movements set quantity = 1$$, '42501', null, 'movimentos de estoque não são editáveis');

select set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-e1e1e1e1e1e1","role":"authenticated"}', true);
select throws_ok($$select public.register_stock_movement(current_setting('t.farm_a')::uuid, (select id from public.stock_items where name = 'Sal mineral'),
  'entrada', 1, current_date, null, null, null, null, null, null)$$, '42501', null, 'visualização não movimenta estoque');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.stock_balances(current_setting('t.farm_a')::uuid)), 0, 'fazenda B não enxerga o estoque da fazenda A');

select * from finish();
rollback;
