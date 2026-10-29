# ReleaseProof implementation audit

**Scope:** Stage 0 of the multi-user platform implementation plan
**Audited:** 2026-10-29
**Backend target:** Supabase, subject to isolated database and RLS verification

## Executive summary

At the Stage 0 audit, ReleaseProof was a statically hosted, single-page React
application. It imported Playwright JSON and ZIP files in the browser,
normalized them into a typed report model, provided local checklist and
metadata editing, and generated a standalone HTML export. The current stage
status and later changes are recorded below.

The existing client-side report processing is a substantial reusable
foundation. It must remain available while account and workspace capabilities
are introduced. The current GitHub Pages deployment is suitable for the
existing public synthetic demo, but it cannot itself host authenticated data or
hold a Supabase secret key. Any multi-user deployment must use only a
publishable client key and rely on verified database and Storage policies.

Supabase is compatible with the existing React/TypeScript/Vite stack and
provides the required Auth, PostgreSQL RLS, private Storage, and Realtime
features. Stages 1–6 have since been implemented and verified against the
local Supabase stack. Hosted Supabase credentials, production auth
configuration and public workspace uploads remain unavailable.

No production database was accessed or changed.

## Existing architecture

| Area                   | Current implementation                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry point            | `src/main.tsx` mounts `src/app/App.tsx` with React Strict Mode.                                                                                                                                                                                                                                            |
| UI and routing         | React 19, TypeScript strict mode, Vite 7 and Tailwind's Vite plugin. `App.tsx` is a single page; there is no router. UI is implemented with local React components and `src/styles.css`.                                                                                                                   |
| State and persistence  | Component state and refs only. No localStorage, sessionStorage, IndexedDB, API client, or server persistence was found. Refresh clears report data.                                                                                                                                                        |
| JSON and ZIP import    | `ReportImporter.tsx` calls `createImportOperation`; `report-parser.worker.ts` processes files in a Web Worker through `import-file-processor.ts` and `zip-reader.ts`. Zod validates Playwright JSON; ZIP central-directory inspection checks archive structure, paths, entry count and decompressed sizes. |
| Import limits          | `file-validation.ts` currently allows 50 MiB compressed input, up to 5,000 ZIP entries, 200 MiB total uncompressed data and 50 MiB per entry. These are client-side MVP limits and differ from the proposed cloud-upload limits; a future server/storage boundary must enforce its own centralized limits. |
| Normalized model       | `src/domain/report.ts` defines normalized tests, attempts, attachments, metadata, checklist and deterministic evidence status. `playwright-normalizer.ts` maps supported Playwright JSON into this model.                                                                                                  |
| Checklist and metadata | `ChecklistEditor.tsx` and `MetadataEditor.tsx` edit report-local state via `ReportDashboard` and `ReportImporter`; there is no persistence or conflict handling.                                                                                                                                           |
| Export                 | `html-report-builder.ts` escapes imported text, produces standalone HTML with a restrictive CSP, and only embeds verified supported image data. `ExportPreview.tsx` provides preview, download and browser print.                                                                                          |
| Tests                  | Vitest unit tests, React Testing Library component tests, and Playwright E2E tests. Existing security-relevant tests cover malformed JSON, ZIP traversal and size limits, escaped HTML, and local-only import behavior. There are no database, RLS, Storage, auth, or multi-user integration tests.        |
| CI and deployment      | `.github/workflows/ci.yml` runs lint, formatting, typecheck, unit/component/E2E tests and production build. Passing pushes to `main` deploy the static site to GitHub Pages. No migration, secret-scanning, or backend test job exists.                                                                    |
| Configuration          | `vite.config.ts` supports a base path. There is no Supabase dependency, `.env.example`, Supabase configuration, or backend environment configuration.                                                                                                                                                      |

## Existing behavior to preserve

- Keep the local-only import and synthetic demo available; importing must not
  silently start uploading a file.
- Reuse the normalizer, report domain types, evidence rules, checklist UI,
  attachment rendering, and HTML exporter rather than introducing parallel
  report implementations.
- Keep report parsing in the worker and keep the import pipeline's existing
  malformed-input and ZIP protections.
- Preserve the current public synthetic demo and static export flow while
  adding authenticated routes as a separately gated experience.
- Do not move report contents into ordinary database text/JSON columns. Store
  file bytes in private object storage and metadata in PostgreSQL.

## Gap and risk assessment

### Critical before any multi-user data is enabled

1. **No server-side identity or authorization exists.** All current data is
   transient browser state. Every private query and mutation needs Auth plus
   database-enforced RLS; hiding UI controls is not authorization.
2. **No isolated backend environment or database test runner is available.**
   Actual allow/deny tests for `anon`, two authenticated users, workspace roles,
   direct writes, and Storage are a release gate.
3. **The privacy contract must change deliberately.** Current UI says reports
   are not uploaded. A cloud-storage flow must clearly distinguish local-only
   import from an explicit upload and obtain informed user action before
   transmission.
4. **No private storage boundary exists.** Do not add a public bucket or
   long-lived object URLs. Storage access must be tied to current workspace
   membership and role, including after membership revocation.

### Important design and operational risks

- Avoid recursive RLS policies between `workspaces` and
  `workspace_members`. Centralize role checks in narrowly scoped, reviewed
  database helpers or server operations, and test grants as well as policies.
- Workspace creation and owner assignment must be one transaction. Membership,
  invite acceptance, role changes and last-owner protection require atomic,
  backend-checked operations.
- Store only invitation token hashes. Do not expose raw tokens in logs, audit
  events, ordinary member listings, or production UI.
- File authorization must bind object paths to both workspace and report.
  Original filenames are metadata, not object keys. Signed URLs must be short
  lived and issued only after authorization.
- Existing local ZIP limits (5,000 entries/200 MiB expanded) do not match the
  proposed first cloud-upload limits (JSON 10 MiB, ZIP 25 MiB, 200 entries,
  100 MiB expanded and 5 MiB per image). Centralize separate local/cloud
  configuration and validate before upload and again at the trusted boundary.
- GitHub Pages deployment currently follows every successful push to `main`.
  It must never receive a service-role key. Production deployment of auth or
  data features must wait for isolated project configuration, redirect review,
  RLS/Storage tests and an explicit production release procedure.
- The requested €0–30/month ceiling is not an availability guarantee. Current
  Supabase pricing documentation lists a Free tier with project inactivity
  pausing and quota limits; check current terms before relying on it. Do not
  enable paid services without owner approval.
- CI has no secret scan, migration validation, database test, or security
  integration job. These must be added before claiming the multi-user release
  is hardened.

## Proposed data model and isolation

Create the initial schema with UUID keys, UTC timestamps, foreign keys,
constraints, indexes, explicit grants and RLS. Keep it additive and isolated
from the current client-only data model.

| Table                                    | Purpose and access boundary                                                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                               | Display name and optional avatar path keyed to `auth.users.id`; users may read/update only the permitted fields of their own profile. Never store passwords or authorization claims here.                                         |
| `workspaces`                             | Workspace name, description, creator and timestamps. A member can read only workspaces where a membership row exists. Creation is atomic with owner membership.                                                                   |
| `workspace_members`                      | `(workspace_id, user_id)` primary key and constrained role (`owner`, `admin`, `editor`, `viewer`). Users cannot insert themselves or directly update their own role. Membership mutations use narrowly scoped backend operations. |
| `workspace_invitations`                  | Normalized invited email, role, inviter, hashed token, status and expiry. Only authorized owners/admins can manage invitations; acceptance verifies signed-in email and atomically consumes a live token.                         |
| `reports`                                | Workspace-scoped title, environment/build metadata, processing status, source format/path, creator and optimistic version. Members may read; only editor-level roles may create/update; authorized roles may delete.              |
| `report_attachments`                     | Report/workspace binding, opaque storage path, original filename as metadata, detected type and size. Enforce report/workspace consistency with constraints or reviewed transactional logic.                                      |
| `qa_checklists` and `qa_checklist_items` | Workspace/report-scoped checklist and ordered items with constrained statuses and version/update metadata. Viewer reads; editor-level roles mutate.                                                                               |
| `audit_events`                           | Append-only workspace administrative events. No passwords, raw tokens, report content or stack traces. Ordinary users cannot update/delete history.                                                                               |

RLS must be enabled on every exposed private table. Grants and policies must
be reviewed together; no `anon` access to private data. Every row policy checks
the current authenticated identity and current workspace membership/role, not
client-supplied `user_id`, `role`, or `created_by`. A removed member must lose
subsequent database and Storage access. Test `SELECT`, `INSERT`, `UPDATE` and
`DELETE` with two users across separate workspaces and with each role.

## Private file design

- One private bucket for report source files and approved attachments; no public
  bucket and no service key in the browser.
- Opaque object path such as `<workspace UUID>/<report UUID>/<file UUID>`.
- Storage RLS checks the authenticated user, workspace membership, role,
  report/attachment metadata, and the path binding. Do not trust a path supplied
  by the client alone.
- Editors upload; authorized workspace members read; deletes follow report
  deletion policy. Revoke access immediately when membership is removed.
- Serve private objects only through short-lived signed URLs after an
  authorization check. Do not persist signed URLs.
- Validate declared size/type before upload and actual content/ZIP structure
  during trusted processing. Continue to treat all report strings and
  attachments as untrusted.
- Define retryable object deletion before enabling report/workspace deletion.

## Invitation design

Use a trusted server operation for creation, revocation and acceptance. Generate
high-entropy tokens with a cryptographically secure generator and store only a
hash. Normalize and bind the invitation email to the authenticated account.
Enforce expiry, status, role and membership uniqueness in one transaction.
Make repeated requests deterministic and rate-limited. If email delivery is
not configured, restrict any development-only invitation path to a local
environment and never expose its token in production.

## Integration plan by stage

The requested implementation is sequential. No stage may claim completion
until its own tests pass.

1. **Stage 0 — Audit (this document).** Confirm current architecture,
   compatibility, risks, schema boundaries, test strategy and owner actions.
2. **Stage 1 — Infrastructure/database.** Add Supabase project configuration,
   additive migrations, profiles/workspaces/members/roles, explicit grants and
   RLS, plus real pgTAP isolation tests. Do not apply to production.
3. **Stage 2 — Auth.** Add the official Supabase client, login/signup/verify/
   recovery flows and protected routing; preserve the synthetic local demo.
4. **Stage 3 — Workspaces/roles.** Add workspace dashboard, member management
   and role-specific operations backed by tested database authorization.
5. **Stage 4 — Invitations.** Add secure create/accept/revoke/expiry behavior,
   email delivery configuration and rate limiting.
6. **Stage 5 — Private uploads.** Add private bucket policies, server-enforced
   upload limits, safe parsing and report/attachment metadata.
7. **Stage 6 — Collaboration.** Persist reports/checklists, implement version
   conflict handling and authorized realtime refresh, and test multi-user
   behavior.
8. **Stage 7 — Hardening/demo.** Add the security test plan, secret scanning,
   CI database checks, retention/recovery/deployment docs and isolated
   synthetic demo configuration. Do not enable public use with confidential
   data before independent review.

## Files and configuration expected to change

- **Stage 1:** `supabase/config.toml`, timestamped SQL migrations,
  `supabase/tests/*.sql`, `.env.example`, `.gitignore`, package scripts and CI.
- **Stage 2:** `src/main.tsx`, `src/app/App.tsx`, new auth/session and route
  modules, Supabase client configuration, auth UI tests, `.env.example`.
- **Stages 3–6:** new workspace/report feature modules and components; reuse
  `src/domain/report.ts`, `src/features/import-report/`,
  `src/features/checklist/`, `src/features/evidence/`, and
  `src/features/export/`; add database integration and authenticated E2E
  tests.
- **Stage 7:** `SECURITY_TEST_PLAN.md`, `ARCHITECTURE.md`,
  `DATABASE_SCHEMA.md`, `SECURITY.md`, `DEPLOYMENT.md`,
  `BACKUP_AND_RECOVERY.md`, `DATA_RETENTION.md`, `CHANGELOG.md`,
  secret-scanning and database CI configuration, and updated privacy copy.

## Required tests

- **Stage 1/RLS:** unauthenticated denial; user A/B workspace isolation;
  direct role/member escalation denial; owner creation atomicity; role matrix
  for all CRUD operations; last-owner protection; membership revocation;
  forged workspace/report UUID denial. Test against an actual local/staging
  Supabase database, not mocks.
- **Storage:** private bucket default; cross-workspace read/write denial;
  role-specific upload/delete; object-path/report binding; revocation of
  existing membership; signed URL expiry and no public access.
- **Auth/invitations:** signup confirmation, login/logout, expiry/session
  clearing, password recovery, safe redirects, wrong-email/expired/revoked/
  replayed invitation denial, duplicate invitation behavior and rate limits.
- **Uploads:** invalid extension/signature, oversized JSON/ZIP/image, entry and
  decompression limits, malformed archives, traversal/absolute paths, nested
  archives, unsupported types and imported script/XSS payloads.
- **Collaboration:** two authenticated users see permitted changes, viewer
  cannot mutate, version conflicts do not silently overwrite, deletion and
  realtime events remain workspace-scoped.
- **Regression:** preserve existing unit/component/E2E import, checklist,
  keyboard, export, privacy and synthetic-demo suites.

## Owner/environment actions and current blockers

1. A local Supabase stack is running and Stages 1–3 have been tested. On
   Windows, ensure Docker Desktop's CLI directory is on `PATH`; this
   installation stores it under
   `%LOCALAPPDATA%\\Programs\\DockerDesktop\\resources\\bin`.
2. Create/configure a **non-production** Supabase project and choose its region,
   email-confirmation behavior, redirect URLs and authorized development
   origins. Do not send project secrets in chat.
3. Put only the publishable/anon client key and project URL into ignored local
   environment configuration. Keep service-role credentials server-side only;
   never add them to Vite variables or frontend code.
4. Confirm whether an email provider is already available. Do not enable paid
   delivery, paid compute or other paid services without approval.
5. Keep GitHub Pages and any current production data untouched until all
   staging tests, rollback steps and release checks pass.

## Supabase compatibility references

- [Postgres Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security):
  grants and RLS are separate controls; test actual CRUD allow/deny behavior
  with `supabase test db`.
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control):
  Storage operations are authorized through RLS on `storage.objects`; private
  access must not be bypassed with a service key in an untrusted client.
- [Supabase pricing](https://supabase.com/pricing): the Free tier has resource
  quotas and inactivity pausing; recheck current terms and costs before
  selecting staging/production topology.

## Stage 0 exit result

The integration path is technically compatible and preserves the existing
client report pipeline. Stages 0–3 are complete locally. Stage 1 includes a
local Supabase CLI configuration, additive profiles/workspaces/membership
migrations, explicit grants and RLS, atomic workspace creation, guarded
member-role operations, two-user pgTAP coverage, local schema linting and CI
gating before GitHub Pages deployment. Stage 2 authentication and Stage 3
workspace management have passed local browser and database tests; hosted
account configuration remains out of scope.

The local Supabase CLI is pinned in the development dependencies. The
migrations applied to the isolated local Supabase database; `supabase db lint
--local` reported no schema errors and all 74 pgTAP tests passed, including
two-user workspace isolation, grants, role restrictions, last-owner
protection, profile updates and membership revocation. Frontend lint, type
checks, unit/component/E2E tests and production builds also pass.

Docker Desktop was installed and running, but its user-scoped CLI directory
was missing from the VS Code terminal `PATH`. Adding that directory to the
current PowerShell session allowed the local stack and tests to run. No
hosted database or production credentials were accessed, and no production
migration was applied. Stages 4–7 remain.

## Stage 2 progress — Authentication

The optional browser Supabase client, PKCE session handling, hash-based
login/signup/recovery routes, email confirmation, password reset, logout and
protected account screen are implemented. The auth client rejects secret keys
and is only loaded when valid URL and publishable-key configuration is
present. Vite adds only the configured Supabase HTTP/WebSocket origins to the
existing CSP. Report parsing and export remain local; the public Pages build
does not receive Supabase configuration.

The local Supabase email-confirmation and password-recovery flow was exercised
in Chromium through Mailpit, including refusal to sign in before email
confirmation, session persistence across reload, password reset, subsequent
sign-in and protected-route denial after logout. Stage 2 has no hosted
deployment configuration. No secret/service key is written to `.env.local` or
included in the frontend.

## Stage 3 progress — Workspaces and roles

The authenticated workspace dashboard supports creating and listing
workspaces, switching between them, viewing members and roles, and managing
roles/removals according to the caller's role. Owners can manage workspace
members; admins can manage editors and viewers; other members can leave.
Database RPCs enforce these checks independently of the UI, serialize
membership changes per workspace, block self-role changes and prevent the
last owner from leaving or being removed. Owner transfer is not included.

The workspace management migration adds an RLS-checked member listing RPC,
guarded role changes and safe membership removal. Direct authenticated
membership updates/deletes remain denied. Local tests pass for owner/admin
permissions, non-member denial, role changes, member removal, last-owner
protection and immediate access revocation. The authenticated Playwright flow
creates workspaces, switches between them, checks owner visibility and
revalidates access after logout. No hosted database or production credentials
were accessed.

## Stage 4 progress — Invitations

Invitations use cryptographically random one-time tokens; only token hashes
are stored. Acceptance checks the signed-in email, expiration, revocation,
replay and membership constraints atomically. Local development invitation
links are available only for locally issued JWTs and are shown only on
localhost. Email delivery and production invitation links remain disabled.
The invitation browser test covers invitee confirmation and acceptance.

## Stage 5 progress — Private report uploads

The local Supabase stack has a private report bucket with Storage policies,
report-path binding and current-membership checks. An editor must explicitly
confirm upload; JSON is limited to 10 MiB and ZIP to 25 MiB. ZIP processing
uses separate workspace limits of 200 entries, 100 MiB expanded content,
50 MiB per archive entry and 5 MiB per image. Source bytes remain in Storage;
PostgreSQL stores metadata and checklist state. A registered report row is
required to read a source object, and an unregistered upload is not readable.

The browser worker validates files before upload and again when a report is
opened. There is no trusted server-side archive parser or malware scanner, so
the feature is not approved for confidential production files.

## Stage 6 progress — Shared reports and checklists

Workspace members can list, open and download private report files. Editors
can save release metadata and checklists; owners/admins can delete reports.
Every write increments a report version and stale writes fail with a conflict
instead of overwriting newer changes. Realtime report events cause a fresh
RLS-checked query; local unsaved edits are preserved when another member
updates the record. Individual test annotations are read-only in shared
reports because they are not yet persisted.

The authenticated Playwright flow uploads a synthetic fixture, edits and saves
metadata/checklist state, downloads and reloads the source, then verifies
versioned updates are visible to a second workspace member. pgTAP tests cover
role grants, cross-workspace isolation, viewer write denial, path-bound file
reads, orphan privacy, CRUD permissions and version conflicts.

## Stage 7 progress — Hardening and operations

CI now includes Gitleaks, application lint/type/unit/component/browser tests,
local Supabase schema lint, pgTAP authorization tests and authenticated browser
coverage. Security and operations documentation records deployment gates,
manual retention, cleanup, backup and recovery limitations.

Local validation currently passes: 52 unit tests, 20 component tests, 126
database assertions and the authenticated browser workflow; `npm run lint`,
`npm run format:check`, `npm run typecheck` and application-schema `db lint`
also pass. A full normal E2E run and final production build remain release
checks. The Supabase CLI has no access token, so no hosted migration or
production Supabase deployment has occurred. GitHub Pages deployment remains
separate from database migrations.
