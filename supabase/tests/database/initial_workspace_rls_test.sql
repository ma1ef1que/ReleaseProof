create extension if not exists pgtap with schema extensions;

begin;

select plan(44);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspaces'::regclass),
  'workspaces has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.workspace_members'::regclass),
  'workspace_members has row-level security enabled'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon has no profile SELECT grant'
);
select ok(
  not has_table_privilege('anon', 'public.workspaces', 'SELECT'),
  'anon has no workspace SELECT grant'
);
select ok(
  not has_table_privilege('anon', 'public.workspace_members', 'SELECT'),
  'anon has no membership SELECT grant'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated can query profiles subject to RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.workspaces', 'SELECT'),
  'authenticated can query workspaces subject to RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.workspace_members', 'SELECT'),
  'authenticated can query memberships subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated cannot create profiles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated cannot delete profiles directly'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated can update the allowed profile field'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'authenticated cannot change a profile identity'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspaces', 'INSERT'),
  'authenticated cannot create workspaces outside the atomic function'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspaces', 'UPDATE'),
  'authenticated cannot update workspaces directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspaces', 'DELETE'),
  'authenticated cannot delete workspaces directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_members', 'INSERT'),
  'authenticated cannot add members or assign roles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE'),
  'authenticated cannot change membership roles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_members', 'DELETE'),
  'authenticated cannot remove members directly'
);
select ok(
  not has_function_privilege('anon', 'public.create_workspace(text,text)', 'EXECUTE'),
  'anon cannot execute workspace creation'
);
select ok(
  has_function_privilege('authenticated', 'public.create_workspace(text,text)', 'EXECUTE'),
  'authenticated can execute the guarded workspace creation function'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.has_workspace_role(uuid,text[])',
    'EXECUTE'
  ),
  'anon cannot execute the workspace role helper'
);
select ok(
  has_function_privilege(
    'authenticated',
    'private.has_workspace_role(uuid,text[])',
    'EXECUTE'
  ),
  'authenticated can execute the restricted workspace role helper'
);

insert into auth.users (id)
values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.workspace_a',
  public.create_workspace('Workspace A', 'A private workspace')::text,
  true
);

select is(
  (select count(*)::integer from public.workspaces),
  1,
  'the creator can read the workspace created through the function'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_a')::uuid
      and user_id = auth.uid()
      and role = 'owner'
  ),
  1,
  'workspace creation atomically assigns the creator as owner'
);
select ok(
  private.has_workspace_role(
    current_setting('test.workspace_a')::uuid,
    array['owner']
  ),
  'the owner role helper recognizes the caller'
);
select ok(
  not private.has_workspace_role(
    current_setting('test.workspace_a')::uuid,
    array['viewer']
  ),
  'the owner role helper does not grant an unassigned role'
);
select is(
  (select count(*)::integer from public.profiles where id = auth.uid()),
  1,
  'a newly registered user can read their trigger-created profile'
);
update public.profiles
set display_name = 'Owner A'
where id = auth.uid();
select is(
  (select display_name from public.profiles where id = auth.uid()),
  'Owner A',
  'a user can update their own profile'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.workspace_b',
  public.create_workspace('Workspace B', null)::text,
  true
);

select is(
  (select count(*)::integer from public.workspaces),
  1,
  'user B can read their own workspace'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_b')::uuid
      and user_id = auth.uid()
      and role = 'owner'
  ),
  1,
  'user B receives owner membership for their workspace'
);
select is(
  (select count(*)::integer from public.profiles where id = auth.uid()),
  1,
  'user B can read their own profile'
);
select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'user B cannot read user A workspace by its known UUID'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'user B cannot read user A membership by workspace UUID'
);
select ok(
  not private.has_workspace_role(
    current_setting('test.workspace_a')::uuid,
    array['owner']
  ),
  'user B cannot satisfy the owner role check for user A workspace'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  0,
  'user B cannot read user A profile by its known UUID'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_b')::uuid
  ),
  0,
  'user A cannot read user B workspace by its known UUID'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_b')::uuid
  ),
  0,
  'user A cannot read user B membership by workspace UUID'
);
update public.profiles
set display_name = 'Unauthorized change'
where id = '10000000-0000-0000-0000-000000000002';
select is(
  (select display_name from public.profiles where id = auth.uid()),
  'Owner A',
  'user A cannot update user B profile by its known UUID'
);
select throws_ok(
  $$select public.create_workspace('   ', null)$$,
  '22023',
  'Workspace name or description is invalid',
  'workspace creation rejects blank names'
);
select throws_ok(
  $$select public.create_workspace(repeat('x', 101), null)$$,
  '22023',
  'Workspace name or description is invalid',
  'workspace creation rejects names over the configured limit'
);
select is(
  (select count(*)::integer from public.workspaces),
  1,
  'invalid workspace creation leaves no partial workspace'
);

reset role;
delete from public.workspace_members
where workspace_id = current_setting('test.workspace_a')::uuid
  and user_id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.workspaces
    where id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'removing membership immediately revokes workspace access'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_a')::uuid
  ),
  0,
  'removing membership immediately revokes membership-list access'
);

select * from finish();
rollback;
