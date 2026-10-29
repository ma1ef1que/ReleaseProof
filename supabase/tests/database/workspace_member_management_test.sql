create extension if not exists pgtap with schema extensions;

begin;

select plan(30);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_workspace_members(uuid)',
    'EXECUTE'
  ),
  'anon cannot list workspace members'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_workspace_members(uuid)',
    'EXECUTE'
  ),
  'authenticated can call the membership listing function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.change_workspace_member_role(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot change workspace roles'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.change_workspace_member_role(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated can call the guarded role-change function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.remove_workspace_member(uuid,uuid)',
    'EXECUTE'
  ),
  'anon cannot remove workspace members'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.remove_workspace_member(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated can call the guarded member-removal function'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_members', 'UPDATE'),
  'authenticated cannot change roles outside the guarded function'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_members', 'DELETE'),
  'authenticated cannot remove members outside the guarded function'
);

insert into auth.users (id)
values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000005');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.workspace_id',
  public.create_workspace('Management test workspace', null)::text,
  true
);

reset role;
insert into public.workspace_members (workspace_id, user_id, role)
select
  current_setting('test.workspace_id')::uuid,
  members.user_id,
  members.role
from (
  values
    ('20000000-0000-0000-0000-000000000002'::uuid, 'admin'::text),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'editor'::text),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'viewer'::text),
    ('20000000-0000-0000-0000-000000000005'::uuid, 'admin'::text)
) as members(user_id, role);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.get_workspace_members(current_setting('test.workspace_id')::uuid)),
  5,
  'a workspace member can list all workspace members'
);
select is(
  (
    select role
    from public.get_workspace_members(current_setting('test.workspace_id')::uuid)
    where user_id = '20000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'the member list includes each member role'
);
select lives_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000002',
    'editor'
  )$$,
  'an owner can change an admin to editor'
);
select is(
  (
    select role
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_id')::uuid
      and user_id = '20000000-0000-0000-0000-000000000002'
  ),
  'editor',
  'the owner role change is persisted'
);
select lives_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000002',
    'admin'
  )$$,
  'an owner can assign the admin role'
);
select lives_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000003',
    'viewer'
  )$$,
  'an owner can change an editor to viewer'
);
select lives_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000003',
    'editor'
  )$$,
  'an owner can restore an editor role'
);
select throws_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    auth.uid(),
    'viewer'
  )$$,
  '42501',
  'Members cannot change their own workspace role',
  'an owner cannot change their own role'
);
select lives_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000004'
  )$$,
  'an owner can remove a viewer'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_id')::uuid
      and user_id = '20000000-0000-0000-0000-000000000004'
  ),
  0,
  'the removed viewer no longer has membership'
);
select throws_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    auth.uid()
  )$$,
  '22023',
  'The last workspace owner cannot leave or be removed',
  'the last owner cannot leave the workspace'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000003',
    'viewer'
  )$$,
  'an admin can change an editor to viewer'
);
select throws_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000003',
    'admin'
  )$$,
  '42501',
  'Admins can manage editors and viewers but cannot assign admin roles',
  'an admin cannot promote a member to admin'
);
select throws_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000001',
    'viewer'
  )$$,
  '42501',
  'Admins can manage editors and viewers but cannot assign admin roles',
  'an admin cannot change the owner role'
);
select throws_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000005',
    'viewer'
  )$$,
  '42501',
  'Admins can manage editors and viewers but cannot assign admin roles',
  'an admin cannot change another admin role'
);
select throws_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'Admins cannot remove owners or other admins',
  'an admin cannot remove the owner'
);
select throws_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000005'
  )$$,
  '42501',
  'Admins cannot remove owners or other admins',
  'an admin cannot remove another admin'
);
select lives_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    auth.uid()
  )$$,
  'a non-owner can leave a workspace'
);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_id')::uuid
      and user_id = auth.uid()
  ),
  0,
  'a leaving member immediately loses membership'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.get_workspace_members(current_setting('test.workspace_id')::uuid)$$,
  '42501',
  'Workspace membership is required to list its members',
  'a non-member cannot list workspace members by UUID'
);
select throws_ok(
  $$select public.change_workspace_member_role(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000001',
    'viewer'
  )$$,
  '42501',
  'Only workspace owners and admins can change member roles',
  'a non-member cannot change a workspace role'
);
select throws_ok(
  $$select public.remove_workspace_member(
    current_setting('test.workspace_id')::uuid,
    '20000000-0000-0000-0000-000000000001'
  )$$,
  '42501',
  'Workspace membership is required to remove a member',
  'a non-member cannot remove a workspace member'
);

select * from finish();
rollback;
