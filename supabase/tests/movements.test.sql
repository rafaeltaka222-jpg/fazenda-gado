-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('55555555-5555-5555-5555-555555555555', 'y@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

-- Animal da fazenda B criado como superusuário
reset role;
insert into public.animals (id, farm_id, ear_tag, sex)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from public.farms where code = 'B1'), 'B-001', 'M');
set local role authenticated;

-- Fazenda A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.lots (farm_id, name) values
  ((select id from public.farms where code = 'A1'), 'L10'),
  ((select id from public.farms where code = 'A1'), 'L20');
insert into public.animals (farm_id, ear_tag, sex, lot_id) values
  ((select id from public.farms where code = 'A1'), '000123', 'M', (select id from public.lots where name = 'L10')),
  ((select id from public.farms where code = 'A1'), 'LT1', 'M', (select id from public.lots where name = 'L10')),
  ((select id from public.farms where code = 'A1'), 'LT2', 'M', (select id from public.lots where name = 'L10')),
  ((select id from public.farms where code = 'A1'), 'LT3', 'F', (select id from public.lots where name = 'L10')),
  ((select id from public.farms where code = 'A1'), 'VND1', 'F', (select id from public.lots where name = 'L10'));

select is((select count(*)::int from public.animal_events where event_type = 'entrada'), 5,
          'cada animal cadastrado gera um evento de entrada');
select is((select public.register_movement((select id from public.farms where code = 'A1'),
            array[(select id from public.animals where ear_tag = '000123')], 'transferencia', current_date,
            (select id from public.lots where name = 'L20'), null, 'teste')), 1,
          'transferência individual movimenta 1 animal');
select is((select l.name from public.animals a join public.lots l on l.id = a.lot_id where a.ear_tag = '000123'),
          'L20', 'lote atual do animal reflete a transferência');
select throws_ok($$update public.animals set lot_id = (select id from public.lots where name = 'L10') where ear_tag = '000123'$$,
                 '42501', null, 'lote não pode ser alterado diretamente');
select is((select count(*)::int from public.animal_events
           where animal_id = (select id from public.animals where ear_tag = '000123')), 2,
          'histórico do animal tem entrada e transferência');
select is((select public.register_movement((select id from public.farms where code = 'A1'),
            array(select id from public.animals where ear_tag in ('LT1','LT2','LT3')), 'transferencia', current_date,
            (select id from public.lots where name = 'L20'), null, null)), 3,
          'operação em lote movimenta os 3 animais');

select public.register_movement((select id from public.farms where code = 'A1'),
  array[(select id from public.animals where ear_tag = 'VND1')], 'venda', current_date, null, null, null);
select throws_ok($$select public.register_movement((select id from public.farms where code = 'A1'),
  array[(select id from public.animals where ear_tag = 'VND1')], 'transferencia', current_date,
  (select id from public.lots where name = 'L20'), null, null)$$,
  'P0001', 'invalid_animals', 'animal vendido não pode ser movimentado');
select throws_ok($$select public.register_movement((select id from public.farms where code = 'A1'),
  array['dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid], 'morte', current_date, null, null, null)$$,
  'P0001', 'invalid_animals', 'animal de outra fazenda não pode ser movimentado');
select throws_ok($$update public.animal_events set event_type = 'morte'$$, '42501', null,
                 'eventos do animal são imutáveis');
select throws_ok($$select public.register_movement((select id from public.farms where code = 'A1'),
  array[(select id from public.animals where ear_tag = 'LT1')], 'morte', current_date + 1, null, null, null)$$,
  'P0001', 'invalid_date', 'data futura é recusada');

-- Perfil de visualização
insert into public.memberships (user_id, farm_id, role_id) values
  ('55555555-5555-5555-5555-555555555555', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'visualizacao'));
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select throws_ok($$select public.register_movement((select id from public.farms where code = 'A1'),
  array[(select id from public.animals where ear_tag = 'LT1')], 'morte', current_date, null, null, null)$$,
  '42501', null, 'visualização não registra movimentação');

-- Fazenda B só enxerga os próprios eventos
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.animal_events), 1, 'fazenda B enxerga só os próprios eventos');

select * from finish();
rollback;
