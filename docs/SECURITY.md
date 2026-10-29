# Security notes and release gates

## Current boundary

The public GitHub Pages build remains local-first until its Supabase build
variables are set. The linked hosted project has the workspace schema and an
enabled exact-email Auth hook, but new signups remain disabled pending custom
SMTP configuration and hosted end-to-end review. Local RLS and Storage tests
do not replace staging validation or independent review for confidential data.

The browser uses only the Supabase publishable key. Never expose a database
password, service-role key, access token or other server credential through a
`VITE_*` variable or a static build. Keep credentials in the appropriate
GitHub/Supabase secret store and never commit `.env.local`.

## Workspace authorization

| Role   | Read reports/files | Upload and edit | Delete report |
| ------ | ------------------ | --------------- | ------------- |
| Owner  | Yes                | Yes             | Yes           |
| Admin  | Yes                | Yes             | Yes           |
| Editor | Yes                | Yes             | No            |
| Viewer | Yes                | No              | No            |

Database RPCs and RLS enforce these permissions independently of UI controls.
Private Storage reads require a matching `reports.source_storage_path` row and
current workspace membership. Upload paths bind the workspace and report UUID;
original filenames are metadata only. An unregistered upload is not readable,
and cleanup is restricted to the uploader or an authorized workspace
administrator. Removing report metadata revokes further Storage reads before
the source object cleanup finishes.

Report metadata and checklist writes use an expected version. A stale write
returns a conflict instead of overwriting another member's changes. Realtime
notifications trigger a fresh, RLS-checked query; local unsaved edits are
preserved when another member changes the report.

## File handling

Local imports are parsed in a Web Worker and stay in the browser. Workspace
uploads require an explicit confirmation, are parsed before upload, and use
stricter client-side limits: JSON 10 MiB; ZIP 25 MiB, 200 entries and 100 MiB
expanded data; 50 MiB per archive entry; 5 MiB per image. The database and
Storage bucket enforce the upload byte, path, format and role boundaries.

The uploaded source is untrusted data. No server-side malware scanning or
trusted archive re-processing is configured. A client that bypasses the UI
could upload malformed content, but it remains private to authorized workspace
members and is validated again in the browser when loaded. Do not upload
credentials, personal data or evidence without authorization.

Annotations attached to individual tests remain read-only in shared reports;
only report metadata and manual checklist state are collaborative and
versioned.

## Required checks

Run these checks before merging or releasing:

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:components
npm run test:e2e
npm run test:e2e:auth
npm run test:db
npx supabase db lint --local --schema public,private --fail-on error
npm run build
```

The CI workflow runs Gitleaks, application tests, local Supabase schema lint,
pgTAP authorization tests and the authenticated browser workflow. Review
findings rather than adding broad secret-scanner exclusions.

## Production release gates

- Review every migration and authorization test against an isolated staging
  project before applying it to production.
- Configure and verify the Auth email provider, redirect allowlist, recovery
  URLs, domain and abuse protections.
- Set only the hosted URL and publishable key as frontend build variables.
- Run the storage/report authorization tests against staging and verify
  cross-workspace denial, membership revocation, conflict handling and file
  cleanup before public use.
- Publish a privacy policy and retention/deletion terms; obtain independent
  security review for confidential customer data.
