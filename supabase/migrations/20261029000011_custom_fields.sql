-- LOTE 1 · Bloco B · Campos personalizados (híbrido: colunas reais + JSONB + metadados), com permissão por campo
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Decisões: opções ficam em JSONB na própria definição (em vez de tabela field_options); condição simples (campo = valor);
-- histórico de alterações da estrutura fica na auditoria (campos antigo/novo). Só a entidade "animal" por enquanto.
-- TODO: cadastros personalizados (Equipamentos...), tipos CPF/CNPJ e referência a outro cadastro, índices por expressão
-- nos campos filtráveis, mudança de tipo com migração assistida, gravação atômica na criação do animal.

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  entity text not null default 'animal' check (entity in ('animal')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(trim(label)) between 1 and 80),
  description text,
  data_type text not null check (data_type in ('text','longtext','integer','decimal','date','boolean','list','multilist','money','percent','email','phone')),
  required boolean not null default false,
  default_value text,
  max_length integer check (max_length is null or max_length between 1 and 5000),
  decimals integer check (decimals is null or decimals between 0 and 6),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  condition jsonb,
  position integer not null default 100,
  in_reports boolean not null default true,
  filterable boolean not null default true,
  sortable boolean not null default true,
  groupable boolean not null default false,
  visible_to text[],
  editable_to text[],
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (farm_id, entity, field_key)
);

create function app.field_def_validate() returns trigger language plpgsql set search_path = '' as $$
declare v_other text;
  c_roles constant text[] := array['administrador','gerente','veterinario','zootecnista','funcionario','operador','visualizacao'];
begin
  if tg_op = 'UPDATE' and (new.field_key <> old.field_key or new.data_type <> old.data_type
                           or new.entity <> old.entity or new.farm_id <> old.farm_id) then
    raise exception 'immutable_definition';
  end if;
  if new.data_type in ('list','multilist') then
    if jsonb_array_length(new.options) not between 1 and 100
       or exists (select 1 from jsonb_array_elements(new.options) x
                  where jsonb_typeof(x) <> 'string' or length(trim(x #>> '{}')) not between 1 and 80) then
      raise exception 'invalid_options';
    end if;
  else
    new.options := '[]'::jsonb;
  end if;
  if new.condition is not null then
    if jsonb_typeof(new.condition) <> 'object' or (new.condition ->> 'op') not in ('eq','ne')
       or coalesce(new.condition ->> 'value', '') = '' then
      raise exception 'invalid_condition';
    end if;
    v_other := new.condition ->> 'field';
    if v_other is null or (v_other <> 'sex' and (v_other = new.field_key or not exists (
         select 1 from public.field_definitions fd
         where fd.farm_id = new.farm_id and fd.entity = new.entity and fd.field_key = v_other))) then
      raise exception 'invalid_condition';
    end if;
  end if;
  if new.visible_to is not null and not (new.visible_to <@ c_roles) then raise exception 'invalid_roles'; end if;
  if new.editable_to is not null and not (new.editable_to <@ c_roles) then raise exception 'invalid_roles'; end if;
  return new;
end $$;
create trigger a_field_def_validate before insert or update on public.field_definitions
  for each row execute function app.field_def_validate();
create trigger field_definitions_created before insert on public.field_definitions for each row execute function app.set_created();
create trigger field_definitions_touch before update on public.field_definitions for each row execute function app.touch();

revoke all on public.field_definitions from anon;
revoke insert, update, delete, truncate on public.field_definitions from authenticated;
grant insert (farm_id, entity, field_key, label, description, data_type, required, default_value, max_length, decimals,
              options, condition, position, in_reports, filterable, sortable, groupable, visible_to, editable_to)
  on public.field_definitions to authenticated;
grant update (label, description, required, default_value, max_length, decimals, options, condition, position,
              in_reports, filterable, sortable, groupable, visible_to, editable_to, status)
  on public.field_definitions to authenticated;
alter table public.field_definitions enable row level security;
create policy fd_select on public.field_definitions for select to authenticated using (farm_id in (select app.user_farm_ids()));
create policy fd_insert on public.field_definitions for insert to authenticated with check (app.has_permission(farm_id, 'settings.create'));
create policy fd_update on public.field_definitions for update to authenticated
  using (app.has_permission(farm_id, 'settings.update')) with check (app.has_permission(farm_id, 'settings.update'));
create trigger z_audit after insert or update on public.field_definitions for each row execute function app.audit_row();

-- Valores personalizados: a coluna animals.custom deixa de ser legível/gravável diretamente.
-- Leitura só por get_animal_custom/relatórios (que aplicam a permissão por campo); gravação só por set_animal_custom (que valida).
revoke select on public.animals from authenticated;
grant select (id, farm_id, ear_tag, name, sex, breed_id, category_id, lot_id, pasture_id, sire_id, dam_id, birth_date,
              origin, status, entry_date, exit_date, notes, created_at, created_by, updated_at, updated_by,
              deleted_at, deleted_by, version) on public.animals to authenticated;
revoke insert (custom), update (custom) on public.animals from authenticated;

-- Validador único por tipo (usado por tela, API e importação)
create function app.cf_validate(p_type text, p_raw jsonb, p_max integer, p_dec integer, p_options jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare s text; n numeric; e text;
begin
  if p_type = 'multilist' then
    if jsonb_typeof(p_raw) <> 'array' then raise exception 'invalid_value'; end if;
    for e in select jsonb_array_elements_text(p_raw) loop
      if not (p_options ? e) then raise exception 'invalid_value'; end if;
    end loop;
    return p_raw;
  end if;
  if jsonb_typeof(p_raw) in ('array','object') then raise exception 'invalid_value'; end if;
  s := trim(p_raw #>> '{}');
  if p_type = 'text' then
    if length(s) > coalesce(p_max, 255) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'longtext' then
    if length(s) > coalesce(p_max, 5000) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'integer' then
    if s !~ '^-?[0-9]{1,15}$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s::bigint);
  elsif p_type in ('decimal','money','percent') then
    s := replace(s, ',', '.');
    if s !~ '^-?[0-9]{1,15}(\.[0-9]+)?$' then raise exception 'invalid_value'; end if;
    n := round(s::numeric, case p_type when 'money' then 2 else coalesce(p_dec, 6) end);
    if p_type = 'percent' and (n < 0 or n > 100) then raise exception 'invalid_value'; end if;
    return to_jsonb(n);
  elsif p_type = 'date' then
    if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_value'; end if;
    perform s::date;
    return to_jsonb(s);
  elsif p_type = 'boolean' then
    if s not in ('true','false') then raise exception 'invalid_value'; end if;
    return to_jsonb(s::boolean);
  elsif p_type = 'list' then
    if not (p_options ? s) then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'email' then
    if length(s) > 120 or s !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  elsif p_type = 'phone' then
    if s !~ '^[0-9()+[:space:]-]{8,20}$' then raise exception 'invalid_value'; end if;
    return to_jsonb(s);
  end if;
  raise exception 'invalid_type';
end $$;

-- Valor de um campo personalizado como texto, já respeitando a permissão por campo de quem consulta
create function app.cf_value(p_animal uuid, p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid; v_val jsonb; v_vis text[]; v_role text;
begin
  select a.farm_id, a.custom -> p_key into v_farm, v_val from public.animals a where a.id = p_animal;
  if v_farm is null or v_val is null or not app.has_permission(v_farm, 'animals.view') then return null; end if;
  select fd.visible_to into v_vis from public.field_definitions fd
    where fd.farm_id = v_farm and fd.entity = 'animal' and fd.field_key = p_key;
  if not found then return null; end if;
  if v_vis is not null then
    select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.farm_id = v_farm and m.status = 'active';
    if v_role is null or (v_role <> 'administrador' and not (v_role = any(v_vis))) then return null; end if;
  end if;
  return case when jsonb_typeof(v_val) = 'string' then v_val #>> '{}' else v_val::text end;
end $$;

create function public.get_animal_custom(p_animal uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a record; v_role text; v_out jsonb;
begin
  select an.farm_id as farm_id, an.custom as custom into a from public.animals an where an.id = p_animal and an.deleted_at is null;
  if not found or auth.uid() is null or not app.has_permission(a.farm_id, 'animals.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.farm_id = a.farm_id and m.status = 'active';
  select coalesce(jsonb_object_agg(fd.field_key, a.custom -> fd.field_key), '{}'::jsonb) into v_out
    from public.field_definitions fd
    where fd.farm_id = a.farm_id and fd.entity = 'animal' and a.custom ? fd.field_key
      and (fd.visible_to is null or v_role = 'administrador' or v_role = any(fd.visible_to));
  return v_out;
end $$;

create function public.set_animal_custom(p_animal uuid, p_values jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a record; d record; v_role text; v_new jsonb; v_key text; v_raw jsonb; v_cond boolean; v_other text;
begin
  select an.id as id, an.farm_id as farm_id, an.custom as custom, an.sex as sex, an.created_by as created_by, an.created_at as created_at
    into a from public.animals an where an.id = p_animal and an.deleted_at is null;
  if not found then raise exception 'invalid_animal'; end if;
  if auth.uid() is null or not (
       app.has_permission(a.farm_id, 'animals.update')
       or (app.has_permission(a.farm_id, 'animals.create') and a.created_by = auth.uid()
           and a.created_at > now() - interval '5 minutes')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'invalid_values'; end if;
  select r.name into v_role from public.memberships m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.farm_id = a.farm_id and m.status = 'active';
  v_new := a.custom;

  for v_key, v_raw in select * from jsonb_each(p_values) loop
    select * into d from public.field_definitions fd
      where fd.farm_id = a.farm_id and fd.entity = 'animal' and fd.field_key = v_key;
    if not found or d.status <> 'active' then raise exception 'invalid_field'; end if;
    if d.editable_to is not null and v_role <> 'administrador' and not (v_role = any(d.editable_to)) then
      raise exception 'forbidden_field' using errcode = '42501';
    end if;
    if v_raw is null or jsonb_typeof(v_raw) = 'null'
       or (jsonb_typeof(v_raw) = 'string' and trim(v_raw #>> '{}') = '')
       or (jsonb_typeof(v_raw) = 'array' and jsonb_array_length(v_raw) = 0) then
      v_new := v_new - v_key;
    else
      v_new := v_new || jsonb_build_object(v_key, app.cf_validate(d.data_type, v_raw, d.max_length, d.decimals, d.options));
    end if;
  end loop;

  -- Condições (campo só vale quando a condição é atendida) e obrigatoriedade
  for d in select * from public.field_definitions fd
           where fd.farm_id = a.farm_id and fd.entity = 'animal' and fd.status = 'active' loop
    v_cond := true;
    if d.condition is not null then
      v_other := case when d.condition ->> 'field' = 'sex' then a.sex else v_new ->> (d.condition ->> 'field') end;
      v_cond := case d.condition ->> 'op'
                  when 'eq' then coalesce(v_other, '') = (d.condition ->> 'value')
                  else coalesce(v_other, '') <> (d.condition ->> 'value') end;
    end if;
    if v_cond then
      if d.required and not (v_new ? d.field_key)
         and (d.editable_to is null or v_role = 'administrador' or v_role = any(d.editable_to)) then
        raise exception 'required_missing:%', d.field_key;
      end if;
    else
      v_new := v_new - d.field_key;
    end if;
  end loop;

  update public.animals set custom = v_new where id = p_animal;
end $$;

-- Relatórios com campos personalizados: resolve a expressão de cada campo (núcleo ou "cf:chave")
create function app.report_field(p_farm uuid, p_key text, p_use text)
returns table (expr text, ftype text) language plpgsql stable security definer set search_path = '' as $$
declare d record;
begin
  if p_key like 'cf:%' then
    select fd.data_type as data_type, fd.in_reports as in_reports, fd.filterable as filterable, fd.sortable as sortable
      into d from public.field_definitions fd
      where fd.farm_id = p_farm and fd.entity = 'animal' and fd.field_key = substr(p_key, 4);
    if not found then return; end if;
    if (p_use = 'select' and not d.in_reports) or (p_use = 'filter' and not d.filterable)
       or (p_use = 'order' and not d.sortable) then return; end if;
    return query select format('app.cf_value(id, %L)', substr(p_key, 4)),
      (case when d.data_type in ('integer','decimal','money','percent') then 'number'
            when d.data_type = 'date' then 'date' else 'text' end)::text;
  else
    return query select format('%I', rf.key), rf.type::text from public.report_fields rf
      where rf.source = 'animals' and rf.key = p_key;
  end if;
end $$;

create or replace function public.run_report(p_farm uuid, p_def jsonb, p_limit integer default 1000,
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
    select * into v_f from app.report_field(p_farm, v_key, 'select');
    if not found then raise exception 'invalid_field'; end if;
    if v_key = any(v_fields) then continue; end if;
    v_fields := v_fields || v_key;
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%s as %I', v_f.expr, v_key);
  end loop;

  if coalesce(jsonb_typeof(p_def -> 'filters'), '') = 'array' then
    if jsonb_array_length(p_def -> 'filters') > 20 then raise exception 'too_many_filters'; end if;
    for v_item in select * from jsonb_array_elements(p_def -> 'filters') loop
      select * into v_f from app.report_field(p_farm, v_item ->> 'field', 'filter');
      if not found then raise exception 'invalid_field'; end if;
      v_op := v_item ->> 'op';
      v_val := v_item -> 'value';
      v_expr := v_f.expr;
      v_t := case v_f.ftype when 'number' then 'numeric' else 'date' end;

      if v_op = 'empty' then
        v_where := v_where || format(' and %s is null', v_expr);
      elsif v_op = 'notempty' then
        v_where := v_where || format(' and %s is not null', v_expr);
      elsif v_op in ('eq','ne','gt','gte','lt','lte') then
        if v_val is null or jsonb_typeof(v_val) in ('array','object','null') then raise exception 'invalid_value'; end if;
        v_sym := case v_op when 'eq' then '=' when 'ne' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end;
        if v_f.ftype = 'text' then
          if v_op not in ('eq','ne') then raise exception 'invalid_operator'; end if;
          v_where := v_where || format(' and lower(%s) %s lower(%L)', v_expr, v_sym, v_val #>> '{}');
        else
          v_where := v_where || format(' and (%s)::%s %s %L::%s', v_expr, v_t, v_sym, v_val #>> '{}', v_t);
        end if;
      elsif v_op = 'between' then
        if v_f.ftype = 'text' then raise exception 'invalid_operator'; end if;
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) <> 2 then raise exception 'invalid_value'; end if;
        v_where := v_where || format(' and (%s)::%s between %L::%s and %L::%s', v_expr, v_t, v_val ->> 0, v_t, v_val ->> 1, v_t);
      elsif v_op = 'contains' then
        if v_f.ftype <> 'text' or v_val is null or jsonb_typeof(v_val) <> 'string' then raise exception 'invalid_operator'; end if;
        v_where := v_where || format(' and %s ilike %L', v_expr,
          '%' || replace(replace(replace(v_val #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%');
      elsif v_op = 'in' then
        if v_f.ftype <> 'text' or jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) not between 1 and 100 then
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
      select * into v_f from app.report_field(p_farm, v_item ->> 'field', 'order');
      if not found then raise exception 'invalid_field'; end if;
      if coalesce(v_item ->> 'dir', 'asc') not in ('asc','desc') then raise exception 'invalid_direction'; end if;
      v_expr := case v_f.ftype when 'number' then format('(%s)::numeric', v_f.expr)
                               when 'date' then format('(%s)::date', v_f.expr) else v_f.expr end;
      v_order := v_order || case when v_order = '' then '' else ', ' end
                 || format('%s %s nulls last', v_expr, coalesce(v_item ->> 'dir', 'asc'));
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

revoke execute on function public.get_animal_custom(uuid) from public, anon;
revoke execute on function public.set_animal_custom(uuid, jsonb) from public, anon;
grant execute on function public.get_animal_custom(uuid) to authenticated;
grant execute on function public.set_animal_custom(uuid, jsonb) to authenticated;
