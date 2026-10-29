# Deployment, recovery and retention

## Environments

The public GitHub Pages site is a static, local-first demo. It does not receive
Supabase credentials. The local Supabase stack is for development and test
data only:

```sh
npm run db:start
npm run db:configure
npm run test:db
npm run test:e2e:auth
```

`npm run db:reset` destroys and recreates the local database. Never point it at
a hosted project. The migration history in this repository has been applied
and tested locally; no hosted database migration is part of the current
release.

## Production deployment checklist

Production Supabase is not configured in this repository. Before enabling
workspace auth or uploads on GitHub Pages:

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
5. Add only the Supabase project URL and publishable key as GitHub Actions
   variables for the Pages build. Never add a service-role key or database
   password to Vite variables.
6. Publish privacy, retention and deletion terms. Confirm an operator can
   restore both PostgreSQL metadata and private Storage files.
7. Release through `main` only after CI, database checks, secret scanning and
   staging review pass. Verify the deployed Pages URL and smoke-test local
   imports as well as explicitly consented workspace uploads.

The Pages workflow deploys static files only; it does not deploy Supabase
migrations. Treat database migration and frontend release as separate
operations.

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
