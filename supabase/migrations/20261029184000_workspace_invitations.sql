create extension if not exists pgcrypto with schema extensions;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email_normalized text not null,
  role text not null,
  invited_by uuid not null references auth.users (id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_invitations_email_format check (
    char_length(email_normalized) between 3 and 320
    and email_normalized = lower(btrim(email_normalized))
    and email_normalized like '%_@_%._%'
  ),
  constraint workspace_invitations_role check (
    role in ('admin', 'editor', 'viewer')
  ),
  constraint workspace_invitations_status check (
    status in ('pending', 'accepted', 'revoked', 'expired')
  ),
  constraint workspace_invitations_accepted check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create index workspace_invitations_workspace_status_idx
  on public.workspace_invitations (workspace_id, status, expires_at);

create unique index workspace_invitations_one_pending_email_idx
  on public.workspace_invitations (workspace_id, email_normalized)
  where status = 'pending';

alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;
revoke all on table public.workspace_invitations from public, anon, authenticated;

create function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text
)
returns table (
  invitation_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
  v_issuer text;
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to invite a workspace member';
  end if;

  v_issuer := coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'iss'),
    ''
  );
  if v_issuer !~ '^http://(127\.0\.0\.1|localhost):[0-9]+/auth/v1$' then
    raise exception using
      errcode = '42501',
      message = 'Manual invitations are available only in the local development environment';
  end if;

  if v_email is null or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'The invitation email address is invalid';
  end if;

  if p_role is null or p_role not in ('admin', 'editor', 'viewer') then
    raise exception using
      errcode = '22023',
      message = 'The requested invitation role is invalid';
  end if;

  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'Workspace membership is required to invite members';
  end if;

  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only workspace owners and admins can invite members';
  end if;

  if v_actor_role = 'admin' and p_role = 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Admins cannot invite other admins';
  end if;

  if exists (
    select 1
    from public.workspace_members as wm
    join auth.users as users on users.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and lower(users.email) = v_email
  ) then
    raise exception using
      errcode = '22023',
      message = 'This email address is already a workspace member';
  end if;

  if exists (
    select 1
    from public.workspace_invitations as invitations
    where invitations.workspace_id = p_workspace_id
      and invitations.email_normalized = v_email
      and invitations.status = 'pending'
  ) then
    raise exception using
      errcode = '23505',
      message = 'A pending invitation already exists for this email address';
  end if;

  if (
    select count(*)
    from public.workspace_invitations as invitations
    where invitations.workspace_id = p_workspace_id
      and invitations.invited_by = v_actor_id
      and invitations.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception using
      errcode = 'P0001',
      message = 'The workspace invitation rate limit has been reached';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.workspace_invitations (
    workspace_id,
    email_normalized,
    role,
    invited_by,
    token_hash,
    expires_at
  )
  values (
    p_workspace_id,
    v_email,
    p_role,
    v_actor_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires_at
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_workspace_invitation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;

create function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invitation public.workspace_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to accept a workspace invitation';
  end if;

  select lower(users.email)
  into v_user_email
  from auth.users as users
  where users.id = v_user_id;

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'The workspace invitation is invalid or unavailable';
  end if;

  select invitations.*
  into v_invitation
  from public.workspace_invitations as invitations
  where invitations.token_hash =
    encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found
     or v_invitation.status <> 'pending'
  then
    raise exception using
      errcode = '22023',
      message = 'The workspace invitation is invalid or unavailable';
  end if;

  if v_invitation.expires_at <= now() then
    update public.workspace_invitations
    set status = 'expired'
    where id = v_invitation.id
      and status = 'pending';
    return null;
  end if;

  if v_invitation.email_normalized <> coalesce(v_user_email, '') then
    raise exception using
      errcode = '42501',
      message = 'Sign in with the email address that received this invitation';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    invited_by
  )
  values (
    v_invitation.workspace_id,
    v_user_id,
    v_invitation.role,
    v_invitation.invited_by
  )
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
  set status = 'accepted',
      accepted_at = now()
  where id = v_invitation.id
    and status = 'pending';

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The workspace invitation is invalid or unavailable';
  end if;

  return v_invitation.workspace_id;
end;
$$;

revoke all on function public.accept_workspace_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

create function public.list_workspace_invitations(p_workspace_id uuid)
returns table (
  invitation_id uuid,
  email_normalized text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
begin
  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid();

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only workspace owners and admins can list invitations';
  end if;

  return query
  select
    invitations.id,
    invitations.email_normalized,
    invitations.role,
    case
      when invitations.status = 'pending'
       and invitations.expires_at <= now() then 'expired'
      else invitations.status
    end,
    invitations.expires_at,
    invitations.created_at
  from public.workspace_invitations as invitations
  where invitations.workspace_id = p_workspace_id
  order by invitations.created_at desc;
end;
$$;

revoke all on function public.list_workspace_invitations(uuid) from public, anon, authenticated;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;

create function public.revoke_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_workspace_id uuid;
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to revoke a workspace invitation';
  end if;

  select invitations.workspace_id
  into v_workspace_id
  from public.workspace_invitations as invitations
  where invitations.id = p_invitation_id
    and invitations.status = 'pending'
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The pending workspace invitation was not found';
  end if;

  select wm.role
  into v_actor_role
  from public.workspace_members as wm
  where wm.workspace_id = v_workspace_id
    and wm.user_id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only workspace owners and admins can revoke invitations';
  end if;

  update public.workspace_invitations
  set status = 'revoked'
  where id = p_invitation_id
    and status = 'pending';
end;
$$;

revoke all on function public.revoke_workspace_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
