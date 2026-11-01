-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('a4a4a4a4-0000-0000-0000-a4a4a4a4a4a4', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');
insert into public.lots (farm_id, name) values ((select id from public.farms where code = 'B1'), 'LB');
select set_config('t.lot_b', (select id from public.lots where name = 'LB')::text, true);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.lots (farm_id, name) values (current_setting('t.farm_a')::uuid, 'L1'), (current_setting('t.farm_a')::uuid, 'L2');
insert into public.animals (farm_id, ear_tag, sex, lot_id) values
  (current_setting('t.farm_a')::uuid, 'K1', 'M', (select id from public.lots where name = 'L1')),
  (current_setting('t.farm_a')::uuid, 'K2', 'M', (select id from public.lots where name = 'L1')),
  (current_setting('t.farm_a')::uuid, 'K3', 'F', (select id from public.lots where name = 'L1')),
  (current_setting('t.farm_a')::uuid, 'K4', 'F', (select id from public.lots where name = 'L2')),
  (current_setting('t.farm_a')::uuid, 'K5', 'F', (select id from public.lots where name = 'L1'));
select public.register_movement(current_setting('t.farm_a')::uuid, array[(select id from public.animals where ear_tag = 'K5')],
  'venda', current_date, null, null, null);
insert into public.memberships (user_id, farm_id, role_id) values
  ('a4a4a4a4-0000-0000-0000-a4a4a4a4a4a4', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select set_config('t.c1', public.register_count(current_setting('t.farm_a')::uuid, current_date, 'lote',
  (select id from public.lots where name = 'L1'), array['K1','K2','K9'], null)::text, true);
select is((select expected_total || '/' || counted_total || '/' || missing_total || '/' || extra_total
           from public.inventory_counts where id = current_setting('t.c1')::uuid), '3/3/1/1',
  'contagem do lote: esperado 3, contado 3, 1 faltando, 1 sobrando');
select is((select extra -> 0 ->> 'status' from public.inventory_counts where id = current_setting('t.c1')::uuid), 'desconhecido',
  'brinco que não existe é classificado como desconhecido');
select set_config('t.c2', public.register_count(current_setting('t.farm_a')::uuid, current_date, 'lote',
  (select id from public.lots where name = 'L1'), array['K1','K2','K3','K4','K5'], null)::text, true);
select is((select jsonb_path_query_array(extra, '$[*] ? (@.tag == "K4").status') ->> 0
           from public.inventory_counts where id = current_setting('t.c2')::uuid), 'outro_local',
  'animal ativo em outro lote é classificado como em outro local');
select is((select jsonb_path_query_array(extra, '$[*] ? (@.tag == "K5").status') ->> 0
           from public.inventory_counts where id = current_setting('t.c2')::uuid), 'nao_ativo',
  'animal vendido é classificado como não ativo');
select set_config('t.c3', public.register_count(current_setting('t.farm_a')::uuid, current_date, 'fazenda', null, array['K1'], null)::text, true);
select is((select expected_total from public.inventory_counts where id = current_setting('t.c3')::uuid), 4,
  'contagem da fazenda espera os 4 animais ativos');
select throws_ok($$select public.register_count(current_setting('t.farm_a')::uuid, current_date, 'lote', current_setting('t.lot_b')::uuid, array['K1'], null)$$,
  'P0001', 'invalid_scope', 'lote de outra fazenda é recusado');
select throws_ok($$select public.register_count(current_setting('t.farm_a')::uuid, current_date + 1, 'fazenda', null, array['K1'], null)$$,
  'P0001', 'invalid_date', 'data futura é recusada');
select throws_ok($$update public.inventory_counts set notes = 'x'$$, '42501', null, 'contagens não são editáveis');

select set_config('request.jwt.claims', '{"sub":"a4a4a4a4-0000-0000-0000-a4a4a4a4a4a4","role":"authenticated"}', true);
select throws_ok($$select public.register_count(current_setting('t.farm_a')::uuid, current_date, 'fazenda', null, array['K1'], null)$$,
  '42501', null, 'visualização não registra contagens');

select * from finish();
rollback;
