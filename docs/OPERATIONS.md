# Deployment, recovery and retention

## Environments

The public GitHub Pages site is a static, local-first demo. It does not receive
Supabase credentials. The local Supabase stack is for development and test
data only.

### Current production state (2026-10-29)

- The linked production Supabase project is healthy. Migrations are applied
  through `20261029210000_signup_email_allowlist`; invitation delivery is kept
  outside the active migration directory.
- The private exact-email allowlist contains the two addresses supplied by the
  owner. The Auth **Before User Created** hook is enabled and rejects other
  addresses.
- Auth Site URL and redirects point to
  `https://ma1ef1que.github.io/ReleaseProof/`.
- New signups are enabled with email confirmation. The built-in Auth sender is
  being used for a two-user test; it only sends to organization team members
  and is rate-limited.
- The Pages workflow now builds against this project's URL and publishable key;
  the public deployment is pending a successful push to `main`.

Local development commands:

```sh
npm run db:start
npm run db:configure
npm run test:db
npm run test:e2e:auth
```

`npm run db:reset` destroys and recreates the local database. Never point it at
a hosted project. The production database has received the signup allowlist
migration after the local database and authorization tests passed.

## Production deployment checklist

Before enabling new accounts and workspace features on GitHub Pages:

1. Provision an isolated staging project and confirm its region, billing,
   quotas, Auth email configuration and recovery options.
2. Authenticate the Supabase CLI through a secure environment, link the
   staging project explicitly, inspect `supabase migration list --linked`, and
   review the planned migration diff before applying it.
3. Apply and verify migrations on staging first. Run the authentication and
   role-specific report scenarios with separate owner, editor and viewer
   accounts.
4. Configure allowed production redirects and site URLs. Restrict them to the
   approved HTTPS domain; do not allow arbitrary origins.
5. For the current two-user test, the built-in Auth sender is enabled. For
   broader use, configure custom SMTP; the default sender only delivers to
   project organization members and has a low shared rate limit. Keep email
   confirmation enabled.
6. The Pages workflow passes the project URL and publishable key to the build.
   These are public browser values. Never add a service-role key or database
   password to frontend variables.
7. The production Auth Site URL is
   `https://ma1ef1que.github.io/ReleaseProof/`. Add
   `https://ma1ef1que.github.io/ReleaseProof/**` to Additional Redirect URLs;
   this covers the app's callback and password-reset hash routes under that
   repository path. These values are already configured on the linked project.
8. Signup is enabled in Supabase Auth. The installed hook restricts registration
   to the private allowlist. Test both approved addresses, a denied address,
   email confirmation and password recovery.
9. Publish privacy, retention and deletion terms. Confirm an operator can
   restore both PostgreSQL metadata and private Storage files.
10. Release through `main` only after CI, database checks, secret scanning and
    staging review pass. Verify the deployed Pages URL and smoke-test local
    imports as well as explicitly consented workspace uploads.

The signup allowlist lives in `private.signup_email_allowlist`. The linked
production project has the Auth hook enabled and contains the owner's approved
addresses. For a new environment, configure **Authentication → Hooks → Before
User Created** to call `private.check_signup_email_allowlist` before enabling
signups. Add approved exact addresses in the SQL Editor with:

```sql
insert into private.signup_email_allowlist (email_normalized)
values ('person@example.com')
on conflict (email_normalized) do nothing;
```

The migration starts with an empty list, which rejects all new registrations
once the hook is enabled. Adding an address enables registration for that
address only; removing it blocks future account creation but does not revoke an
existing account's workspace memberships or access. Remove workspace membership
separately when access must be revoked.

The Pages workflow deploys static files only; it does not deploy Supabase
migrations. Treat database migration and frontend release as separate
operations.

### Hosted invitation delivery

This feature is postponed. Its migration is stored outside the active
`supabase/migrations` directory, so the production migration push for the
signup allowlist will not enable hosted invitation creation. Keep
`VITE_ENABLE_WORKSPACE_INVITATIONS` unset or `false` until email delivery is
configured and the optional migration is reviewed and moved into the active
migration sequence.

The `send-workspace-invitation` Edge Function sends invitation email through
Resend. Deploy it after the database migration and configure these Supabase
Function secrets in the target project (never in Vite variables):

```sh
npx supabase functions deploy send-workspace-invitation
npx supabase secrets set --project-ref <project-ref> \
  RESEND_API_KEY=<resend-api-key> \
  INVITATION_FROM='ReleaseProof <no-reply@example.com>' \
  INVITATION_SITE_URL='https://example.com/' \
  INVITATION_ALLOWED_ORIGIN='https://example.com'
```

Use a verified sender domain with the email provider. Set the site URL to the
deployed application root, including any repository subpath, and allow only
that exact HTTPS origin. Configure the same URL in Supabase Auth's site URL and
redirect allowlist. The function validates the signed-in user and the database
checks invitation role, workspace membership, duplicate invitations and the
per-user rate limit. The raw token exists only in the function and delivered
email; Postgres stores its SHA-256 hash. If delivery fails, the function
revokes the pending invitation. Verify email delivery, expiry, wrong-email
rejection and revocation in staging before enabling production invitations.
Keep the GitHub Actions variable `VITE_ENABLE_WORKSPACE_INVITATIONS` unset or
set it to `false` while invitation delivery is postponed. Set it to `true`
only after deploying the function and verifying the email flow in staging.

## Retention and deletion

There is no automatic expiration or retention job. Uploaded sources, metadata
and checklist state remain in the configured Supabase project until a workspace
owner or admin deletes each report. Local imported reports remain in page
memory and disappear when the page is refreshed or closed.

Report deletion removes database metadata first and then removes the private
source through the Storage API. If Storage cleanup fails, the UI keeps a retry
action. The report row is already gone, so its source is no longer readable by
workspace members. Do not promise immediate physical erasure from provider
backups; document the configured provider backup and retention behavior before
production launch.

Workspace/project operators should periodically review Storage usage and
remove inaccessible orphan objects using an authorized administrative
procedure. No automated orphan sweep or per-workspace quota indicator exists.

## Backup and recovery

Before any hosted migration or project configuration change:

- Confirm that a current PostgreSQL backup exists and that restore access is
  available.
- Confirm how the selected Supabase plan backs up private Storage objects;
  database backups alone do not restore source files.
- For a migration, retain the previous application build and record the
  migration version. Prefer a forward corrective migration over manual edits.
- Test restoring the database and Storage objects together in staging.

For accidental report deletion or project incident, suspend affected accounts
or access first, preserve relevant audit/provider logs, and restore database
metadata and Storage files from compatible recovery points. Rotating a
publishable key does not replace rotating any exposed server credential.

The current local stack and public demo have no production data-recovery
guarantee or service-level objective.
