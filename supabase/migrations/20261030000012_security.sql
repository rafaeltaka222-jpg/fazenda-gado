-- LOTE 1 · Bloco C · Segurança: restrição de criação de organizações e criação de fazendas por administradores
-- STATUS: escrito, AINDA NÃO EXECUTADO.
-- 2FA e renovação de sessão são feitos na aplicação (Supabase Auth). TODO: exigir nível aal2 também no banco (RLS).

-- Só quem ainda não tem acesso a nenhuma fazenda pode criar uma nova organização
create or replace function public.create_organization_with_farm(p_org_name text, p_farm_code text, p_farm_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_farm uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships m where m.user_id = auth.uid()) then
    raise exception 'already_has_access';
  end if;
  select id into v_admin from public.roles where is_system and name = 'administrador';
  insert into public.organizations (name, created_by) values (p_org_name, auth.uid()) returning id into v_org;
  insert into public.farms (organization_id, code, name, created_by)
    values (v_org, p_farm_code, p_farm_name, auth.uid()) returning id into v_farm;
  insert into public.memberships (user_id, farm_id, role_id) values (auth.uid(), v_farm, v_admin);
  return v_farm;
end $$;

-- Administrador de uma fazenda da organização cria outra fazenda na mesma organização
create function public.create_farm_in_org(p_org uuid, p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select id into v_admin from public.roles where is_system and name = 'administrador';
  if not exists (
    select 1 from public.memberships m join public.farms f on f.id = m.farm_id
    where m.user_id = auth.uid() and m.status = 'active' and m.role_id = v_admin and f.organization_id = p_org
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.farms (organization_id, code, name, created_by) values (p_org, p_code, p_name, auth.uid())
    returning id into v_farm;
  insert into public.memberships (user_id, farm_id, role_id) values (auth.uid(), v_farm, v_admin);
  return v_farm;
end $$;
revoke execute on function public.create_farm_in_org(uuid, text, text) from public, anon;
grant execute on function public.create_farm_in_org(uuid, text, text) to authenticated;
