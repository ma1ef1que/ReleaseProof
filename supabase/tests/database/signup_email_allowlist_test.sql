create extension if not exists pgtap with schema extensions;

begin;

select plan(8);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'private.check_signup_email_allowlist(jsonb)',
    'EXECUTE'
  ),
  'Supabase Auth can execute the signup hook'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.check_signup_email_allowlist(jsonb)',
    'EXECUTE'
  ),
  'anonymous API users cannot execute the signup hook'
);
select ok(
  has_schema_privilege('supabase_auth_admin', 'private', 'USAGE'),
  'Supabase Auth can access the private schema'
);
select ok(
  has_table_privilege(
    'supabase_auth_admin',
    'private.signup_email_allowlist',
    'SELECT'
  ),
  'Supabase Auth can read the allowlist'
);
select ok(
  not has_table_privilege('authenticated', 'private.signup_email_allowlist', 'SELECT'),
  'signed-in API users cannot read the signup allowlist'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'signup_email_allowlist'
      and policyname = 'Auth can check signup allowlist'
      and 'supabase_auth_admin' = any (roles)
  ),
  'RLS limits allowlist reads to Supabase Auth'
);

insert into private.signup_email_allowlist (email_normalized)
values ('approved-user@releaseproof.test');

select is(
  private.check_signup_email_allowlist(
    '{"user":{"email":"Approved-User@ReleaseProof.test"}}'::jsonb
  ),
  '{}'::jsonb,
  'the hook permits an exact allowlisted email, case-insensitively'
);
select is(
  private.check_signup_email_allowlist(
    '{"user":{"email":"other@releaseproof.test"}}'::jsonb
  ) #>> '{error,message}',
  'Registration is limited to approved email addresses.',
  'the hook denies all non-allowlisted emails'
);
select * from finish();
rollback;
