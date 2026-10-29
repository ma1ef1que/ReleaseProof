-- Exact-address allowlist for the Auth Before User Created hook.
-- An empty table rejects every new email account until operators add entries.
create table private.signup_email_allowlist (
  email_normalized text primary key,
  added_at timestamptz not null default now(),
  constraint signup_email_allowlist_email_format check (
    char_length(email_normalized) between 3 and 320
    and email_normalized = lower(btrim(email_normalized))
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

alter table private.signup_email_allowlist enable row level security;
revoke all on table private.signup_email_allowlist from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on table private.signup_email_allowlist to supabase_auth_admin;

create policy "Auth can check signup allowlist"
on private.signup_email_allowlist
for select
to supabase_auth_admin
using (true);

create function private.check_signup_email_allowlist(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event #>> '{user,email}'));
begin
  if v_email is not null and exists (
    select 1
    from private.signup_email_allowlist as allowed
    where allowed.email_normalized = v_email
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Registration is limited to approved email addresses.'
    )
  );
end;
$$;

revoke all on function private.check_signup_email_allowlist(jsonb)
  from public, anon, authenticated;
grant execute on function private.check_signup_email_allowlist(jsonb)
  to supabase_auth_admin;
