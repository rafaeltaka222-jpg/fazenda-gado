-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('c1c1c1c1-0000-0000-0000-c1c1c1c1c1c1', 'w@teste.local'),
  ('c2c2c2c2-0000-0000-0000-c2c2c2c2c2c2', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'C1', 'M'), (current_setting('t.farm_a')::uuid, 'C2', 'F');
insert into public.field_definitions (farm_id, field_key, label, data_type, options) values
  (current_setting('t.farm_a')::uuid, 'genetica', 'Classificação genética', 'list', '["Nelore PO","Angus"]'::jsonb);
insert into public.field_definitions (farm_id, field_key, label, data_type, visible_to, editable_to) values
  (current_setting('t.farm_a')::uuid, 'valor_compra', 'Valor de compra', 'money',
   array['administrador','gerente'], array['administrador','gerente']);
insert into public.field_definitions (farm_id, field_key, label, data_type, condition) values
  (current_setting('t.farm_a')::uuid, 'cio', 'Data do primeiro cio', 'date', '{"field":"sex","op":"eq","value":"F"}'::jsonb);
insert into public.memberships (user_id, farm_id, role_id) values
  ('c1c1c1c1-0000-0000-0000-c1c1c1c1c1c1', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'funcionario')),
  ('c2c2c2c2-0000-0000-0000-c2c2c2c2c2c2', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select public.set_animal_custom((select id from public.animals where ear_tag = 'C1'),
  '{"genetica":"Angus","valor_compra":"1500,50"}'::jsonb);
select is(public.get_animal_custom((select id from public.animals where ear_tag = 'C1')) ->> 'genetica', 'Angus',
  'campo de lista é gravado e lido');
select is((public.get_animal_custom((select id from public.animals where ear_tag = 'C1')) ->> 'valor_compra')::numeric, 1500.50,
  'campo monetário aceita vírgula e guarda duas casas');
select throws_ok($$select public.set_animal_custom((select id from public.animals where ear_tag = 'C1'), '{"genetica":"Holandês"}'::jsonb)$$,
  'P0001', 'invalid_value', 'opção fora da lista é recusada');
select public.set_animal_custom((select id from public.animals where ear_tag = 'C1'), '{"cio":"2026-01-10"}'::jsonb);
select is(public.get_animal_custom((select id from public.animals where ear_tag = 'C1')) ? 'cio', false,
  'campo condicional é descartado quando a condição não é atendida (macho)');
select is(public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag","cf:genetica"],"filters":[{"field":"cf:genetica","op":"eq","value":"Angus"}]}'::jsonb) ->> 'total',
  '1', 'campo personalizado funciona como filtro e coluna de relatório');
select throws_ok($$update public.animals set custom = '{}'::jsonb$$, '42501', null, 'coluna de valores não é gravável diretamente');
select throws_ok($$update public.field_definitions set data_type = 'text' where field_key = 'genetica'$$,
  '42501', null, 'tipo do campo não pode ser alterado');

insert into public.field_definitions (farm_id, field_key, label, data_type, required) values
  (current_setting('t.farm_a')::uuid, 'origem_cod', 'Código de origem', 'text', true);
select throws_ok($$select public.set_animal_custom((select id from public.animals where ear_tag = 'C1'), '{"genetica":"Angus"}'::jsonb)$$,
  'P0001', 'required_missing:origem_cod', 'campo obrigatório sem valor é recusado');

select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-c1c1c1c1c1c1","role":"authenticated"}', true);
select is(public.get_animal_custom((select id from public.animals where ear_tag = 'C1')) ? 'valor_compra', false,
  'funcionário não vê o campo restrito');
select is(public.get_animal_custom((select id from public.animals where ear_tag = 'C1')) ->> 'genetica', 'Angus',
  'funcionário vê os campos liberados');
select throws_ok($$select public.set_animal_custom((select id from public.animals where ear_tag = 'C1'), '{"valor_compra":"1"}'::jsonb)$$,
  '42501', null, 'funcionário não grava campo restrito');
select throws_ok($$select custom from public.animals$$, '42501', null, 'coluna de valores não é legível diretamente');

select set_config('request.jwt.claims', '{"sub":"c2c2c2c2-0000-0000-0000-c2c2c2c2c2c2","role":"authenticated"}', true);
select is(public.run_report(current_setting('t.farm_a')::uuid,
  '{"source":"animals","fields":["ear_tag","cf:valor_compra"],"filters":[{"field":"ear_tag","op":"eq","value":"C1"}]}'::jsonb) -> 'rows' -> 0 ->> 'cf:valor_compra',
  null::text, 'relatório não revela campo restrito para perfil sem permissão');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.field_definitions), 0, 'fazenda B não enxerga campos da fazenda A');

select * from finish();
rollback;
