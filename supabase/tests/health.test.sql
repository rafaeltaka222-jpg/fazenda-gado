-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('abababab-0000-0000-0000-abababababab', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

reset role;
insert into public.health_products (id, farm_id, name, kind)
  values ('ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from public.farms where code = 'B1'), 'Prod B', 'vacina');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'H1', 'M'), (current_setting('t.farm_a')::uuid, 'H2', 'F'),
  (current_setting('t.farm_a')::uuid, 'H3', 'F');
insert into public.health_products (farm_id, name, kind, withdrawal_days)
  values (current_setting('t.farm_a')::uuid, 'Med X', 'medicamento', 10);

select is(public.register_health(current_setting('t.farm_a')::uuid,
  array(select id from public.animals where ear_tag in ('H1','H2')),
  (select id from public.health_products where name = 'Febre aftosa'), date '2026-09-01', '2 ml', null, 'L123', null), 2,
  'aplicação em lote registra os 2 animais');
select public.register_health(current_setting('t.farm_a')::uuid, array[(select id from public.animals where ear_tag = 'H3')],
  (select id from public.health_products where name = 'Med X'), date '2026-09-01', null, null, null, null);
select is((select e.withdrawal_until from public.health_events e
           where e.animal_id = (select id from public.animals where ear_tag = 'H3')), date '2026-09-11',
  'carência é calculada a partir da data da aplicação');
select throws_ok($$select public.register_health(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'H1')], (select id from public.health_products where name = 'Raiva'),
  date '2026-09-01', null, date '2026-09-01', null, null)$$, 'P0001', 'invalid_next_date', 'próxima dose deve ser posterior à aplicação');
select throws_ok($$select public.register_health(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'H1')], (select id from public.health_products where name = 'Raiva'),
  current_date + 1, null, null, null, null)$$, 'P0001', 'invalid_date', 'data futura é recusada');

select public.register_movement(current_setting('t.farm_a')::uuid, array[(select id from public.animals where ear_tag = 'H2')],
  'venda', current_date, null, null, null);
select throws_ok($$select public.register_health(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'H2')], (select id from public.health_products where name = 'Raiva'),
  date '2026-09-01', null, null, null, null)$$, 'P0001', 'invalid_animals', 'animal vendido não recebe aplicação');
select throws_ok($$select public.register_health(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'H1')], 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  date '2026-09-01', null, null, null, null)$$, 'P0001', 'invalid_product', 'produto de outra fazenda é recusado');

select public.register_health(current_setting('t.farm_a')::uuid, array[(select id from public.animals where ear_tag = 'H1')],
  (select id from public.health_products where name = 'Brucelose'), date '2026-01-01', null, date '2026-02-01', null, null);
select is((public.health_alerts(current_setting('t.farm_a')::uuid) ->> 'overdue')::int, 1, 'dose atrasada gera alerta');
select public.void_health_event((select id from public.health_events where next_due_date = date '2026-02-01'), 'registro errado');
select is((public.health_alerts(current_setting('t.farm_a')::uuid) ->> 'overdue')::int, 0, 'aplicação anulada sai dos alertas');
select throws_ok($$update public.health_events set dose = 'x'$$, '42501', null, 'aplicações não são editáveis diretamente');

insert into public.memberships (user_id, farm_id, role_id) values
  ('abababab-0000-0000-0000-abababababab', current_setting('t.farm_a')::uuid,
   (select id from public.roles where is_system and name = 'visualizacao'));
select set_config('request.jwt.claims', '{"sub":"abababab-0000-0000-0000-abababababab","role":"authenticated"}', true);
select throws_ok($$select public.register_health(current_setting('t.farm_a')::uuid,
  array[(select id from public.animals where ear_tag = 'H1')], (select id from public.health_products where name = 'Raiva'),
  date '2026-09-01', null, null, null, null)$$, '42501', null, 'visualização não registra aplicações');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((public.health_alerts(current_setting('t.farm_a')::uuid) ->> 'overdue')::int, 0, 'fazenda B não enxerga alertas da fazenda A');

select * from finish();
rollback;
