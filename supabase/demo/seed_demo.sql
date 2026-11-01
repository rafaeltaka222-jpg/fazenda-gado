-- DADOS DE DEMONSTRAÇÃO. STATUS: escrito, AINDA NÃO EXECUTADO.
-- Roda como a SUA conta (administrador), chamando as mesmas funções do sistema (permissões, auditoria e regras valem).
-- Tudo em uma transação: se algo falhar, nada é gravado. Não roda no db reset.
-- Uso:  .\scripts\demo.ps1 -Email seu@email.com            (ou -N 200 para mais animais; máximo 400)
\set ON_ERROR_STOP on
\if :{?email}
\else
  \echo 'ERRO: informe o e-mail da sua conta (-v email=seu@email.com).'
  \quit
\endif
\if :{?n}
\else
  \set n 120
\endif
select coalesce((select id::text from auth.users where lower(email) = lower(:'email') limit 1), '') as uid \gset
select (:'uid' <> '') as has_user \gset
\if :has_user
\else
  \echo 'ERRO: conta nao encontrada para esse e-mail. Crie a conta no site (Nao tenho conta) com o MESMO e-mail e rode de novo.'
  \quit
\endif
select set_config('demo.n', :'n', false);

begin;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, false);

-- 1. Fazenda (usa a sua fazenda de administrador; se não houver, cria "Fazenda Demonstração")
do $$
declare v_farm uuid;
begin
  select m.farm_id into v_farm from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and r.name = 'administrador' and m.status = 'active' order by m.created_at limit 1;
  if v_farm is null then
    v_farm := public.create_organization_with_farm('Organização Demonstração', 'DEMO', 'Fazenda Demonstração');
  end if;
  perform set_config('demo.farm', v_farm::text, false);
  if exists (select 1 from public.animals where farm_id = v_farm and ear_tag = 'D0001') then
    raise exception 'A demonstração já foi carregada nesta fazenda.';
  end if;
  if current_setting('demo.n')::int not between 40 and 400 then raise exception 'Use N entre 40 e 400.'; end if;
end $$;

-- 2. Estrutura, pessoas, produtos de sanidade e campos personalizados
do $$
declare f uuid := current_setting('demo.farm')::uuid;
begin
  insert into public.lots (farm_id, name) values (f, 'Recria'), (f, 'Engorda'), (f, 'Matrizes'), (f, 'Touros') on conflict do nothing;
  insert into public.pastures (farm_id, name, area_ha, capacity_heads)
    values (f, 'Pasto 1', 42.5, 60), (f, 'Pasto 2', 38, 50), (f, 'Pasto 3', 55, 80), (f, 'Pasto 4', 30, 40) on conflict do nothing;
  insert into public.people (farm_id, name, person_roles, document, phone) values
    (f, 'Frigorífico Boi Bom', array['comprador'], '11.222.333/0001-81', '(77) 3000-0000'),
    (f, 'João da Silva (Fazenda Vizinha)', array['comprador','fornecedor'], '529.982.247-25', null) on conflict do nothing;
  insert into public.health_products (farm_id, name, kind, withdrawal_days)
    values (f, 'Antibiótico X (exemplo)', 'medicamento', 28) on conflict do nothing;
  insert into public.field_definitions (farm_id, field_key, label, data_type, options, visible_to, editable_to, position) values
    (f, 'sisbov', 'Número do SISBOV', 'text', '[]'::jsonb, null, null, 10),
    (f, 'genetica', 'Classificação genética', 'list', '["Nelore PO","Nelore LA","Angus","Cruzado"]'::jsonb, null, null, 20),
    (f, 'valor_compra', 'Valor de compra', 'money', '[]'::jsonb, array['administrador','gerente'], array['administrador','gerente'], 30)
    on conflict do nothing;
end $$;

-- 3. Animais (Recria 30%, Engorda 35%, Matrizes 30%, Touros o resto)
do $$
declare
  f uuid := current_setting('demo.farm')::uuid; n int := current_setting('demo.n')::int;
  n_rec int := floor(n * 0.30); n_eng int := floor(n * 0.35); n_mat int := floor(n * 0.30);
  i int; v_lot text; v_sex text; v_cat text; v_past text; v_birth date; v_origin text; v_breed text;
begin
  for i in 1..n loop
    if i <= n_rec then
      v_lot := 'Recria'; v_sex := case when i % 2 = 0 then 'F' else 'M' end;
      v_cat := case when v_sex = 'F' then 'Novilha' else 'Garrote' end; v_past := 'Pasto 1';
      v_birth := current_date - (240 + (random() * 180)::int);
    elsif i <= n_rec + n_eng then
      v_lot := 'Engorda'; v_sex := 'M'; v_cat := 'Boi'; v_past := case when i % 2 = 0 then 'Pasto 2' else 'Pasto 3' end;
      v_birth := current_date - (600 + (random() * 300)::int);
    elsif i <= n_rec + n_eng + n_mat then
      v_lot := 'Matrizes'; v_sex := 'F'; v_cat := 'Vaca'; v_past := case when i % 2 = 0 then 'Pasto 3' else 'Pasto 4' end;
      v_birth := current_date - (1100 + (random() * 1400)::int);
    else
      v_lot := 'Touros'; v_sex := 'M'; v_cat := 'Touro'; v_past := 'Pasto 4';
      v_birth := current_date - (1500 + (random() * 700)::int);
    end if;
    v_breed := (array['Nelore','Angus','Cruzado'])[1 + i % 3];
    v_origin := case when i % 4 = 0 then 'Compra' else 'Nascido na fazenda' end;
    insert into public.animals (farm_id, ear_tag, sex, breed_id, category_id, lot_id, pasture_id, birth_date, entry_date, origin)
    values (f, 'D' || lpad(i::text, 4, '0'), v_sex,
            (select id from public.breeds where farm_id = f and name = v_breed),
            (select id from public.categories where farm_id = f and name = v_cat),
            (select id from public.lots where farm_id = f and name = v_lot),
            (select id from public.pastures where farm_id = f and name = v_past),
            v_birth, current_date - 120, v_origin);
  end loop;
end $$;

-- 4. Campos personalizados nos primeiros 30 animais
do $$
declare f uuid := current_setting('demo.farm')::uuid; r record; i int := 0;
begin
  for r in select id from public.animals where farm_id = f and ear_tag like 'D____' order by ear_tag limit 30 loop
    i := i + 1;
    perform public.set_animal_custom(r.id, jsonb_build_object(
      'sisbov', '0760' || lpad(i::text, 11, '0'),
      'genetica', (array['Nelore PO','Nelore LA','Angus','Cruzado'])[1 + i % 4],
      'valor_compra', (1800 + i * 35)::text));
  end loop;
end $$;

-- 5. Pesagens (4 por animal: há 90, 60, 30 e 5 dias)
do $$
declare
  f uuid := current_setting('demo.farm')::uuid; items jsonb := '[]'::jsonb; r record; d int; w numeric; cnt int := 0;
  base numeric; gmd numeric;
begin
  for r in select a.id, l.name as lot from public.animals a join public.lots l on l.id = a.lot_id
           where a.farm_id = f and a.ear_tag like 'D____' loop
    base := case r.lot when 'Recria' then 220 when 'Engorda' then 380 when 'Matrizes' then 420 else 650 end + (random() * 40 - 20);
    gmd  := case r.lot when 'Recria' then 0.7 when 'Engorda' then 0.9 when 'Matrizes' then 0.1 else 0.05 end;
    foreach d in array array[90, 60, 30, 5] loop
      w := base + gmd * (90 - d) + (random() * 16 - 8);
      items := items || jsonb_build_array(jsonb_build_object(
        'animal_id', r.id, 'weighed_at', (now() - make_interval(days => d))::text, 'weight_kg', round(w, 1)));
      cnt := cnt + 1;
      if cnt >= 400 then perform public.register_weighings(f, items); items := '[]'::jsonb; cnt := 0; end if;
    end loop;
  end loop;
  if cnt > 0 then perform public.register_weighings(f, items); end if;
end $$;

-- 6. Sanidade: vacina atrasada, a vencer e em dia; um medicamento com carência
do $$
declare f uuid := current_setting('demo.farm')::uuid; p_af uuid; p_ab uuid; ids uuid[];
begin
  select id into p_af from public.health_products where farm_id = f and name = 'Febre aftosa';
  select id into p_ab from public.health_products where farm_id = f and name = 'Antibiótico X (exemplo)';
  ids := array(select id from public.animals where farm_id = f and ear_tag like 'D____' order by ear_tag offset 0 limit 30);
  perform public.register_health(f, ids, p_af, current_date - 200, '2 ml', current_date - 20, 'L-2026-01', null);
  ids := array(select id from public.animals where farm_id = f and ear_tag like 'D____' order by ear_tag offset 30 limit 30);
  perform public.register_health(f, ids, p_af, current_date - 150, '2 ml', current_date + 15, 'L-2026-02', null);
  ids := array(select id from public.animals where farm_id = f and ear_tag like 'D____' order by ear_tag offset 60);
  perform public.register_health(f, ids, p_af, current_date - 30, '2 ml', current_date + 150, 'L-2026-03', null);
  ids := array(select id from public.animals where farm_id = f and ear_tag like 'D____' order by ear_tag offset 0 limit 3);
  perform public.register_health(f, ids, p_ab, current_date - 5, '10 ml', null, null, 'Tratamento de exemplo');
end $$;

-- 7. Reprodução (12 matrizes) e um parto
do $$
declare
  f uuid := current_setting('demo.farm')::uuid; bull uuid; r record; k int := 0; c jsonb;
  cfg jsonb[] := array[
    '{"cob":290,"diag":45,"res":"positivo"}', '{"cob":300,"diag":45,"res":"positivo"}', '{"cob":265,"diag":45,"res":"positivo"}',
    '{"cob":160,"diag":45,"res":"positivo"}', '{"cob":140,"diag":45,"res":"positivo"}', '{"cob":120,"diag":45,"res":"positivo"}',
    '{"cob":100,"diag":45,"res":"positivo"}', '{"cob":90,"diag":45,"res":"positivo"}', '{"cob":55}', '{"cob":52}',
    '{"cob":130,"diag":45,"res":"negativo"}', '{"cob":125,"diag":45,"res":"negativo"}']::jsonb[];
begin
  select a.id into bull from public.animals a join public.lots l on l.id = a.lot_id
    where a.farm_id = f and l.name = 'Touros' order by a.ear_tag limit 1;
  for r in select a.id from public.animals a join public.lots l on l.id = a.lot_id
           where a.farm_id = f and l.name = 'Matrizes' order by a.ear_tag limit 12 loop
    k := k + 1;
    c := cfg[k];
    perform public.register_reproduction(f, r.id, 'cobertura', current_date - (c ->> 'cob')::int, bull, null, null, null);
    if c ? 'diag' then
      perform public.register_reproduction(f, r.id, 'diagnostico', current_date - (c ->> 'cob')::int + (c ->> 'diag')::int,
                                           null, null, c ->> 'res', null);
    end if;
    if k = 1 then
      perform public.register_birth(f, r.id, current_date - 7, 'vivo', 'D-BZ01', 'F', null, null, null, 'Primeiro parto da demonstração');
    end if;
  end loop;
end $$;

-- 8. Movimentações: transferência, mortes e uma venda com valor
do $$
declare f uuid := current_setting('demo.farm')::uuid; ids uuid[]; l_eng uuid; p2 uuid; buyer uuid;
begin
  select id into l_eng from public.lots where farm_id = f and name = 'Engorda';
  select id into p2 from public.pastures where farm_id = f and name = 'Pasto 2';
  select id into buyer from public.people where farm_id = f and name = 'Frigorífico Boi Bom';
  ids := array(select a.id from public.animals a join public.lots l on l.id = a.lot_id
               where a.farm_id = f and l.name = 'Recria' and a.status = 'ativo' order by a.ear_tag limit 8);
  perform public.register_movement(f, ids, 'transferencia', current_date - 20, l_eng, p2, 'Transferência para engorda');
  ids := array(select a.id from public.animals a join public.lots l on l.id = a.lot_id
               where a.farm_id = f and l.name = 'Engorda' and a.status = 'ativo' order by a.ear_tag desc limit 2);
  perform public.register_movement(f, ids, 'morte', current_date - 15, null, null, 'Morte (exemplo)');
  ids := array(select a.id from public.animals a join public.lots l on l.id = a.lot_id
               where a.farm_id = f and l.name = 'Engorda' and a.status = 'ativo' order by a.ear_tag limit 8);
  perform public.register_sale(f, ids, current_date - 10, buyer, 34400, 'NF 1234', 'Venda de exemplo');
end $$;

-- 9. Estoque e custos
do $$
declare f uuid := current_setting('demo.farm')::uuid; i_sal uuid; i_rac uuid; i_ver uuid; lr uuid; le uuid; lm uuid; p3 uuid;
begin
  insert into public.stock_items (farm_id, name, unit, category, min_quantity) values
    (f, 'Sal mineral', 'kg', 'sal_mineral', 300), (f, 'Ração engorda', 'saco', 'racao', 40),
    (f, 'Vermífugo injetável', 'frasco', 'medicamento', 10) on conflict do nothing;
  select id into i_sal from public.stock_items where farm_id = f and name = 'Sal mineral';
  select id into i_rac from public.stock_items where farm_id = f and name = 'Ração engorda';
  select id into i_ver from public.stock_items where farm_id = f and name = 'Vermífugo injetável';
  select id into lr from public.lots where farm_id = f and name = 'Recria';
  select id into le from public.lots where farm_id = f and name = 'Engorda';
  select id into lm from public.lots where farm_id = f and name = 'Matrizes';
  select id into p3 from public.pastures where farm_id = f and name = 'Pasto 3';
  perform public.register_stock_movement(f, i_sal, 'entrada', 1000, current_date - 45, 3.20, current_date + 200, 'Agropecuária Central', 'NF 5521', null, null);
  perform public.register_stock_movement(f, i_sal, 'saida', 700, current_date - 20, null, null, null, null, lr, null);
  perform public.register_stock_movement(f, i_sal, 'saida', 120, current_date - 8, null, null, null, null, lm, null);
  perform public.register_stock_movement(f, i_rac, 'entrada', 200, current_date - 40, 78.50, current_date + 120, 'Agropecuária Central', 'NF 5522', null, null);
  perform public.register_stock_movement(f, i_rac, 'saida', 120, current_date - 25, null, null, null, null, le, null);
  perform public.register_stock_movement(f, i_rac, 'saida', 50, current_date - 6, null, null, null, null, le, null);
  perform public.register_stock_movement(f, i_ver, 'entrada', 20, current_date - 30, 45.00, current_date + 20, 'Veterinária Vale', 'NF 9001', null, null);
  insert into public.cost_entries (farm_id, cost_date, description, category, amount, target_type, lot_id, pasture_id) values
    (f, current_date - 25, 'Salário do vaqueiro', 'mao_de_obra', 2800, 'fazenda', null, null),
    (f, current_date - 55, 'Salário do vaqueiro', 'mao_de_obra', 2800, 'fazenda', null, null),
    (f, current_date - 12, 'Combustível do trator', 'combustivel', 640, 'fazenda', null, null),
    (f, current_date - 18, 'Manutenção de cerca', 'manutencao', 1350, 'pasto', null, p3),
    (f, current_date - 9, 'Visita veterinária', 'sanidade', 900, 'lote', le, null);
end $$;

-- 10. Tarefas, contagem e uma consulta salva
do $$
declare f uuid := current_setting('demo.farm')::uuid; le uuid; lr uuid; tags text[];
begin
  select id into le from public.lots where farm_id = f and name = 'Engorda';
  select id into lr from public.lots where farm_id = f and name = 'Recria';
  perform public.create_task(f, 'Vacinar o lote Recria', 'Reforço da vacina', current_date - 2, 'alta', auth.uid(), null, lr);
  perform public.create_task(f, 'Pesar o lote Engorda', null, current_date, 'normal', auth.uid(), null, le);
  perform public.create_task(f, 'Consertar a cerca do Pasto 3', null, current_date + 5, 'normal', null, null, null);
  perform public.create_task(f, 'Contagem de fim de mês', null, current_date + 12, 'baixa', auth.uid(), null, null);
  tags := array(select a.ear_tag from public.animals a where a.farm_id = f and a.lot_id = le and a.status = 'ativo' order by a.ear_tag);
  tags := tags[2:array_length(tags, 1)] || array['D9999'];
  perform public.register_count(f, current_date - 2, 'lote', le, tags, 'Contagem de exemplo');
  insert into public.saved_reports (farm_id, name, definition, shared) values
    (f, 'Animais acima de 400 kg (exemplo)',
     '{"source":"animals","fields":["ear_tag","lot","last_weight","gmd"],"filters":[{"field":"status","op":"eq","value":"ativo"},{"field":"last_weight","op":"gt","value":400}],"order_by":[{"field":"last_weight","dir":"desc"}]}'::jsonb, true);
end $$;

reset role;
commit;

select 'animais' as item, count(*) from public.animals where farm_id = current_setting('demo.farm')::uuid
union all select 'pesagens', count(*) from public.weighings where farm_id = current_setting('demo.farm')::uuid
union all select 'aplicações de saúde', count(*) from public.health_events where farm_id = current_setting('demo.farm')::uuid
union all select 'eventos reprodutivos', count(*) from public.reproduction_events where farm_id = current_setting('demo.farm')::uuid
union all select 'movimentos de estoque', count(*) from public.stock_movements where farm_id = current_setting('demo.farm')::uuid
union all select 'custos', count(*) from public.cost_entries where farm_id = current_setting('demo.farm')::uuid
union all select 'vendas', count(*) from public.sales where farm_id = current_setting('demo.farm')::uuid
union all select 'registros de auditoria', count(*) from public.audit_log where farm_id = current_setting('demo.farm')::uuid;
\echo 'Demonstracao carregada. Abra o site e entre com a sua conta.'
