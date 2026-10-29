create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

select ok(
  not has_table_privilege('anon', 'public.workspace_invitations', 'SELECT'),
  'anon cannot read invitation records'
);
select ok(
  not has_table_privilege('authenticated', 'public.workspace_invitations', 'SELECT'),
  'authenticated cannot read invitation records directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_workspace_invitation(uuid,text,text)',
    'EXECUTE'
  ),
  'anon cannot create invitations'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.accept_workspace_invitation(text)',
    'EXECUTE'
  ),
  'anon cannot accept invitations'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.revoke_workspace_invitation(uuid)',
    'EXECUTE'
  ),
  'anon cannot revoke invitations'
);

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000001', 'owner@releaseproof.test'),
  ('40000000-0000-0000-0000-000000000002', 'invitee@releaseproof.test'),
  ('40000000-0000-0000-0000-000000000003', 'other@releaseproof.test'),
  ('40000000-0000-0000-0000-000000000004', 'admin@releaseproof.test'),
  ('40000000-0000-0000-0000-000000000005', 'editor@releaseproof.test'),
  ('40000000-0000-0000-0000-000000000006', 'expired@releaseproof.test');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.workspace_id',
  public.create_workspace('Invitation test workspace', null)::text,
  true
);

reset role;
insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    current_setting('test.workspace_id')::uuid,
    '40000000-0000-0000-0000-000000000004',
    'admin'
  ),
  (
    current_setting('test.workspace_id')::uuid,
    '40000000-0000-0000-0000-000000000005',
    'editor'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.invitation',
  (
    select jsonb_build_object(
      'id', invitation_id,
      'token', invitation_token
    )::text
    from public.create_workspace_invitation(
      current_setting('test.workspace_id')::uuid,
      ' Invitee@ReleaseProof.test ',
      'editor'
    )
  ),
  true
);

select ok(
  length(current_setting('test.invitation')::jsonb ->> 'token') = 64,
  'the invitation token contains 256 bits of random entropy'
);
reset role;
select ok(
  not exists (
    select 1
    from public.workspace_invitations
    where token_hash = current_setting('test.invitation')::jsonb ->> 'token'
  ),
  'the invitation table stores only a token hash'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select email_normalized
    from public.list_workspace_invitations(
      current_setting('test.workspace_id')::uuid
    )
    where invitation_id = (current_setting('test.invitation')::jsonb ->> 'id')::uuid
  ),
  'invitee@releaseproof.test',
  'the authorized owner can list a normalized invitation'
);
select throws_ok(
  $$select * from public.create_workspace_invitation(
    current_setting('test.workspace_id')::uuid,
    'invitee@releaseproof.test',
    'viewer'
  )$$,
  '23505',
  'A pending invitation already exists for this email address',
  'a duplicate pending invitation is rejected'
);
select throws_ok(
  $$select * from public.create_workspace_invitation(
    current_setting('test.workspace_id')::uuid,
    'other@releaseproof.test',
    'owner'
  )$$,
  '22023',
  'The requested invitation role is invalid',
  'an invitation cannot assign owner'
);
select throws_ok(
  $$select * from public.create_workspace_invitation(
    '99999999-9999-4999-8999-999999999999',
    'other@releaseproof.test',
    'viewer'
  )$$,
  '42501',
  'Workspace membership is required to invite members',
  'a non-member cannot create an invitation for a guessed workspace id'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.create_workspace_invitation(
    current_setting('test.workspace_id')::uuid,
    'owner-invite@releaseproof.test',
    'admin'
  )$$,
  '42501',
  'Admins cannot invite other admins',
  'an admin cannot invite another admin'
);
select set_config(
  'test.admin_invitation',
  (
    select jsonb_build_object(
      'id', invitation_id,
      'token', invitation_token
    )::text
    from public.create_workspace_invitation(
      current_setting('test.workspace_id')::uuid,
      'another-viewer@releaseproof.test',
      'viewer'
    )
  ),
  true
);
select lives_ok(
  $$select public.revoke_workspace_invitation(
    (current_setting('test.admin_invitation')::jsonb ->> 'id')::uuid
  )$$,
  'an admin can revoke a pending invitation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000005","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.list_workspace_invitations(
    current_setting('test.workspace_id')::uuid
  )$$,
  '42501',
  'Only workspace owners and admins can list invitations',
  'an editor cannot list invitation emails'
);
select throws_ok(
  $$select public.revoke_workspace_invitation(
    (current_setting('test.invitation')::jsonb ->> 'id')::uuid
  )$$,
  '42501',
  'Only workspace owners and admins can revoke invitations',
  'an editor cannot revoke an invitation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_workspace_invitation(
    current_setting('test.invitation')::jsonb ->> 'token'
  )$$,
  '42501',
  'Sign in with the email address that received this invitation',
  'a different email cannot accept the invitation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.accept_workspace_invitation(
    current_setting('test.invitation')::jsonb ->> 'token'
  ),
  current_setting('test.workspace_id')::uuid,
  'the invited account can accept the invitation'
);
select is(
  (
    select role
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_id')::uuid
      and user_id = auth.uid()
  ),
  'editor',
  'acceptance grants only the explicitly invited role'
);
reset role;
select is(
  (
    select status
    from public.workspace_invitations
    where id = (current_setting('test.invitation')::jsonb ->> 'id')::uuid
  ),
  'accepted',
  'acceptance atomically consumes the invitation'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_workspace_invitation(
    current_setting('test.invitation')::jsonb ->> 'token'
  )$$,
  '22023',
  'The workspace invitation is invalid or unavailable',
  'an accepted invitation cannot be replayed'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'test.expiring_invite',
  (
    select jsonb_build_object(
      'id', invitation_id,
      'token', invitation_token
    )::text
    from public.create_workspace_invitation(
      current_setting('test.workspace_id')::uuid,
      'expired@releaseproof.test',
      'viewer'
    )
  ),
  true
);
reset role;
update public.workspace_invitations
set expires_at = now() - interval '1 minute'
where id = (current_setting('test.expiring_invite')::jsonb ->> 'id')::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000006","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.accept_workspace_invitation(
    current_setting('test.expiring_invite')::jsonb ->> 'token'
  ),
  null::uuid,
  'an expired invitation is rejected'
);
reset role;
select is(
  (
    select status
    from public.workspace_invitations
    where id = (current_setting('test.expiring_invite')::jsonb ->> 'id')::uuid
  ),
  'expired',
  'the expired invitation receives an expired status'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000006","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.workspace_members
    where workspace_id = current_setting('test.workspace_id')::uuid
      and user_id = auth.uid()
  ),
  0,
  'an expired invitation creates no workspace membership'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000005","role":"authenticated","iss":"http://127.0.0.1:54321/auth/v1"}',
  true
);
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.accept_workspace_invitation(
    current_setting('test.admin_invitation')::jsonb ->> 'token'
  )$$,
  '22023',
  'The workspace invitation is invalid or unavailable',
  'a revoked invitation cannot be accepted'
);

select * from finish();
rollback;
