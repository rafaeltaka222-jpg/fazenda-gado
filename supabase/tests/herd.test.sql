-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('44444444-4444-4444-4444-444444444444', 'y@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

-- Lote da fazenda B criado como superusuário, só para testar a FK composta
reset role;
insert into public.lots (id, farm_id, name)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', (select id from public.farms where code = 'B1'), 'Lote B');
set local role authenticated;

-- Administrador da fazenda A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok($$insert into public.lots (farm_id, name) values ((select id from public.farms where code = 'A1'), 'Lote 10')$$, 'admin cria lote');
select lives_ok($$insert into public.pastures (farm_id, name, area_ha) values ((select id from public.farms where code = 'A1'), 'Pasto 1', 12.5)$$, 'admin cria pasto');
select lives_ok($$insert into public.animals (farm_id, ear_tag, sex, lot_id, pasture_id) values
  ((select id from public.farms where code = 'A1'), '000123', 'M',
   (select id from public.lots where name = 'Lote 10'), (select id from public.pastures where name = 'Pasto 1'))$$, 'admin cria animal');
select throws_ok($$insert into public.animals (farm_id, ear_tag, sex) values
  ((select id from public.farms where code = 'A1'), '000123', 'F')$$, '23505', null, 'brinco duplicado na mesma fazenda é recusado');
select throws_ok($$insert into public.animals (farm_id, ear_tag, sex, lot_id) values
  ((select id from public.farms where code = 'A1'), '000999', 'M', 'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '23503', null, 'animal não pode apontar para lote de outra fazenda');
select cmp_ok((select count(*)::int from public.audit_log
               where table_name = 'animals' and farm_id = (select id from public.farms where code = 'A1')),
              '>=', 1, 'criação do animal foi auditada');

-- Usuário com perfil de visualização na fazenda A
insert into public.memberships (user_id, farm_id, role_id) values
  ('44444444-4444-4444-4444-444444444444', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'visualizacao'));
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.animals), 1, 'visualização enxerga o animal');
select throws_ok($$insert into public.animals (farm_id, ear_tag, sex) values
  ((select id from public.farms where code = 'A1'), '000555', 'M')$$, '42501', null, 'visualização não cadastra animal');

-- Administrador da fazenda B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.animals), 0, 'fazenda B não enxerga animais da fazenda A');
select lives_ok($$insert into public.animals (farm_id, ear_tag, sex) values
  ((select id from public.farms where code = 'B1'), '000123', 'M')$$, 'mesmo brinco em outra fazenda é permitido');

select * from finish();
rollback;
