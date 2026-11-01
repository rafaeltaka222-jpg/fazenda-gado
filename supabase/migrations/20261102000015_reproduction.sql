-- LOTE 3 · Bloco G · Reprodução, partos e genealogia
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Gestação: usa 283 dias após a última cobertura/inseminação como ESTIMATIVA média para bovinos (ajuste conforme a raça/orientação técnica).
-- TODO: reprodutor com histórico próprio na tela, estação de monta, descarte e coberturas múltiplas, calendário reprodutivo por categoria,
-- alertas fora do sistema (e-mail/WhatsApp).

insert into public.permissions (key, resource, action, description)
select 'reproduction.' || a, 'reproduction', a, 'reproduction · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource = 'reproduction' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista') and p.action in ('view','create','update','print','export'))
  or (r.name in ('funcionario','operador') and p.action in ('view','create'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

-- Pai deve ser macho, mãe deve ser fêmea, ninguém é pai/mãe de si mesmo
create function app.animals_parentage() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sire_id is not null and (new.sire_id = new.id or not exists (
       select 1 from public.animals p where p.id = new.sire_id and p.farm_id = new.farm_id and p.sex = 'M')) then
    raise exception 'invalid_parent';
  end if;
  if new.dam_id is not null and (new.dam_id = new.id or not exists (
       select 1 from public.animals p where p.id = new.dam_id and p.farm_id = new.farm_id and p.sex = 'F')) then
    raise exception 'invalid_parent';
  end if;
  return new;
end $$;
create trigger a_animals_parentage before insert or update of sire_id, dam_id on public.animals
  for each row execute function app.animals_parentage();

create table public.reproduction_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  female_id uuid not null,
  male_id uuid,
  event_type text not null check (event_type in ('cobertura','inseminacao','diagnostico','parto','aborto')),
  event_date date not null,
  semen text,
  result text,
  calf_id uuid,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  voided_at timestamptz, voided_by uuid, void_reason text,
  foreign key (farm_id, female_id) references public.animals (farm_id, id),
  foreign key (farm_id, male_id) references public.animals (farm_id, id),
  foreign key (farm_id, calf_id) references public.animals (farm_id, id),
  check (event_type <> 'diagnostico' or result in ('positivo','negativo')),
  check (event_type <> 'parto' or result in ('vivo','natimorto'))
);
create index reproduction_female_idx on public.reproduction_events (female_id, event_date desc);
create index reproduction_farm_idx on public.reproduction_events (farm_id, event_date desc) where voided_at is null;
create trigger reproduction_guard before update or delete on public.reproduction_events for each row execute function app.weighings_guard();
create trigger reproduction_no_truncate before truncate on public.reproduction_events for each statement execute function app.block_change();

revoke all on public.reproduction_events from anon;
revoke insert, update, delete, truncate on public.reproduction_events from authenticated;
grant select on public.reproduction_events to authenticated;
alter table public.reproduction_events enable row level security;
create policy re_select on public.reproduction_events for select to authenticated using (app.has_permission(farm_id, 'reproduction.view'));

-- Cobertura, inseminação, diagnóstico de gestação e aborto
create function public.register_reproduction(p_farm uuid, p_female uuid, p_type text, p_date date, p_male uuid,
                                             p_semen text, p_result text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reproduction.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type not in ('cobertura','inseminacao','diagnostico','aborto') then raise exception 'invalid_type'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  perform 1 from public.animals where id = p_female and farm_id = p_farm and sex = 'F' and status = 'ativo' and deleted_at is null for update;
  if not found then raise exception 'invalid_female'; end if;
  if p_male is not null and not exists (
       select 1 from public.animals where id = p_male and farm_id = p_farm and sex = 'M' and deleted_at is null) then
    raise exception 'invalid_male';
  end if;
  if p_type = 'diagnostico' and coalesce(p_result, '') not in ('positivo','negativo') then raise exception 'invalid_result'; end if;
  insert into public.reproduction_events (farm_id, female_id, male_id, event_type, event_date, semen, result, notes, created_by)
  values (p_farm, p_female, case when p_type in ('cobertura','inseminacao') then p_male end, p_type, p_date,
          case when p_type = 'inseminacao' then nullif(trim(p_semen), '') end,
          case when p_type = 'diagnostico' then p_result end, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Parto: registra o evento e cria o bezerro com pai (da última cobertura, se não informado) e mãe
create function public.register_birth(p_farm uuid, p_dam uuid, p_date date, p_outcome text, p_calf_tag text, p_calf_sex text,
                                      p_sire uuid, p_lot uuid, p_pasture uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_calf uuid; v_sire uuid := p_sire; v_dam record;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'reproduction.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_outcome not in ('vivo','natimorto') then raise exception 'invalid_result'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_date'; end if;
  select a.id as id, a.lot_id as lot_id, a.pasture_id as pasture_id into v_dam from public.animals a
    where a.id = p_dam and a.farm_id = p_farm and a.sex = 'F' and a.status = 'ativo' and a.deleted_at is null for update;
  if not found then raise exception 'invalid_female'; end if;
  if v_sire is null then
    select e.male_id into v_sire from public.reproduction_events e
      where e.female_id = p_dam and e.voided_at is null and e.event_type in ('cobertura','inseminacao') and e.male_id is not null
        and e.event_date <= p_date and e.event_date >= p_date - 320
      order by e.event_date desc limit 1;
  end if;
  if p_outcome = 'vivo' then
    if nullif(trim(p_calf_tag), '') is null or p_calf_sex not in ('M','F') then raise exception 'invalid_calf'; end if;
    insert into public.animals (farm_id, ear_tag, sex, birth_date, entry_date, origin, dam_id, sire_id, lot_id, pasture_id, notes)
    values (p_farm, trim(p_calf_tag), p_calf_sex, p_date, p_date, 'Nascimento na fazenda', p_dam, v_sire,
            coalesce(p_lot, v_dam.lot_id), coalesce(p_pasture, v_dam.pasture_id), nullif(trim(p_notes), ''))
    returning id into v_calf;
  end if;
  insert into public.reproduction_events (farm_id, female_id, male_id, event_type, event_date, result, calf_id, notes, created_by)
  values (p_farm, p_dam, v_sire, 'parto', p_date, p_outcome, v_calf, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.void_reproduction(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  select * into e from public.reproduction_events where id = p_id and voided_at is null;
  if not found then raise exception 'invalid_event'; end if;
  if auth.uid() is null or not app.has_permission(e.farm_id, 'reproduction.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.calf_id is not null then raise exception 'birth_has_calf'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  update public.reproduction_events set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;

-- Situação reprodutiva de cada fêmea ativa (respeita a RLS de quem chama)
create function public.reproduction_status(p_farm uuid)
returns table (animal_id uuid, ear_tag text, status text, last_event_date date, expected_calving date)
language sql stable set search_path = '' as $$
  with fem as (
    select a.id, a.ear_tag from public.animals a
    where a.farm_id = p_farm and a.sex = 'F' and a.status = 'ativo' and a.deleted_at is null),
  last_any as (
    select distinct on (e.female_id) e.female_id, e.event_type, e.result, e.event_date
    from public.reproduction_events e where e.farm_id = p_farm and e.voided_at is null
    order by e.female_id, e.event_date desc, e.created_at desc),
  last_serv as (
    select e.female_id, max(e.event_date) as d from public.reproduction_events e
    where e.farm_id = p_farm and e.voided_at is null and e.event_type in ('cobertura','inseminacao')
    group by e.female_id)
  select f.id, f.ear_tag,
         case when l.event_type is null then 'sem_registro'
              when l.event_type in ('cobertura','inseminacao') then 'servida'
              when l.event_type = 'diagnostico' and l.result = 'positivo' then 'prenha'
              when l.event_type = 'parto' then 'parida'
              else 'vazia' end,
         l.event_date,
         case when l.event_type in ('cobertura','inseminacao') or (l.event_type = 'diagnostico' and l.result = 'positivo')
              then s.d + 283 end
  from fem f left join last_any l on l.female_id = f.id left join last_serv s on s.female_id = f.id
  order by f.ear_tag
$$;

create function public.reproduction_alerts(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  with s as (select * from public.reproduction_status(p_farm))
  select jsonb_build_object(
    'servida', (select count(*) from s where status = 'servida'),
    'prenha', (select count(*) from s where status = 'prenha'),
    'vazia', (select count(*) from s where status = 'vazia'),
    'parida', (select count(*) from s where status = 'parida'),
    'calving_30d', (select count(*) from s where expected_calving between current_date and current_date + 30),
    'overdue_calving', (select count(*) from s where expected_calving < current_date),
    'diagnosis_pending', (select count(*) from s where status = 'servida' and last_event_date < current_date - 45),
    'births_30d', (select count(*) from public.reproduction_events e
                   where e.farm_id = p_farm and e.event_type = 'parto' and e.voided_at is null and e.result = 'vivo'
                     and e.event_date >= current_date - 30),
    'items', coalesce((select jsonb_agg(jsonb_build_object('animal_id', x.animal_id, 'ear_tag', x.ear_tag, 'expected', x.expected_calving) order by x.expected_calving)
                       from (select * from s where expected_calving is not null and expected_calving <= current_date + 30
                             order by expected_calving limit 20) x), '[]'::jsonb))
$$;

revoke execute on function public.register_reproduction(uuid, uuid, text, date, uuid, text, text, text) from public, anon;
revoke execute on function public.register_birth(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.void_reproduction(uuid, text) from public, anon;
revoke execute on function public.reproduction_status(uuid) from public, anon;
revoke execute on function public.reproduction_alerts(uuid) from public, anon;
grant execute on function public.register_reproduction(uuid, uuid, text, date, uuid, text, text, text) to authenticated;
grant execute on function public.register_birth(uuid, uuid, date, text, text, text, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.void_reproduction(uuid, text) to authenticated;
grant execute on function public.reproduction_status(uuid) to authenticated;
grant execute on function public.reproduction_alerts(uuid) to authenticated;

create trigger z_audit after insert or update on public.reproduction_events for each row execute function app.audit_row();
