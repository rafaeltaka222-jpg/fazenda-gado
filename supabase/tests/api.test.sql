-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(12);

select set_config('t.h1', encode(extensions.digest('secret1', 'sha256'), 'hex'), true);
select set_config('t.h2', encode(extensions.digest('secret2', 'sha256'), 'hex'), true);
select set_config('t.h3', encode(extensions.digest('secret3', 'sha256'), 'hex'), true);
select set_config('t.h4', encode(extensions.digest('secret4', 'sha256'), 'hex'), true);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('f1f1f1f1-0000-0000-0000-f1f1f1f1f1f1', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('t.farm_a', (select id from public.farms where code = 'A1')::text, true);
insert into public.animals (farm_id, ear_tag, sex) values
  (current_setting('t.farm_a')::uuid, 'AP1', 'M'), (current_setting('t.farm_a')::uuid, 'AP2', 'F');
insert into public.memberships (user_id, farm_id, role_id) values
  ('f1f1f1f1-0000-0000-0000-f1f1f1f1f1f1', current_setting('t.farm_a')::uuid, (select id from public.roles where is_system and name = 'visualizacao'));

select isnt(public.create_api_key(current_setting('t.farm_a')::uuid, 'ERP', array['read','write_weighings'], 'fz_abcd1234', current_setting('t.h1'), null), null,
  'administrador cria chave de API');
select public.create_api_key(current_setting('t.farm_a')::uuid, 'Leitura', array['read'], 'fz_leitura1', current_setting('t.h2'), 30);
select public.create_api_key(current_setting('t.farm_a')::uuid, 'Limitada', array['read'], 'fz_limitada', current_setting('t.h3'), null);

reset role;
insert into public.api_rate (key_id, bucket, n)
  select id, date_trunc('minute', now()), 120 from public.api_keys where name = 'Limitada';
set local role anon;

select is(jsonb_array_length(public.api_list_animals(current_setting('t.h1')) -> 'data'), 2, 'chave válida lista os animais da própria fazenda');
select throws_ok($$select public.api_list_animals('0000000000000000000000000000000000000000000000000000000000000000')$$,
  '28000', 'invalid_key', 'chave inválida é recusada');
select throws_ok($$select public.api_register_weighings(current_setting('t.h2'),
  '[{"ear_tag":"AP1","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":400}]'::jsonb)$$,
  '42501', 'insufficient_scope', 'chave somente leitura não grava pesagens');
select is(public.api_register_weighings(current_setting('t.h1'),
  '[{"ear_tag":"AP1","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":400}]'::jsonb) ->> 'inserted', '1',
  'chave com escopo grava pesagem');
select public.api_register_weighings(current_setting('t.h1'),
  '[{"ear_tag":"AP1","weighed_at":"2026-09-02T08:00:00-03:00","weight_kg":405}]'::jsonb, 'req-1');
select is(public.api_register_weighings(current_setting('t.h1'),
  '[{"ear_tag":"AP1","weighed_at":"2026-09-02T08:00:00-03:00","weight_kg":405}]'::jsonb, 'req-1') ->> 'replayed', 'true',
  'mesma Idempotency-Key devolve a resposta anterior');
reset role;
select is((select count(*)::int from public.weighings where farm_id = current_setting('t.farm_a')::uuid), 2, 'repetição com a mesma chave de idempotência não duplica pesagens');
set local role anon;
select throws_ok($$select public.api_register_weighings(current_setting('t.h1'),
  '[{"ear_tag":"AP1","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":400}]'::jsonb)$$,
  '23505', null, 'pesagem duplicada sem idempotência é recusada');
select throws_ok($$select public.api_list_animals(current_setting('t.h3'))$$, 'P0429', 'rate_limited',
  'excesso de requisições por minuto é barrado');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.revoke_api_key((select id from public.api_keys where name = 'ERP'));
reset role;
set local role anon;
select throws_ok($$select public.api_list_animals(current_setting('t.h1'))$$, '28000', 'invalid_key', 'chave revogada deixa de funcionar');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');
select public.create_api_key((select id from public.farms where code = 'B1'), 'ChaveB', array['read'], 'fz_chaveb', current_setting('t.h4'), null);
reset role;
set local role anon;
select is(jsonb_array_length(public.api_list_animals(current_setting('t.h4')) -> 'data'), 0, 'chave de outra fazenda não enxerga animais da fazenda A');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1f1f1f1-0000-0000-0000-f1f1f1f1f1f1","role":"authenticated"}', true);
select throws_ok($$select public.create_api_key(current_setting('t.farm_a')::uuid, 'X', array['read'], 'fz_x', repeat('a', 64), null)$$,
  '42501', null, 'perfil sem permissão não cria chaves');

select * from finish();
rollback;
