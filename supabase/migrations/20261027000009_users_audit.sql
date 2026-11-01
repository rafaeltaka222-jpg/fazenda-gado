-- ETAPA 1 (pendências) · Tela de usuários da fazenda e consulta de auditoria
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- Fluxo de convite: a pessoa cria a própria conta na tela de login e o administrador a adiciona pelo e-mail.
-- TODO: convite por e-mail com link, 2FA, criação/edição de perfis personalizados, permissão por campo na tela.

-- Membros da fazenda (com e-mail, que a aplicação não consegue ler diretamente)
create function public.farm_members(p_farm uuid)
returns table (membership_id uuid, user_id uuid, email text, full_name text, role_id uuid, role_name text,
               status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'users.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, u.email::text, pr.full_name, m.role_id, r.name, m.status, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.id = m.user_id
    join public.roles r on r.id = m.role_id
    where m.farm_id = p_farm
    order by u.email;
end $$;

-- Adiciona à fazenda alguém que já criou conta. As proteções de escalada de privilégios e de último
-- administrador continuam valendo (gatilho em memberships).
create function public.add_member_by_email(p_farm uuid, p_email text, p_role uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid; v_org uuid;
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'users.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select f.organization_id into v_org from public.farms f where f.id = p_farm;
  if not exists (select 1 from public.roles r where r.id = p_role and (r.is_system or r.organization_id = v_org)) then
    raise exception 'invalid_role';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user and m.farm_id = p_farm) then
    raise exception 'already_member';
  end if;
  insert into public.memberships (user_id, farm_id, role_id) values (v_user, p_farm, p_role) returning id into v_id;
  return v_id;
end $$;

-- Consulta de auditoria com o e-mail de quem fez a alteração
create function public.audit_entries(p_farm uuid, p_table text, p_op text, p_from date, p_to date,
                                     p_limit integer default 50, p_offset integer default 0)
returns table (id bigint, occurred_at timestamptz, user_email text, operation text, table_name text,
               record_id text, changed_fields jsonb, old_data jsonb, new_data jsonb, source text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_permission(p_farm, 'audit.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select l.id, l.occurred_at, u.email::text, l.operation, l.table_name, l.record_id,
           l.changed_fields, l.old_data, l.new_data, l.source, count(*) over ()
    from public.audit_log l
    left join auth.users u on u.id = l.user_id
    where l.farm_id = p_farm
      and (p_table is null or l.table_name = p_table)
      and (p_op is null or l.operation = p_op)
      and (p_from is null or l.occurred_at >= (p_from::timestamp at time zone 'America/Bahia'))
      and (p_to is null or l.occurred_at < ((p_to + 1)::timestamp at time zone 'America/Bahia'))
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function public.farm_members(uuid) from public, anon;
revoke execute on function public.add_member_by_email(uuid, text, uuid) from public, anon;
revoke execute on function public.audit_entries(uuid, text, text, date, date, integer, integer) from public, anon;
grant execute on function public.farm_members(uuid) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, uuid) to authenticated;
grant execute on function public.audit_entries(uuid, text, text, date, date, integer, integer) to authenticated;
