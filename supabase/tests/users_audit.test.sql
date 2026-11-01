-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('cccccccc-0000-0000-0000-cccccccccccc', 'c@teste.local'),
  ('dddddddd-0000-0000-0000-dddddddddddd', 'd@teste.local'),
  ('eeeeeeee-0000-0000-0000-eeeeeeeeeeee', 'g@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);

select is((select count(*)::int from public.farm_members(current_setting('t.farm_a')::uuid)
           where email = 'a@teste.local'), 1, 'lista de membros mostra o e-mail do administrador');
select isnt(public.add_member_by_email(current_setting('t.farm_a')::uuid, 'C@teste.local',
  (select id from public.roles where is_system and name = 'veterinario')), null,
  'administrador adiciona usuário existente pelo e-mail (sem diferenciar maiúsculas)');
select is((select count(*)::int from public.farm_members(current_setting('t.farm_a')::uuid)), 2, 'lista passa a ter 2 membros');
select throws_ok($$select public.add_member_by_email(current_setting('t.farm_a')::uuid, 'ninguem@teste.local',
  (select id from public.roles where is_system and name = 'veterinario'))$$,
  'P0001', 'user_not_found', 'e-mail sem conta é recusado');
select throws_ok($$select public.add_member_by_email(current_setting('t.farm_a')::uuid, 'c@teste.local',
  (select id from public.roles where is_system and name = 'veterinario'))$$,
  'P0001', 'already_member', 'não adiciona duas vezes o mesmo usuário');
select cmp_ok((select count(*)::int from public.audit_entries(current_setting('t.farm_a')::uuid, null, null, null, null, 50, 0)
               where user_email = 'a@teste.local'), '>', 0, 'auditoria mostra quem fez cada alteração');

select public.add_member_by_email(current_setting('t.farm_a')::uuid, 'g@teste.local',
  (select id from public.roles where is_system and name = 'gerente'));

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-eeeeeeeeeeee","role":"authenticated"}', true);
select throws_ok($$select public.add_member_by_email(current_setting('t.farm_a')::uuid, 'd@teste.local',
  (select id from public.roles where is_system and name = 'administrador'))$$,
  'P0001', 'privilege_escalation', 'gerente não concede perfil de administrador');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-cccccccccccc","role":"authenticated"}', true);
select throws_ok($$select * from public.farm_members(current_setting('t.farm_a')::uuid)$$, '42501', null,
  'veterinário não lista usuários');
select throws_ok($$select * from public.audit_entries(current_setting('t.farm_a')::uuid, null, null, null, null, 50, 0)$$,
  '42501', null, 'veterinário não consulta a auditoria');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select * from public.farm_members(current_setting('t.farm_a')::uuid)$$, '42501', null,
  'outra fazenda não lista usuários da fazenda A');

select * from finish();
rollback;
