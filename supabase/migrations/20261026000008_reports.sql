-- ETAPA 4 · Bloco 1 · Relatórios e consultas (fonte: animais): catálogo, compilador seguro, consultas salvas, registro de execuções
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: outras fontes (pesagens, movimentações, vendas), agrupamento/totais/campos calculados, campos personalizados (cf:),
-- permissão por campo, exportação Excel/PDF nativos, execução assíncrona de consultas grandes.

-- Visão de relatório: SECURITY INVOKER, então a RLS das tabelas de origem vale para quem consulta
create view public.v_report_animals with (security_invoker = true) as
select
  a.farm_id, a.id, a.ear_tag, a.name,
  case a.sex when 'M' then 'Macho' else 'Fêmea' end as sex,
  b.name as breed, c.name as category, l.name as lot, p.name as pasture,
  a.status, a.birth_date, a.entry_date, a.exit_date, a.origin,
  case when a.birth_date is not null
       then (extract(year from age(current_date, a.birth_date)) * 12 + extract(month from age(current_date, a.birth_date)))::int
  end as age_months,
  w1.weight_kg as last_weight,
  w1.weighed_at::date as last_weighed_on,
  (current_date - w1.weighed_at::date) as days_since_weighing,
  case when w1.weighed_at is not null and w2.weighed_at is not null and w1.weighed_at > w2.weighed_at
       then round((w1.weight_kg - w2.weight_kg) / (extract(epoch from (w1.weighed_at - w2.weighed_at)) / 86400.0), 2)
  end as gmd
from public.animals a
left join public.breeds b on b.id = a.breed_id
left join public.categories c on c.id = a.category_id
left join public.lots l on l.id = a.lot_id
left join public.pastures p on p.id = a.pasture_id
left join lateral (
  select w.weight_kg, w.weighed_at from public.weighings w
  where w.animal_id = a.id and w.voided_at is null order by w.weighed_at desc limit 1) w1 on true
left join lateral (
  select w.weight_kg, w.weighed_at from public.weighings w
  where w.animal_id = a.id and w.voided_at is null order by w.weighed_at desc offset 1 limit 1) w2 on true
where a.deleted_at is null;

-- Catálogo de campos disponíveis (o usuário nunca digita nome de tabela ou coluna)
create table public.report_fields (
  source text not null,
  key text not null,
  label text not null,
  type text not null check (type in ('text','number','date')),
  position integer not null,
  primary key (source, key)
);
insert into public.report_fields (source, key, label, type, position) values
  ('animals','ear_tag','Brinco','text',1),
  ('animals','name','Nome','text',2),
  ('animals','sex','Sexo','text',3),
  ('animals','breed','Raça','text',4),
  ('animals','category','Categoria','text',5),
  ('animals','lot','Lote','text',6),
  ('animals','pasture','Pasto','text',7),
  ('animals','status','Situação','text',8),
  ('animals','birth_date','Nascimento','date',9),
  ('animals','age_months','Idade (meses)','number',10),
  ('animals','entry_date','Data de entrada','date',11),
  ('animals','exit_date','Data de saída','date',12),
  ('animals','origin','Origem','text',13),
  ('animals','last_weight','Peso atual (kg)','number',14),
  ('animals','last_weighed_on','Data da última pesagem','date',15),
  ('animals','days_since_weighing','Dias sem pesar','number',16),
  ('animals','gmd','GMD (kg/dia)','number',17);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  user_id uuid,
  channel text not null check (channel in ('tela','csv')),
  definition jsonb not null,
  row_count bigint not null,
  created_at timestamptz not null default now()
);
create index report_runs_farm_idx on public.report_runs (farm_id, created_at desc);

create function app.log_report_run(p_farm uuid, p_def jsonb, p_rows bigint, p_channel text) returns void
language sql security definer set search_path = '' as $$
  insert into public.report_runs (farm_id, user_id, channel, definition, row_count)
  values (p_farm, auth.uid(), p_channel, p_def, p_rows)
$$;
revoke execute on function app.log_report_run(uuid, jsonb, bigint, text) from public, anon;
grant execute on function app.log_report_run(uuid, jsonb, bigint, text) to authenticated;

-- Compilador: definição JSON -> SQL. Só identificadores do catálogo; valores sempre escapados com %L.
-- {"source":"animals","fields":["ear_tag","breed"],
--  "filters":[{"field":"sex","op":"eq","value":"Macho"},{"field":"last_weight","op":"gt","value":400}],
--  "order_by":[{"field":"ear_tag","dir":"asc"}]}
-- Operadores: eq, ne, gt, gte, lt, lte, between, contains (texto), in (texto), empty, notempty.
create function public.run_report(p_farm uuid, p_def jsonb, p_limit integer default 1000,
                                  p_offset integer default 0, p_channel text default 'tela')
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_fields text[] := '{}'; v_key text; v_f record; v_cols text := ''; v_where text := ''; v_order text := '';
  v_item jsonb; v_op text; v_val jsonb; v_expr text; v_total bigint; v_rows jsonb; v_sql text; v_t text; v_sym text;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reports.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_def is null or jsonb_typeof(p_def) <> 'object' or coalesce(p_def ->> 'source', '') <> 'animals' then
    raise exception 'invalid_source';
  end if;
  if p_channel not in ('tela','csv') then raise exception 'invalid_channel'; end if;
  p_limit := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if coalesce(jsonb_typeof(p_def -> 'fields'), '') <> 'array'
     or jsonb_array_length(p_def -> 'fields') not between 1 and 30 then
    raise exception 'invalid_fields';
  end if;
  for v_key in select jsonb_array_elements_text(p_def -> 'fields') loop
    if not exists (select 1 from public.report_fields rf where rf.source = 'animals' and rf.key = v_key) then
      raise exception 'invalid_field';
    end if;
    if v_key = any(v_fields) then continue; end if;
    v_fields := v_fields || v_key;
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%I', v_key);
  end loop;

  if coalesce(jsonb_typeof(p_def -> 'filters'), '') = 'array' then
    if jsonb_array_length(p_def -> 'filters') > 20 then raise exception 'too_many_filters'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'filters') loop
      select rf.key as key, rf.type as type into v_f
        from public.report_fields rf where rf.source = 'animals' and rf.key = (v_item ->> 'field');
      if not found then raise exception 'invalid_field'; end if;
      v_op := v_item ->> 'op';
      v_val := v_item -> 'value';
      v_expr := format('%I', v_f.key);
      v_t := case v_f.type when 'number' then 'numeric' else 'date' end;

      if v_op = 'empty' then
        v_where := v_where || format(' and %s is null', v_expr);
      elsif v_op = 'notempty' then
        v_where := v_where || format(' and %s is not null', v_expr);
      elsif v_op in ('eq','ne','gt','gte','lt','lte') then
        if v_val is null or jsonb_typeof(v_val) in ('array','object','null') then raise exception 'invalid_value'; end if;
        v_sym := case v_op when 'eq' then '=' when 'ne' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end;
        if v_f.type = 'text' then
          if v_op not in ('eq','ne') then raise exception 'invalid_operator'; end if;
          v_where := v_where || format(' and lower(%s) %s lower(%L)', v_expr, v_sym, v_val #>> '{}');
        else
          v_where := v_where || format(' and %s %s %L::%s', v_expr, v_sym, v_val #>> '{}', v_t);
        end if;
      elsif v_op = 'between' then
        if v_f.type = 'text' then raise exception 'invalid_operator'; end if;
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) <> 2 then raise exception 'invalid_value'; end if;
        v_where := v_where || format(' and %s between %L::%s and %L::%s', v_expr, v_val ->> 0, v_t, v_val ->> 1, v_t);
      elsif v_op = 'contains' then
        if v_f.type <> 'text' or v_val is null or jsonb_typeof(v_val) <> 'string' then raise exception 'invalid_operator'; end if;
        v_where := v_where || format(' and %s ilike %L', v_expr,
          '%' || replace(replace(replace(v_val #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%');
      elsif v_op = 'in' then
        if v_f.type <> 'text' or jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 100 then
          raise exception 'invalid_operator';
        end if;
        v_where := v_where || format(' and lower(%s) = any (array(select lower(x) from jsonb_array_elements_text(%L::jsonb) x))',
          v_expr, v_val::text);
      else
        raise exception 'invalid_operator';
      end if;
    end loop;
  end if;

  if coalesce(jsonb_typeof(p_def -> 'order_by'), '') = 'array' then
    if jsonb_array_length(p_def -> 'order_by') > 5 then raise exception 'too_many_orders'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'order_by') loop
      if not exists (select 1 from public.report_fields rf where rf.source = 'animals' and rf.key = (v_item ->> 'field')) then
        raise exception 'invalid_field';
      end if;
      if coalesce(v_item ->> 'dir', 'asc') not in ('asc','desc') then raise exception 'invalid_direction'; end if;
      v_order := v_order || case when v_order = '' then '' else ', ' end
                 || format('%I %s nulls last', v_item ->> 'field', coalesce(v_item ->> 'dir', 'asc'));
    end loop;
  end if;
  v_order := case when v_order = '' then 'ear_tag asc, id' else v_order || ', id' end;

  execute format('select count(*) from public.v_report_animals where farm_id = %L%s', p_farm, v_where) into v_total;
  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''rn'' order by t.rn), ''[]''::jsonb) from ('
    || 'select %s, row_number() over (order by %s) as rn from public.v_report_animals '
    || 'where farm_id = %L%s order by %s limit %s offset %s) t',
    v_cols, v_order, p_farm, v_where, v_order, p_limit, p_offset);
  execute v_sql into v_rows;

  if p_offset = 0 then perform app.log_report_run(p_farm, p_def, v_total, p_channel); end if;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'columns', to_jsonb(v_fields));
end $$;

-- Consultas salvas ("Minhas consultas")
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null check (length(trim(name)) > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  shared boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1
);
create unique index saved_reports_name_uq on public.saved_reports (farm_id, created_by, lower(name));
create trigger saved_reports_created before insert on public.saved_reports for each row execute function app.set_created();
create trigger saved_reports_touch before update on public.saved_reports for each row execute function app.touch();

-- Privilégios e RLS
revoke all on public.v_report_animals, public.report_fields, public.report_runs, public.saved_reports from anon;
grant select on public.v_report_animals to authenticated;
revoke insert, update, delete, truncate on public.report_fields, public.report_runs from authenticated;
revoke insert, update, delete, truncate on public.saved_reports from authenticated;
grant insert (farm_id, name, definition, shared) on public.saved_reports to authenticated;
grant update (name, definition, shared) on public.saved_reports to authenticated;
grant delete on public.saved_reports to authenticated;
revoke execute on function public.run_report(uuid, jsonb, integer, integer, text) from public, anon;
grant execute on function public.run_report(uuid, jsonb, integer, integer, text) to authenticated;

alter table public.report_fields enable row level security;
alter table public.report_runs enable row level security;
alter table public.saved_reports enable row level security;
create policy fields_select on public.report_fields for select to authenticated using (true);
create policy runs_select on public.report_runs for select to authenticated using (app.has_permission(farm_id, 'audit.view'));
create policy saved_select on public.saved_reports for select to authenticated
  using (app.has_permission(farm_id, 'reports.view') and (created_by = auth.uid() or shared));
create policy saved_insert on public.saved_reports for insert to authenticated
  with check (app.has_permission(farm_id, 'reports.builder'));
create policy saved_update on public.saved_reports for update to authenticated
  using (created_by = auth.uid() and app.has_permission(farm_id, 'reports.builder'))
  with check (created_by = auth.uid() and app.has_permission(farm_id, 'reports.builder'));
create policy saved_delete on public.saved_reports for delete to authenticated using (created_by = auth.uid());

create trigger z_audit after insert or update or delete on public.saved_reports for each row execute function app.audit_row();
