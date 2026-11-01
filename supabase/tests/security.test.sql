-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('d1d1d1d1-0000-0000-0000-d1d1d1d1d1d1', 'g@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('t.org_a', (select organization_id from public.farms where code = 'A1')::text, true);
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);

select throws_ok($$select public.create_organization_with_farm('Outra', 'X1', 'Outra fazenda')$$,
  'P0001', 'already_has_access', 'quem já tem acesso não cria nova organização');
select isnt(public.create_farm_in_org(current_setting('t.org_a')::uuid, 'A2', 'Fazenda A2'), null,
  'administrador cria outra fazenda na própria organização');
select is((select count(*)::int from public.farms), 2, 'administrador passa a ver as duas fazendas');

insert into public.memberships (user_id, farm_id, role_id) values
  ('d1d1d1d1-0000-0000-0000-d1d1d1d1d1d1', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'gerente'));
select set_config('request.jwt.claims', '{"sub":"d1d1d1d1-0000-0000-0000-d1d1d1d1d1d1","role":"authenticated"}', true);
select throws_ok($$select public.create_farm_in_org(current_setting('t.org_a')::uuid, 'A3', 'Fazenda A3')$$,
  '42501', null, 'gerente não cria fazendas');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok($$select public.create_farm_in_org(current_setting('t.org_a')::uuid, 'A4', 'Fazenda A4')$$,
  '42501', null, 'administrador de outra organização não cria fazendas na organização A');
select is((select count(*)::int from public.farms where code like 'A%'), 0, 'organização B não enxerga fazendas da organização A');

select * from finish();
rollback;
