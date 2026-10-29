create function public.get_workspace_members(p_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception using
      errcode = '42501',
      message = 'Workspace membership is required to list its members';
  end if;

  return query
  select wm.user_id, profiles.display_name, wm.role, wm.joined_at
  from public.workspace_members as wm
  left join public.profiles
    on profiles.id = wm.user_id
  where wm.workspace_id = p_workspace_id
  order by
    case wm.role
      when 'owner' then 1
      when 'admin' then 2
      when 'editor' then 3
      else 4
    end,
    profiles.display_name nulls last,
    wm.joined_at;
end;
$$;

revoke all on function public.get_workspace_members(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_members(uuid) to authenticated;

create function public.change_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to change workspace roles';
  end if;

  if p_role is null or p_role not in ('admin', 'editor', 'viewer') then
    raise exception using
      errcode = '22023',
      message = 'The requested workspace role is invalid';
  end if;

  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Workspace membership is required to change roles';
  end if;

  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only workspace owners and admins can change member roles';
  end if;

  if p_user_id = v_actor_id then
    raise exception using
      errcode = '42501',
      message = 'Members cannot change their own workspace role';
  end if;

  select wm.role
  into v_target_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The target is not a member of this workspace';
  end if;

  if v_actor_role = 'admin'
     and (v_target_role not in ('editor', 'viewer') or p_role = 'admin')
  then
    raise exception using
      errcode = '42501',
      message = 'Admins can manage editors and viewers but cannot assign admin roles';
  end if;

  if v_target_role = 'owner' then
    if v_actor_role <> 'owner' then
      raise exception using
        errcode = '42501',
        message = 'Only an owner can change another owner role';
    end if;

    select count(*)::integer
    into v_owner_count
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.role = 'owner';

    if v_owner_count <= 1 then
      raise exception using
        errcode = '22023',
        message = 'The last workspace owner cannot be demoted';
    end if;
  end if;

  update public.workspace_members
  set role = p_role
  where workspace_id = p_workspace_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.change_workspace_member_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.change_workspace_member_role(uuid, uuid, text) to authenticated;

create function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to remove a workspace member';
  end if;

  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Workspace membership is required to remove a member';
  end if;

  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_actor_id;

  if v_actor_role is null then
    raise exception using
      errcode = '42501',
      message = 'Workspace membership is required to remove a member';
  end if;

  select wm.role
  into v_target_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The target is not a member of this workspace';
  end if;

  if p_user_id <> v_actor_id then
    if v_actor_role not in ('owner', 'admin') then
      raise exception using
        errcode = '42501',
        message = 'Only workspace owners and admins can remove other members';
    end if;

    if v_actor_role = 'admin'
       and v_target_role not in ('editor', 'viewer')
    then
      raise exception using
        errcode = '42501',
        message = 'Admins cannot remove owners or other admins';
    end if;
  end if;

  if v_target_role = 'owner' then
    select count(*)::integer
    into v_owner_count
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.role = 'owner';

    if v_owner_count <= 1 then
      raise exception using
        errcode = '22023',
        message = 'The last workspace owner cannot leave or be removed';
    end if;
  end if;

  delete from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
