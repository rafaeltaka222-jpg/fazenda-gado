-- LOTE 4 · Bloco C · Tarefas (agenda da fazenda)
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- TODO: tarefas recorrentes, geradas automaticamente por alertas (vacina, pesagem), notificações por e-mail/WhatsApp.

insert into public.permissions (key, resource, action, description)
select 'tasks.' || a, 'tasks', a, 'tasks · ' || a
from unnest(array['view','create','update','delete','export','print','import']) a on conflict do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.resource = 'tasks' and (
     r.name in ('administrador','gerente')
  or (r.name in ('veterinario','zootecnista','funcionario','operador') and p.action in ('view','create','update'))
  or (r.name = 'visualizacao' and p.action = 'view'))
where r.is_system on conflict do nothing;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  due_date date,
  priority text not null default 'normal' check (priority in ('baixa','normal','alta')),
  status text not null default 'aberta' check (status in ('aberta','concluida','cancelada')),
  assigned_to uuid references auth.users(id),
  animal_id uuid, lot_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  completed_at timestamptz, completed_by uuid,
  foreign key (farm_id, animal_id) references public.animals (farm_id, id),
  foreign key (farm_id, lot_id) references public.lots (farm_id, id)
);
create index tasks_farm_idx on public.tasks (farm_id, status, due_date);
revoke all on public.tasks from anon;
revoke insert, update, delete, truncate on public.tasks from authenticated;
grant select on public.tasks to authenticated;
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (app.has_permission(farm_id, 'tasks.view'));

create function public.create_task(p_farm uuid, p_title text, p_desc text, p_due date, p_priority text,
                                   p_assignee uuid, p_animal uuid, p_lot uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'tasks.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_assignee is not null and not exists (
       select 1 from public.memberships m where m.user_id = p_assignee and m.farm_id = p_farm and m.status = 'active') then
    raise exception 'invalid_assignee';
  end if;
  if p_animal is not null and not exists (select 1 from public.animals a where a.id = p_animal and a.farm_id = p_farm and a.deleted_at is null) then
    raise exception 'invalid_animal';
  end if;
  if p_lot is not null and not exists (select 1 from public.lots l where l.id = p_lot and l.farm_id = p_farm and l.deleted_at is null) then
    raise exception 'invalid_lot';
  end if;
  insert into public.tasks (farm_id, title, description, due_date, priority, assigned_to, animal_id, lot_id, created_by)
  values (p_farm, trim(p_title), nullif(trim(p_desc), ''), p_due, coalesce(p_priority, 'normal'), p_assignee, p_animal, p_lot, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.set_task_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select farm_id into v_farm from public.tasks where id = p_id;
  if v_farm is null then raise exception 'invalid_task'; end if;
  if auth.uid() is null or not app.has_permission(v_farm, 'tasks.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('aberta','concluida','cancelada') then raise exception 'invalid_status'; end if;
  update public.tasks set status = p_status,
    completed_at = case when p_status = 'concluida' then now() end,
    completed_by = case when p_status = 'concluida' then auth.uid() end
  where id = p_id;
end $$;

-- Lista com e-mail do responsável (o e-mail só é lido aqui, para quem pode ver tarefas)
create function public.task_list(p_farm uuid, p_status text default null)
returns table (id uuid, title text, description text, due_date date, priority text, status text,
               assignee_id uuid, assignee_email text, animal_id uuid, ear_tag text, lot_name text, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'tasks.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.id, t.title, t.description, t.due_date, t.priority, t.status, t.assigned_to, u.email::text,
           t.animal_id, a.ear_tag, l.name, t.completed_at
    from public.tasks t
    left join auth.users u on u.id = t.assigned_to
    left join public.animals a on a.id = t.animal_id
    left join public.lots l on l.id = t.lot_id
    where t.farm_id = p_farm and (p_status is null or t.status = p_status)
    order by t.due_date nulls last, t.created_at
    limit 200;
end $$;

create function public.tasks_summary(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  with o as (select t.id, t.title, t.due_date, t.priority from public.tasks t where t.farm_id = p_farm and t.status = 'aberta')
  select jsonb_build_object(
    'open', (select count(*) from o),
    'overdue', (select count(*) from o where due_date < current_date),
    'today', (select count(*) from o where due_date = current_date),
    'next7', (select count(*) from o where due_date between current_date + 1 and current_date + 7),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'due', x.due_date, 'priority', x.priority) order by x.due_date)
                       from (select * from o where due_date is not null and due_date <= current_date + 7 order by due_date limit 10) x), '[]'::jsonb))
$$;
revoke execute on function public.create_task(uuid, text, text, date, text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.set_task_status(uuid, text) from public, anon;
revoke execute on function public.task_list(uuid, text) from public, anon;
revoke execute on function public.tasks_summary(uuid) from public, anon;
grant execute on function public.create_task(uuid, text, text, date, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.set_task_status(uuid, text) to authenticated;
grant execute on function public.task_list(uuid, text) to authenticated;
grant execute on function public.tasks_summary(uuid) to authenticated;
create trigger z_audit after insert or update on public.tasks for each row execute function app.audit_row();
