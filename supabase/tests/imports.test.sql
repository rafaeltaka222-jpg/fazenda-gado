-- Rodar com: supabase test db   (pgTAP). STATUS: escrito, AINDA NÃO EXECUTADO.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@teste.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@teste.local'),
  ('77777777-7777-7777-7777-777777777777', 'v@teste.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select public.create_organization_with_farm('Org A', 'A1', 'Fazenda A');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.create_organization_with_farm('Org B', 'B1', 'Fazenda B');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.animals (farm_id, ear_tag, sex) values
  ((select id from public.farms where code = 'A1'), 'I1', 'M'),
  ((select id from public.farms where code = 'A1'), 'I2', 'F'),
  ((select id from public.farms where code = 'A1'), 'I3', 'M');
insert into public.import_layouts (farm_id, name, delimiter, date_format, decimal_separator, col_animal, col_date, col_time, col_weight)
  values ((select id from public.farms where code = 'A1'), 'Padrão', 'ponto_e_virgula', 'DD/MM/YYYY', ',', 1, 2, 3, 4);

select set_config('t.rows', '[
 {"line":2,"raw":"I1","ear_tag":"I1","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":400},
 {"line":3,"raw":"I2","ear_tag":"I2","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":380},
 {"line":4,"raw":"NOPE","ear_tag":"NOPE","weighed_at":"2026-09-01T08:01:00-03:00","weight_kg":300},
 {"line":5,"raw":"I1 dup","ear_tag":"I1","weighed_at":"2026-09-01T08:00:00-03:00","weight_kg":401},
 {"line":6,"raw":"I3","ear_tag":"I3","weighed_at":"2026-09-01T08:02:00-03:00","weight_kg":5000},
 {"line":7,"raw":"x","parse_error":"Data inválida"},
 {"line":8,"raw":"I2","ear_tag":"I2","weighed_at":"2026-09-21T08:00:00-03:00","weight_kg":700}
]', true);

select set_config('t.batch', public.stage_import(
  (select id from public.farms where code = 'A1'),
  (select id from public.import_layouts where name = 'Padrão'),
  'arquivo.txt', 'hash1', current_setting('t.rows')::jsonb)::text, true);

select is((select ok_rows::text || '/' || warn_rows::text || '/' || error_rows::text
           from public.import_batches where id = current_setting('t.batch')::uuid),
  '2/1/4', 'prévia classifica 2 ok, 1 aviso e 4 erros');
select throws_ok($$select public.commit_import(current_setting('t.batch')::uuid, '[]'::jsonb)$$,
  'P0001', 'rows_pending', 'linhas com erro sem decisão impedem a gravação');
select is((public.commit_import(current_setting('t.batch')::uuid,
  (select jsonb_agg(jsonb_build_object('row_id', id, 'ignore', true))
     from public.import_rows where batch_id = current_setting('t.batch')::uuid and status = 'erro')))->>'imported',
  '3', 'confirmação grava as 3 linhas válidas e ignora os erros');
select is((select count(*)::int from public.weighings where import_batch_id = current_setting('t.batch')::uuid),
  3, 'pesagens importadas ficam ligadas ao lote');
select is((select status from public.import_batches where id = current_setting('t.batch')::uuid),
  'confirmado', 'lote fica confirmado');
select throws_ok($$select public.commit_import(current_setting('t.batch')::uuid, '[]'::jsonb)$$,
  'P0001', 'batch_not_pending', 'lote confirmado não pode ser confirmado de novo');

-- Reenvio do mesmo arquivo
select set_config('t.batch2', public.stage_import(
  (select id from public.farms where code = 'A1'),
  (select id from public.import_layouts where name = 'Padrão'),
  'arquivo.txt', 'hash1', current_setting('t.rows')::jsonb)::text, true);
select is((select count(*)::int from public.import_rows where batch_id = current_setting('t.batch2')::uuid and status = 'duplicada'),
  4, 'reenvio marca as pesagens já existentes como duplicadas');
select is((public.commit_import(current_setting('t.batch2')::uuid,
  (select jsonb_agg(jsonb_build_object('row_id', id, 'ignore', true))
     from public.import_rows where batch_id = current_setting('t.batch2')::uuid and status = 'erro')))->>'imported',
  '0', 'reenvio não grava nada novo');
select is((select count(*)::int from public.weighings), 3, 'reimportar não duplica pesagens');

-- Correção na prévia
select set_config('t.batch3', public.stage_import(
  (select id from public.farms where code = 'A1'),
  (select id from public.import_layouts where name = 'Padrão'), 'corrige.txt', 'hash2',
  '[{"line":2,"raw":"NOPE","ear_tag":"NOPE","weighed_at":"2026-09-05T08:00:00-03:00","weight_kg":410}]'::jsonb)::text, true);
select is((public.commit_import(current_setting('t.batch3')::uuid,
  (select jsonb_agg(jsonb_build_object('row_id', id, 'ear_tag', 'I1', 'weight_kg', 410))
     from public.import_rows where batch_id = current_setting('t.batch3')::uuid)))->>'imported',
  '1', 'linha com erro pode ser corrigida na prévia');

-- Perfil sem permissão de importação
insert into public.memberships (user_id, farm_id, role_id) values
  ('77777777-7777-7777-7777-777777777777', (select id from public.farms where code = 'A1'),
   (select id from public.roles where is_system and name = 'veterinario'));
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select throws_ok($$select public.stage_import((select id from public.farms where code = 'A1'),
  (select id from public.import_layouts limit 1), 'x.txt', 'h', '[{"line":2,"ear_tag":"I1"}]'::jsonb)$$,
  '42501', null, 'veterinário não importa arquivos');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from public.import_batches), 0, 'fazenda B não enxerga importações da fazenda A');

select * from finish();
rollback;
