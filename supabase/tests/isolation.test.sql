-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local');

set local role authenticated;

-- Usuário A cria sua fazenda
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select is((select count(*) from public.farms)::int, 1, 'A enxerga apenas 1 fazenda');

-- Usuário B cria a dele
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');
select is((select name from public.farms), 'Fazenda B', 'B enxerga somente a própria fazenda');

-- B tenta alterar a fazenda de A: nenhuma linha é afetada
select lives_ok($$update public.farms set name = 'invadida' where code = 'A1'$$, 'update de B em A não gera erro');

-- De volta ao A: nada mudou, a auditoria existe e a cadeia está íntegra
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select is((select name from public.farms where code = 'A1'), 'Fazenda A', 'fazenda de A não foi alterada por B');
select is((select public.verify_audit_chain((select id from public.farms where code = 'A1'))), null::bigint,
          'cadeia de hash da fazenda A está íntegra');

-- Último administrador não pode ser removido
select throws_ok($$delete from public.memberships where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
                 'P0001', 'last_admin', 'último administrador não pode ser removido');

-- Auditoria é somente-inserção
select throws_ok($$update public.audit_log set operation = 'x'$$, '42501', null,
                 'usuário comum não altera a auditoria');

select * from finish();
rollback;
