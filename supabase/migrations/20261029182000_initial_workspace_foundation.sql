create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null
    or (
      char_length(display_name) between 1 and 80
      and char_length(btrim(display_name)) > 0
    )
  ),
  constraint profiles_avatar_path_length check (
    avatar_path is null
    or char_length(avatar_path) between 1 and 512
  )
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_length check (
    char_length(name) between 1 and 100
    and char_length(btrim(name)) > 0
  ),
  constraint workspaces_description_length check (
    description is null or char_length(description) <= 1000
  )
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users (id) on delete set null,
  primary key (workspace_id, user_id),
  constraint workspace_members_role check (
    role in ('owner', 'admin', 'editor', 'viewer')
  )
);

create index workspace_members_user_id_idx
  on public.workspace_members (user_id);

create function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon, authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create function private.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any (p_allowed_roles)
  );
$$;

revoke all on function private.has_workspace_role(uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();

create trigger workspaces_touch_updated_at
before update on public.workspaces
for each row
execute function public.touch_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(
      pg_catalog.btrim(
        pg_catalog.left(
          coalesce(new.raw_user_meta_data ->> 'display_name', ''),
          80
        )
      ),
      ''
    )
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (id, display_name)
select
  users.id,
  nullif(
    pg_catalog.btrim(
      pg_catalog.left(
        coalesce(users.raw_user_meta_data ->> 'display_name', ''),
        80
      )
    ),
    ''
  )
from auth.users as users
on conflict (id) do nothing;

create function public.create_workspace(
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication is required to create a workspace';
  end if;

  if p_name is null
     or char_length(p_name) not between 1 and 100
     or char_length(btrim(p_name)) = 0
     or (p_description is not null and char_length(p_description) > 1000)
  then
    raise exception using
      errcode = '22023',
      message = 'Workspace name or description is invalid';
  end if;

  insert into public.workspaces (name, description, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public, anon, authenticated;
grant execute on function public.create_workspace(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.workspace_members from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_path) on table public.profiles to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Workspace members can read their workspaces"
on public.workspaces
for select
to authenticated
using (private.is_workspace_member(id));

create policy "Workspace members can read workspace membership"
on public.workspace_members
for select
to authenticated
using (private.is_workspace_member(workspace_id));
