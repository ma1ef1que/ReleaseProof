-- The Edge Function generates and emails the raw token. This RPC accepts only
-- its SHA-256 hash, so direct browser calls cannot obtain a usable token.
create function public.create_workspace_invitation_for_delivery(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text
)
returns table (
  invitation_id uuid,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_id;
  v_actor_role text;
  v_email text := lower(btrim(p_email));
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_actor_id is null then
    raise exception using errcode = '22023', message = 'The invitation actor is invalid';
  end if;
  if v_email is null or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_role is null or p_role not in ('admin', 'editor', 'viewer') then
    raise exception using errcode = '22023', message = 'The invitation details are invalid';
  end if;

  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Workspace membership is required to invite members';
  end if;

  select wm.role into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id and wm.user_id = v_actor_id;
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Only workspace owners and admins can invite members';
  end if;
  if v_actor_role = 'admin' and p_role = 'admin' then
    raise exception using errcode = '42501', message = 'Admins cannot invite other admins';
  end if;
  if exists (
    select 1 from public.workspace_members as wm
    join auth.users as users on users.id = wm.user_id
    where wm.workspace_id = p_workspace_id and lower(users.email) = v_email
  ) then
    raise exception using errcode = '22023', message = 'This email address is already a workspace member';
  end if;
  if exists (
    select 1 from public.workspace_invitations as i
    where i.workspace_id = p_workspace_id and i.email_normalized = v_email and i.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'A pending invitation already exists for this email address';
  end if;
  if (
    select count(*) from public.workspace_invitations as i
    where i.workspace_id = p_workspace_id and i.invited_by = v_actor_id
      and i.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'The workspace invitation rate limit has been reached';
  end if;

  insert into public.workspace_invitations (
    workspace_id, email_normalized, role, invited_by, token_hash, expires_at
  ) values (
    p_workspace_id, v_email, p_role, v_actor_id, p_token_hash, v_expires_at
  ) returning id into v_invitation_id;

  return query select v_invitation_id, v_expires_at;
end;
$$;

revoke all on function public.create_workspace_invitation_for_delivery(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_invitation_for_delivery(uuid, uuid, text, text, text) to service_role;
