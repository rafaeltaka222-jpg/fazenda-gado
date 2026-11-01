-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('a5a5a5a5-0000-0000-0000-a5a5a5a5a5a5', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.memberships (user_id, farm_id, role_id) values
  ('a5a5a5a5-0000-0000-0000-a5a5a5a5a5a5', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select set_config('t.t1', public.create_task(current_setting('t.farm_a')::uuid, 'Vacinar lote 1', null, current_date - 1, 'alta',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, null)::text, true);
select isnt(current_setting('t.t1'), '', 'administrador cria tarefa atribuída a si');
select public.create_task(current_setting('t.farm_a')::uuid, 'Consertar cerca', 'Pasto 3', current_date + 3, 'normal', null, null, null);
select throws_ok($$select public.create_task(current_setting('t.farm_a')::uuid, 'X', null, null, 'normal', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, null)$$,
  'P0001', 'invalid_assignee', 'responsável precisa ser membro da fazenda');
select is((select count(*)::int from public.task_list(current_setting('t.farm_a')::uuid) where assignee_email = 'a@teste.local'), 1,
  'lista traz o e-mail do responsável');
select is((public.tasks_summary(current_setting('t.farm_a')::uuid) ->> 'overdue')::int, 1, 'tarefa vencida é contada');
select public.set_task_status(current_setting('t.t1')::uuid, 'concluida');
select is((public.tasks_summary(current_setting('t.farm_a')::uuid) ->> 'open')::int, 1, 'concluir tira a tarefa das abertas');
select throws_ok($$update public.tasks set title = 'x'$$, '42501', null, 'tarefas não são editáveis diretamente');

select set_config('request.jwt.claims', '{"sub":"a5a5a5a5-0000-0000-0000-a5a5a5a5a5a5","role":"authenticated"}', true);
select cmp_ok((select count(*)::int from public.task_list(current_setting('t.farm_a')::uuid)), '>', 0, 'visualização enxerga a lista de tarefas');
select throws_ok($$select public.create_task(current_setting('t.farm_a')::uuid, 'Y', null, null, 'normal', null, null, null)$$,
  '42501', null, 'visualização não cria tarefas');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select * from public.task_list(current_setting('t.farm_a')::uuid)$$, '42501', null, 'outra fazenda não lista as tarefas');

select * from finish();
rollback;
