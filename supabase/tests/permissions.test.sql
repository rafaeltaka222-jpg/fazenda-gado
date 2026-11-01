-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),   -- administrador
  ('11111111-1111-1111-1111-111111111111', 'v@teste.local'),   -- veterinário
  ('22222222-2222-2222-2222-222222222222', 'g@teste.local'),   -- gerente
  ('33333333-3333-3333-3333-333333333333', 'x@teste.local');   -- terceiro

set local role authenticated;

-- A cria a fazenda e adiciona o veterinário e o gerente
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select lives_ok($$insert into public.memberships (user_id, farm_id, role_id) values
  ('11111111-1111-1111-1111-111111111111', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'veterinario'))$$,
  'administrador adiciona veterinário');
select lives_ok($$insert into public.memberships (user_id, farm_id, role_id) values
  ('22222222-2222-2222-2222-222222222222', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'gerente'))$$,
  'administrador adiciona gerente');

-- Veterinário
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*) from public.memberships)::int, 1, 'veterinário vê só o próprio vínculo');
select throws_ok($$insert into public.memberships (user_id, farm_id, role_id) values
  ('33333333-3333-3333-3333-333333333333', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'veterinario'))$$,
  '42501', null, 'veterinário não adiciona usuários');
update public.farms set name = 'alterada' where code = 'A1';
select is((select name from public.farms where code = 'A1'), 'Fazenda A', 'veterinário não altera a fazenda');
select is((select count(*) from public.audit_log)::int, 0, 'veterinário não vê a auditoria');

-- Gerente
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok($$insert into public.memberships (user_id, farm_id, role_id) values
  ('33333333-3333-3333-3333-333333333333', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'administrador'))$$,
  'P0001', 'privilege_escalation', 'gerente não concede perfil administrador');
select throws_ok($$update public.memberships
  set role_id = (select id from public.roles where is_system and name = 'administrador')
  where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'P0001', 'privilege_escalation', 'gerente não promove a si mesmo');
select lives_ok($$insert into public.memberships (user_id, farm_id, role_id) values
  ('33333333-3333-3333-3333-333333333333', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'visualizacao'))$$,
  'gerente concede perfil com permissões que ele possui');

-- Adulteração da auditoria (feita como superusuário, só no teste) deve ser detectada
reset role;
alter table public.audit_log disable trigger audit_no_update_delete;
update public.audit_log set new_data = '{"adulterado":true}'::jsonb
  where id = (select min(id) from public.audit_log
              where farm_id = (select id from public.farms where code = 'A1'));
alter table public.audit_log enable trigger audit_no_update_delete;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select is(
  (select public.verify_audit_chain((select id from public.farms where code = 'A1'))),
  (select min(id) from public.audit_log where farm_id = (select id from public.farms where code = 'A1')),
  'adulteração da auditoria é detectada na linha alterada');

select * from finish();
rollback;
