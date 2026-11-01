-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('a1a1a1a1-0000-0000-0000-a1a1a1a1a1a1', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'F1', 'F'), (current_setting('t.farm_a')::uuid, 'F2', 'F'),
  (current_setting('t.farm_a')::uuid, 'M1', 'M');
insert into public.memberships (user_id, farm_id, role_id) values
  ('a1a1a1a1-0000-0000-0000-a1a1a1a1a1a1', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F1'),
  'cobertura', date '2026-01-10', (select id from public.animals where ear_tag = 'M1'), null, null, null);
select is((select status from public.reproduction_status(current_setting('t.farm_a')::uuid) where ear_tag = 'F1'), 'servida',
  'fêmea coberta fica como servida');
select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F1'),
  'diagnostico', date '2026-02-20', null, null, 'positivo', null);
select is((select status from public.reproduction_status(current_setting('t.farm_a')::uuid) where ear_tag = 'F1'), 'prenha',
  'diagnóstico positivo marca como prenha');
select is((select expected_calving from public.reproduction_status(current_setting('t.farm_a')::uuid) where ear_tag = 'F1'),
  date '2026-01-10' + 283, 'parto previsto = última cobertura + 283 dias');
select throws_ok($$select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'M1'),
  'cobertura', date '2026-01-10', null, null, null, null)$$, 'P0001', 'invalid_female', 'macho não pode ser registrado como fêmea');
select throws_ok($$select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F2'),
  'diagnostico', date '2026-02-20', null, null, null, null)$$, 'P0001', 'invalid_result', 'diagnóstico exige resultado');

select public.register_birth(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F1'),
  date '2026-09-30', 'vivo', 'BZ1', 'F', null, null, null, null);
select is((select b.dam_id = f.id and b.sire_id = m.id from public.animals b, public.animals f, public.animals m
           where b.ear_tag = 'BZ1' and f.ear_tag = 'F1' and m.ear_tag = 'M1'), true,
  'parto cria o bezerro com a mãe e o pai (da última cobertura)');
select is((select status from public.reproduction_status(current_setting('t.farm_a')::uuid) where ear_tag = 'F1'), 'parida',
  'após o parto a fêmea fica como parida');
select throws_ok($$select public.register_birth(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F1'),
  date '2026-09-30', 'vivo', 'BZ1', 'M', null, null, null, null)$$, '23505', null, 'brinco do bezerro não pode repetir');
select throws_ok($$update public.animals set dam_id = (select id from public.animals where ear_tag = 'M1') where ear_tag = 'BZ1'$$,
  'P0001', 'invalid_parent', 'mãe precisa ser fêmea');

select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F2'),
  'cobertura', current_date - 300, null, null, null, null);
select is((public.reproduction_alerts(current_setting('t.farm_a')::uuid) ->> 'overdue_calving')::int, 1, 'parto atrasado gera alerta');
select is((public.reproduction_alerts(current_setting('t.farm_a')::uuid) ->> 'diagnosis_pending')::int, 1, 'cobertura sem diagnóstico há mais de 45 dias gera alerta');
select public.void_reproduction((select id from public.reproduction_events where female_id = (select id from public.animals where ear_tag = 'F2')), 'registro errado');
select is((public.reproduction_alerts(current_setting('t.farm_a')::uuid) ->> 'overdue_calving')::int, 0, 'evento anulado sai dos alertas');
select throws_ok($$select public.void_reproduction((select id from public.reproduction_events where event_type = 'parto'), 'teste')$$,
  'P0001', 'birth_has_calf', 'parto com bezerro cadastrado não pode ser anulado');
select throws_ok($$update public.reproduction_events set notes = 'x'$$, '42501', null, 'eventos reprodutivos não são editáveis');

select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-a1a1a1a1a1a1","role":"authenticated"}', true);
select throws_ok($$select public.register_reproduction(current_setting('t.farm_a')::uuid, (select id from public.animals where ear_tag = 'F2'),
  'cobertura', current_date, null, null, null, null)$$, '42501', null, 'visualização não registra eventos reprodutivos');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.reproduction_status(current_setting('t.farm_a')::uuid)), 0, 'fazenda B não enxerga a reprodução da fazenda A');

select * from finish();
rollback;
