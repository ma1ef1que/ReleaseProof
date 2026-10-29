# ReleaseProof

ReleaseProof is a local-first QA evidence report builder for Playwright test
results. Local imports are processed in the browser and are not uploaded.
Authenticated workspace members can explicitly upload report files to a
configured Supabase project after confirming consent.

The public GitHub Pages site remains a local-first synthetic demo. The
multi-user Supabase implementation has been exercised against the local stack;
it is not production-ready until a hosted Supabase project, email delivery,
redirects, privacy/retention terms and deployment review are configured.

## Requirements

- Node.js 22 or newer
- npm

## Getting started

```sh
npm ci
npm run dev
```

## Deployment

The GitHub Actions workflow runs the quality gates on pull requests and
deploys a production build to GitHub Pages after a successful push to `main`.
GitHub Pages is configured to use **GitHub Actions**. The Vite build uses the
repository subpath automatically.

## User testing

Use the synthetic demo and follow the first-time-user tasks in
[`docs/USER_TESTING.md`](./docs/USER_TESTING.md). Do not ask testers to upload
real reports or share sensitive evidence.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:components
npm run test:e2e
npm run test:e2e:auth
npm run test:db
npm run build
npm run fixtures:playwright
```

## Supabase database development

The database foundation is local-only; it does not connect to or migrate a
hosted project. Install Docker Desktop, then start the local Supabase stack and
run the PostgreSQL isolation tests:

```sh
npm run db:start
npm run db:configure
npm run test:db
npm run db:stop
```

`npm run db:reset` recreates the local database and reapplies migrations. Do
not use it against a hosted project. The client environment template is
`.env.example`. `npm run db:configure` copies only the local project URL and
publishable key into ignored `.env.local`; it never copies a secret/service
key.

The local Supabase migrations add private workspace report storage,
role-checked upload/update/delete operations and Realtime report refresh.
Workspace upload limits are 10 MiB for JSON and 25 MiB for ZIP; ZIPs are
restricted to 200 entries and 100 MiB expanded content, with 5 MiB per image.
Only upload a report after reviewing its contents and confirming the explicit
upload prompt. See [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) for deployment,
recovery and retention requirements.

Local email confirmation and password recovery links are captured by Mailpit
at `http://127.0.0.1:54324`. The authenticated browser flow can be exercised
with `npm run test:e2e:auth`. The static GitHub Pages build remains in local
report mode unless its build environment is explicitly configured with a
Supabase URL and publishable key.

On Windows, if Docker Desktop is running but PowerShell says `docker` is not
recognized, add Docker Desktop's CLI directory to the current terminal session
and verify the daemon before starting Supabase:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
docker info
npm run db:start
npm run db:configure
```

Restart VS Code after adding that directory permanently to your user `Path`.

## Current scope

The app accepts Playwright JSON reports and ZIP bundles with report
attachments. Local imports and edits stay in browser memory until a separate,
explicit workspace upload is confirmed. When Supabase configuration is
present, authenticated users can create and switch workspaces, manage member
roles and invitations, and share source files in private workspace storage.
Release metadata and checklists are versioned and saved for workspace members;
shared test-level annotations are read-only. Evidence status, standalone HTML
export, and print/save as PDF remain available locally. HTML exports are
limited to 15 MiB; screenshots can be omitted when they exceed that limit. The
built-in demo is synthetic and clearly labeled. See
`ReleaseProof_MVP_Product_and_Technical_Specification.md` for product
requirements and the milestone plan, and `docs/PLAYWRIGHT_IMPORT.md` for
supported report generation and import behavior. `DECISIONS.md` records
implementation decisions and deviations.
