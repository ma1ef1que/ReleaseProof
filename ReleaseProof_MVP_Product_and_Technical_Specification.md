# Project specification: ReleaseProof (working title)

**Document type:** Product Requirements Document (PRD) + Software Requirements Specification (SRS) + Technical Design + delivery plan  
**Version:** 1.0  
**Date:** 29 October 2026  
**Status:** Proposed specification for an AI coding agent  
**Owner:** Solo founder / product owner  
**Working product name:** ReleaseProof — provisional only; do not use as a final commercial brand until name, domain and trademark checks are complete.

---

# 0. Instructions to the coding agent

You are the senior full-stack engineer implementing this project for a solo founder with QA experience, using AI-assisted development. Build a small, polished, maintainable product rather than a large speculative platform.

## Non-negotiable constraints

1. **Pre-revenue operating budget:** target €0/month; hard ceiling €30/month. Do not introduce paid services, paid APIs, paid databases, paid email, paid analytics or paid AI APIs as mandatory dependencies.
2. **No cloud backend in MVP.** The MVP must work as a static web application and process imported files locally in the user's browser. Test reports, screenshots, traces and source paths must not be uploaded to a server.
3. **No login in MVP.** Do not implement authentication, teams, cloud storage, billing or a database in the first release.
4. **No generative AI dependency.** The MVP's analysis must be deterministic. An optional future AI feature may be considered only after customer validation and with explicit opt-in.
5. **No external integrations in MVP.** No Jira, GitHub API, GitLab, Slack, CI/CD API, browser extension, telemetry SDK or payment provider.
6. **Security and privacy by default.** Treat uploaded archives and report contents as untrusted input. Do not execute uploaded code or HTML. Do not render arbitrary uploaded HTML as a trusted page.
7. **Incremental implementation.** Work in small, verifiable milestones. Run lint, type checks, tests and production build after each milestone. Do not claim a feature is done unless it works and has tests.
8. **Do not overbuild.** Do not add features that are not explicitly required below. Keep a `DECISIONS.md` file for any necessary deviations.
9. **Do not use employer code, data, test accounts, confidential workflows or internal documents.** Use synthetic/demo data only.
10. **The first release is a local-first QA evidence report builder**, not a release approval system and not an alternative to a full test-management platform.

## Required first response from the agent

Before writing code, return:
- a short summary of the product,
- the proposed repository/file structure,
- implementation milestones,
- assumptions or blockers,
- a list of acceptance tests for Milestone 1.

Then implement Milestone 1 only. Wait for the founder to review the working result before proceeding to the next milestone. If working in autonomous mode, still preserve the milestone boundaries and stop at each checkpoint.

---

# 1. Executive summary

## 1.1 Product vision

Help QA engineers and small software teams turn raw Playwright test results into a clear, shareable, professional test-run evidence report with minimal manual formatting.

The user imports a Playwright JSON report and, optionally, a ZIP package containing the report and its referenced attachments. The application parses the data locally and presents:
- a summary of passed, failed, skipped and other test outcomes,
- a list of failed tests with readable error details,
- available screenshots and supported image attachments,
- filters and search,
- release/run metadata entered by the user,
- a manually completed QA checklist,
- a calculated, explainable evidence status,
- exportable HTML and print-to-PDF report.

## 1.2 Problem hypothesis

QA engineers often need to turn automated test output into something that another person can understand quickly: a developer, QA lead, release manager, client or stakeholder. Existing reports can be detailed but may not be shaped for a concise release discussion; manually copying results and screenshots into a document is repetitive.

This is a **hypothesis to validate**, not an established market fact. The product must be tested with real QA users before substantial development or paid infrastructure is introduced.

## 1.3 Initial target users

Primary:
- manual QA engineers who also run or maintain some Playwright tests,
- QA engineers working in small teams without a formal test reporting process,
- freelancers or small agencies that need to share test evidence with clients.

Secondary:
- developers who need to summarize test runs,
- QA leads who prepare release reports,
- small software teams that need a consistent evidence document.

Not an initial target:
- regulated enterprise customers requiring audit certification, SSO, strict SLAs or formal compliance guarantees,
- teams needing full test case management, test planning or test execution orchestration,
- organizations expecting a hosted, always-on multi-tenant service from day one.

## 1.4 Product positioning

Proposed positioning statement:

> Turn a Playwright test run into a clear QA evidence report in minutes — without copying results into spreadsheets or uploading test data to another service.

The product should not claim that it proves a release is safe, guarantees quality, or replaces human release approval. It reports available evidence and identifies missing information.

## 1.5 Success definition for the MVP

The MVP is successful technically when a new user can:
1. open the public demo URL,
2. import a supported Playwright report,
3. understand the run summary and inspect failures,
4. add run metadata and complete a manual checklist,
5. export a readable report,
6. refresh or close the page without accidentally uploading their data anywhere.

The MVP is successful commercially only when real target users repeatedly use it and at least some demonstrate willingness to pay. Downloads, compliments and page views alone do not prove willingness to pay.

---

# 2. Product principles

1. **Evidence, not invented certainty.** Show source results and make all derived values explainable.
2. **Local-first privacy.** Parse files in the browser. No report content is sent to a server.
3. **No AI requirement.** Use deterministic parsing and rules.
4. **Fast first value.** A user should see a useful summary shortly after importing a supported report.
5. **Useful without integrations.** Import files first; add integrations only when customers ask for them and the business case is clear.
6. **Honest status.** Do not label a release “safe” or “approved” based on a test count alone.
7. **Export portability.** Users own their data and can export reports without a proprietary cloud account.
8. **Low operational cost.** Prefer static hosting and browser-side processing.
9. **Maintainable for one developer.** Use common tools, typed boundaries and a small number of dependencies.
10. **Progressive commercialisation.** Validate demand before implementing authentication, cloud storage, billing or expensive infrastructure.

---

# 3. Scope and release plan

## 3.1 MVP — P0, required for first public demo

### Core
- responsive single-page web application,
- landing / empty state with clear instructions,
- import Playwright JSON report,
- import a ZIP bundle containing a JSON report and related attachments,
- parse report data into a stable internal domain model,
- display run summary,
- display test list with status, title, project/browser if present, duration and retry information if present,
- search and filter tests,
- failure details view with error message, stack trace text and attachment previews where supported,
- optional user-entered release name, environment, build/version, commit identifier, run date and notes,
- manual QA checklist with editable items,
- deterministic evidence summary with explicit explanation,
- export standalone HTML report,
- print-friendly report with browser Print / Save as PDF,
- demo data mode so visitors can explore without uploading their own report,
- privacy and limitations page,
- local error handling for malformed or unsupported files,
- basic unit tests, component tests and end-to-end tests,
- static deployment and CI checks.

### Privacy and safety
- all parsing occurs client-side,
- no backend endpoints,
- no telemetry or analytics SDK,
- no automatic network calls with user report data,
- validate file type, size and ZIP contents,
- never execute imported scripts or uploaded HTML,
- do not persist imported report data by default,
- clear current report from memory when the user selects “Clear report” or reloads the app,
- clearly disclose that screenshots may contain personal data or secrets and should be reviewed before sharing.

## 3.2 Explicitly out of scope for MVP

- user accounts,
- cloud report storage,
- shared report links,
- organisation/team workspaces,
- subscriptions or payment collection,
- Jira/GitHub/GitLab/Slack integration,
- running tests from the product,
- reading repositories,
- generating/fixing test code,
- generative AI analysis,
- automatic release approval,
- test case authoring or test management,
- custom domains for customer workspaces,
- native desktop application,
- browser extension,
- mobile-native app,
- video playback and trace viewer,
- import of arbitrary HTML reports by executing their embedded code,
- claiming compliance certification or audit readiness.

## 3.3 Later roadmap

**P1 — Validate recurring use**
- compare two imported runs locally,
- mark flaky tests and annotate failures,
- custom checklist templates,
- report branding options,
- improved attachment matching and additional Playwright formats,
- optional locally saved recent reports, opt-in only,
- shareable export package with assets.

**P2 — First paid product**
- optional hosted accounts,
- hosted report storage and links only after user validation,
- account-level quotas and deletion controls,
- team workspace,
- subscription and entitlement system,
- checkout and customer portal,
- private report links with expiry and revocation,
- retention settings and storage usage indicator.

**P3 — Integrations**
- GitHub Actions artifact ingestion or a small upload CLI,
- GitHub App only if users request it and read-only permissions are sufficient,
- CI build metadata,
- Jira integration only after a clear customer need,
- team collaboration and comments.

**P4 — Advanced analytics**
- compare runs across branches/builds,
- test failure grouping,
- flaky test trends,
- failure history and ownership,
- optional AI-generated failure summaries with explicit consent, cost controls and clear provenance.

**P5 — Enterprise, only if justified**
- SSO, roles, audit logs, data residency choices, contractual retention, backups, security reviews and SLAs. These are not compatible with a €0–30/month solo pre-revenue budget at meaningful scale; do not promise them prematurely.

---

# 4. User journeys

## 4.1 First-time visitor
1. Opens the landing page.
2. Sees a concise statement of the value proposition and privacy promise.
3. Chooses “Try demo report” or “Import my report”.
4. Demo mode loads synthetic data only.
5. Import mode displays supported formats and size limits before the file picker.
6. User imports a file.
7. App validates it and shows parsing progress.
8. On success, app navigates to the report dashboard.
9. On failure, app shows a specific actionable error, not a raw stack trace.

## 4.2 Import JSON
1. User selects a `.json` file produced by the Playwright JSON reporter.
2. App checks extension and size, then parses JSON safely.
3. App validates the required structure.
4. App normalizes statuses and test hierarchy.
5. App shows summary and explains that attachment files may not be included in a JSON-only export.
6. User can manually add screenshots to a failed test if automatic attachment paths are unavailable.
7. User adds release metadata and checklist answers.
8. User exports HTML or prints to PDF.

## 4.3 Import ZIP bundle
1. User selects a `.zip` bundle.
2. App checks archive size and entry count.
3. App inspects file paths and rejects path traversal, suspicious names, unsupported types and excessive decompressed size.
4. App finds a supported JSON report according to deterministic rules.
5. App reads the JSON and resolves referenced attachment paths only within the archive.
6. App previews supported image attachments as images; text attachments are rendered as escaped text.
7. User reviews the report and exports it.

## 4.4 Review failures
1. User opens “Failed”.
2. User searches a test title or error text.
3. User selects a failed test.
4. Details panel shows full title, file/location if available, duration, retries, error message, stack trace and supported attachments.
5. If an attachment is missing, app displays “Attachment not included in imported bundle”; do not silently omit it.
6. User can add an annotation for the report, without changing the source test result.

## 4.5 Export
1. User selects “Export HTML report”.
2. App generates a standalone HTML file containing normalized report data and selected embedded image assets, subject to size limits.
3. Exported HTML must not include executable imported HTML or scripts from uploaded files.
4. Alternatively, user selects “Print / Save as PDF”.
5. Print view includes the run summary, test outcomes, failed tests, checklist and notes.
6. App warns if images or attachments are too large to embed and explains what was omitted.

---

# 5. Detailed functional requirements

Priority codes: **P0** must ship in MVP; **P1** after MVP validation; **P2** paid SaaS phase.

## 5.1 Landing and navigation

- **FR-001 (P0):** Display product name as a configurable working brand. Keep brand text in one central configuration file.
- **FR-002 (P0):** Explain supported input: Playwright JSON report or ZIP bundle containing JSON plus referenced files.
- **FR-003 (P0):** Provide “Try demo report” and “Import report” actions.
- **FR-004 (P0):** Explain that processing is local in the browser and data is not uploaded.
- **FR-005 (P0):** Include a limitations/privacy page or modal.
- **FR-006 (P0):** Provide a clear “Start over / Clear report” action after import.
- **FR-007 (P0):** Ensure keyboard navigation, visible focus indicators, semantic headings and accessible labels.

## 5.2 File import and validation

- **FR-010 (P0):** Support `.json` and `.zip` files.
- **FR-011 (P0):** Default maximum compressed file size: 50 MB; make the limit configurable.
- **FR-012 (P0):** For ZIP, default maximum entries: 5,000; maximum total uncompressed size: 200 MB; maximum single file size: 50 MB. These are guardrails, not guarantees against every resource-exhaustion attack.
- **FR-013 (P0):** Reject files with unsupported extensions and show supported types.
- **FR-014 (P0):** Validate JSON before normalizing it.
- **FR-015 (P0):** Do not assume every valid JSON file is a Playwright report.
- **FR-016 (P0):** Reject or report malformed reports with a helpful message.
- **FR-017 (P0):** ZIP path handling must reject absolute paths, `..` traversal segments, null bytes and paths that escape the archive namespace.
- **FR-018 (P0):** Do not execute any imported file.
- **FR-019 (P0):** Ignore unsupported attachments safely and list them as unsupported, instead of attempting to render them.
- **FR-020 (P0):** Display import progress for larger files and allow cancellation where technically feasible.
- **FR-021 (P0):** Handle browser memory pressure with size limits and a user-readable error.
- **FR-022 (P0):** All parsing must be done in a Web Worker where practical, so a large file does not freeze the interface.
- **FR-023 (P0):** Never upload the source file or its contents.
- **FR-024 (P0):** Use file signatures/content checks where practical; do not trust file extension alone.

## 5.3 Playwright report normalization

Official Playwright reporters include JSON and HTML reporters. JSON reporter output includes test-run information; attachments can reference separate files. The implementation must treat the precise report shape as version-sensitive and validate actual fixtures against supported Playwright versions. References:
- https://playwright.dev/docs/test-reporters
- https://playwright.dev/docs/api/class-testresult
- https://playwright.dev/docs/api/class-testinfo

- **FR-030 (P0):** Support Playwright Test JSON reporter format.
- **FR-031 (P0):** Normalize the raw JSON into an internal typed domain model; UI components must not read raw JSON directly.
- **FR-032 (P0):** Preserve test suite hierarchy where available.
- **FR-033 (P0):** Support statuses: passed, failed, skipped, timedOut, interrupted, flaky/expected-to-fail where source information permits. Map unknown statuses to `unknown` and display a warning.
- **FR-034 (P0):** Do not count retries as separate logical tests in the primary unique-test count. Show attempts separately.
- **FR-035 (P0):** Distinguish test outcome from run outcome.
- **FR-036 (P0):** Show test title, full title path, file/location if present, project/browser if present, duration, retry count, annotations, errors and attachments where present.
- **FR-037 (P0):** If report structure differs from supported fixtures, show “This Playwright report version or format is not supported yet” rather than inventing results.
- **FR-038 (P0):** Add fixture reports generated from a real sample project using the pinned Playwright version.
- **FR-039 (P0):** Document how to create a JSON report with `npx playwright test --reporter=json` or reporter configuration.
- **FR-040 (P0):** Add a small helper script/documented recipe that bundles JSON plus referenced attachments into a ZIP while preserving relative paths. Do not require the end user to install this helper to test JSON-only import.
- **FR-041 (P1):** Support merged Playwright blob reports if demand validates the additional complexity.
- **FR-042 (P1):** Add compatibility tests for at least two supported Playwright report versions before claiming broad version support.

## 5.4 Dashboard

- **FR-050 (P0):** Show total logical tests, passed, failed, skipped, flaky if detectable, and unknown/unmapped.
- **FR-051 (P0):** Show run duration if available.
- **FR-052 (P0):** Show imported report filename and import timestamp.
- **FR-053 (P0):** Show user-defined run title, environment, version/build, commit SHA and notes.
- **FR-054 (P0):** Display a clear warning if the report is incomplete, interrupted or has unknown statuses.
- **FR-055 (P0):** Never infer that a release is safe solely because all tests passed.
- **FR-056 (P0):** Show a “Test results” list with search and filters.
- **FR-057 (P0):** Provide empty states for no failures, no screenshots and no matching search results.
- **FR-058 (P0):** Ensure layout remains usable on 1280px desktop and narrow mobile widths.

## 5.5 Test list and failure details

- **FR-060 (P0):** Filter by status.
- **FR-061 (P0):** Search by title, file path, error message and project name.
- **FR-062 (P0):** Sort by status, title and duration.
- **FR-063 (P0):** Show a failure details view/panel.
- **FR-064 (P0):** Render error text and stack traces as plain text, not HTML.
- **FR-065 (P0):** Limit extremely long stack traces in the collapsed view but allow expansion.
- **FR-066 (P0):** Preview only supported image formats (PNG, JPEG, WebP); validate MIME and size.
- **FR-067 (P0):** Do not render SVG as an active document; either reject it or sanitize it with a proven sanitizer. Prefer rejecting SVG in MVP.
- **FR-068 (P0):** Text attachments must be escaped and rendered as text.
- **FR-069 (P0):** Display missing-attachment warnings.
- **FR-070 (P0):** Allow a user to add a short annotation to a test for the exported report without altering the source status.
- **FR-071 (P1):** Allow explicit comparison of two runs.
- **FR-072 (P1):** Allow marking known failures as accepted risks, with author-provided reason, clearly separated from test status.

## 5.6 Manual QA checklist

- **FR-080 (P0):** Provide a default editable checklist with examples:
  - Critical user flows checked
  - Known blockers reviewed
  - Failed tests triaged
  - Environment/build verified
  - Relevant manual checks completed
- **FR-081 (P0):** Each item has `pass`, `fail`, `not_checked`, or `not_applicable`.
- **FR-082 (P0):** A checklist item can have a note.
- **FR-083 (P0):** User can add, edit and delete checklist items for the current report.
- **FR-084 (P0):** Checklist data is local to the current browser session unless the user exports the report.
- **FR-085 (P0):** The app must not automatically mark items as passed.
- **FR-086 (P0):** The checklist is an aid, not a certification or compliance statement.

## 5.7 Evidence status

Avoid opaque “quality scores”. MVP must use a transparent status model.

- **FR-090 (P0):** Display one of:
  - `Evidence incomplete`
  - `Review required`
  - `No known blockers in imported evidence`
- **FR-091 (P0):** `Evidence incomplete` applies if import is partial, run is interrupted, unknown statuses exist, required report data is missing, or a configured mandatory checklist item is not checked.
- **FR-092 (P0):** `Review required` applies if one or more tests failed, a checklist item failed, or user-added notes indicate a blocker.
- **FR-093 (P0):** `No known blockers in imported evidence` may be displayed only if all mapped tests passed or were explicitly skipped, no failed/unknown statuses exist, the run is not interrupted, and required checklist items are completed. Always show a disclaimer that this is based only on imported evidence and does not guarantee release safety.
- **FR-094 (P0):** Each status must include “Why am I seeing this?” with a list of exact rules triggered.
- **FR-095 (P0):** Do not compute a numeric readiness score in MVP.
- **FR-096 (P1):** Allow teams to configure evidence rules after demand validation.

## 5.8 Export

- **FR-100 (P0):** Export a standalone HTML report.
- **FR-101 (P0):** Exported HTML must open locally in a current browser without needing a server.
- **FR-102 (P0):** Include title, generated date, run metadata, summary counts, test list, failures, checklist, evidence status, limitations and available supported screenshots.
- **FR-103 (P0):** Include source filename and parser/version metadata.
- **FR-104 (P0):** Escape all imported strings in HTML output.
- **FR-105 (P0):** Never embed arbitrary uploaded HTML/JavaScript.
- **FR-106 (P0):** Do not include credentials or environment variables. Warn that test titles, errors, URLs and screenshots may still contain sensitive information.
- **FR-107 (P0):** If output exceeds a configurable size limit, offer a smaller export without images or show a clear message.
- **FR-108 (P0):** Provide print CSS for A4, sensible page breaks and repeated table headers where supported.
- **FR-109 (P0):** Provide a “Print / Save as PDF” action using the browser's print dialog. Do not require a server-side PDF service.
- **FR-110 (P0):** Show an export preview before download.
- **FR-111 (P1):** Export a ZIP package with HTML and separate assets for large reports.

## 5.9 Local persistence and privacy

- **FR-120 (P0):** Do not persist raw report content by default.
- **FR-121 (P0):** Current report state may exist in memory while the page is open.
- **FR-122 (P0):** “Clear report” removes current in-memory data and object URLs.
- **FR-123 (P0):** Revoke generated object URLs when no longer needed.
- **FR-124 (P0):** Do not put report data into URL parameters, browser history, analytics, logs or crash reports.
- **FR-125 (P0):** No analytics in MVP.
- **FR-126 (P1):** If local history is later added, make it opt-in, show stored size, provide delete-all and per-report delete, and document browser storage limitations.
- **FR-127 (P2):** Cloud storage, if introduced, requires explicit consent, access controls, retention policy, delete/export controls and a published privacy policy before launch.

---

# 6. UX and visual design specification

## 6.1 Visual direction

Professional, calm, technical B2B. Avoid generic “AI startup” visuals, excessive gradients, animated backgrounds and decorative charts that do not answer a question.

Design goals:
- easy to scan during a release discussion,
- clear distinction between source facts and user notes,
- restrained use of color,
- accessible contrast,
- consistent spacing and typography,
- responsive layout.

Use a neutral light theme first. Dark theme is not required for MVP.

## 6.2 Main screens

### Screen A: Landing / import
- top bar: logo/working name, “How it works”, “Privacy”
- headline: “Turn Playwright results into a clear QA evidence report”
- supporting sentence: “Import locally. Review failures. Add manual checks. Export a shareable report.”
- primary CTA: “Import report”
- secondary CTA: “Try demo report”
- supported file types and maximum size
- privacy note: “Your report is processed in this browser; it is not uploaded.”
- “How to export from Playwright” instructions in a collapsible panel.

### Screen B: Importing
- file name and size
- progress state if available
- cancel action if feasible
- accessible status messages
- clear failure messages.

### Screen C: Report dashboard
Header:
- report title,
- editable release/build/environment metadata,
- import filename,
- export button,
- clear/start over button.

Summary area:
- logical test count,
- passed,
- failed,
- skipped,
- flaky/unknown when present,
- duration.

Evidence status:
- text label,
- exact rule explanations,
- no numeric score.

Main content:
- left/primary: searchable test list with status filters,
- right/details: selected test information and attachments on wide screens,
- stacked layout on small screens.

Bottom/secondary sections:
- manual QA checklist,
- release notes,
- limitations and source report information.

### Screen D: Test detail
- full test title and suite path,
- status and attempt/retry summary,
- duration,
- project/browser,
- error message and stack trace,
- image attachment gallery,
- attachment warnings,
- user annotation.

### Screen E: Export preview
- preview of exported report,
- options: include screenshots (default on when within limits), include passed tests (default on but can be toggled), include stack traces (default on for failed tests),
- export HTML,
- print/save PDF,
- warning if content may contain secrets or personal data.

## 6.3 Accessibility
- Target WCAG 2.2 AA practices where feasible.
- All controls keyboard-accessible.
- Do not communicate status by color alone.
- Use semantic landmarks and correct heading hierarchy.
- Accessible dialog focus management.
- Reduced-motion preference respected if motion is added.
- Visible focus ring.
- Inputs have labels and helpful error text.
- Test core flows with keyboard-only navigation.

---

# 7. Technical architecture

## 7.1 Architecture choice

**MVP is a static client-side web application.** No server-side API, database, account system or cloud file storage.

This is the safest way to honor the €0/month target and avoid processing private test artifacts on infrastructure that the founder does not yet need.

### Runtime flow

`User selects file → browser validates file → Web Worker parses JSON/ZIP → normalizer maps source to internal model → UI displays report → export builder generates HTML blob → browser downloads file`

The imported file must never leave the user's device.

## 7.2 Concrete stack

Use current stable, mutually compatible versions at project creation; pin versions in the lockfile. Do not blindly upgrade dependencies during feature development.

- **Language:** TypeScript, strict mode.
- **App framework:** React + Vite (static SPA).
- **Build:** Vite.
- **Routing:** no router initially; use a simple state-based screen flow. Add React Router only if multiple real routes become necessary.
- **Styling:** Tailwind CSS.
- **UI primitives:** shadcn/ui with Radix-based accessible components where appropriate. Keep the dependency surface small.
- **Icons:** Lucide React.
- **Schema validation:** Zod for parsed JSON and internal boundary validation.
- **ZIP handling:** JSZip, with explicit compressed/uncompressed size and path checks.
- **State:** React state and a small reducer for current report flow. Do not add Redux.
- **Tables:** start with native semantic table/list components. Add TanStack Table only if filtering/sorting needs justify it.
- **Charts:** no chart library in MVP.
- **Dates:** native `Intl.DateTimeFormat`; no date library unless needed.
- **Unit testing:** Vitest.
- **React component tests:** React Testing Library + user-event.
- **Browser E2E:** Playwright Test, in a separate test setup from the product's imported-report parser.
- **Linting:** ESLint with TypeScript rules.
- **Formatting:** Prettier.
- **Git hooks:** optional; CI is mandatory.
- **CI:** GitHub Actions.
- **Hosting:** Cloudflare Pages static hosting or another static host whose terms permit the intended use. Do not use a hosting plan that prohibits commercial use of the app.
- **Domain:** not required for first demo. Use provider subdomain until customer validation. Buy a domain only after a name check and evidence of demand.
- **Backend/database/storage:** none in MVP.
- **Payments:** none in MVP.
- **Analytics:** none in MVP.
- **AI API:** none in MVP.

Official references:
- Playwright reporters: https://playwright.dev/docs/test-reporters
- Supabase pricing (future option only; free tier has limitations and pauses after inactivity): https://supabase.com/pricing
- Cloudflare Workers/R2 pricing (future storage option only): https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare static hosting plans: https://www.cloudflare.com/plans/
- Stripe Estonia pricing (future billing option only): https://stripe.com/en-ee/pricing

Do not interpret the existence of a free tier as an uptime guarantee. Verify current provider terms before commercial launch.

## 7.3 Suggested repository structure

```text
releaseproof/
  public/
    demo/
      demo-report.json
      demo-attachments/
    favicon.svg
  src/
    app/
      App.tsx
      app-config.ts
      routes-or-screen-state.ts
    components/
      layout/
      import/
      dashboard/
      tests/
      checklist/
      export/
      ui/
    features/
      import-report/
        import-controller.ts
        file-validation.ts
        zip-reader.ts
        report-worker.ts
        report-worker-client.ts
      playwright/
        playwright-json-schema.ts
        playwright-normalizer.ts
        playwright-status-mapping.ts
      evidence/
        evidence-rules.ts
        evidence-status.ts
      export/
        html-export.ts
        print-view.ts
        export-sanitization.ts
    domain/
      report.ts
      test-case.ts
      attachment.ts
      checklist.ts
      evidence.ts
    workers/
      report-parser.worker.ts
    lib/
      safe-text.ts
      file-size.ts
      ids.ts
      errors.ts
      formatters.ts
    pages/
      LandingPage.tsx
      ReportPage.tsx
      PrivacyPage.tsx
    styles/
      index.css
      print.css
    test-fixtures/
      playwright-json/
        passed.json
        failed.json
        retries.json
        attachments.json
        malformed.json
        unknown-status.json
    test/
      unit/
      components/
      e2e/
  scripts/
    create-demo-bundle.ts
  docs/
    PRODUCT_SPEC.md
    ARCHITECTURE.md
    PRIVACY.md
    PLAYWRIGHT_IMPORT.md
    RELEASE_CHECKLIST.md
  .github/
    workflows/
      ci.yml
  .env.example
  .gitignore
  README.md
  DECISIONS.md
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
```

The agent may adjust this structure slightly if it improves clarity, but must keep parsing, normalization, domain rules, UI and export generation separated.

## 7.4 Internal domain model

Create typed internal types similar to the following. This is illustrative; implement complete types and validation.

```ts
type TestStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut"
  | "interrupted"
  | "flaky"
  | "expectedToFail"
  | "unknown";

type EvidenceStatus =
  | "evidence_incomplete"
  | "review_required"
  | "no_known_blockers";

interface ReportMetadata {
  id: string;
  sourceFormat: "playwright-json";
  sourceFileName: string;
  importedAt: string;
  parserVersion: string;
  playwrightVersion?: string;
  runTitle: string;
  environment?: string;
  buildVersion?: string;
  commitSha?: string;
  runDate?: string;
  notes?: string;
  runDurationMs?: number;
  runOutcome?: string;
  isPartial: boolean;
  warnings: string[];
}

interface TestAttachment {
  id: string;
  name: string;
  contentType: string;
  kind: "image" | "text" | "unsupported";
  sourcePath?: string;
  objectUrl?: string; // ephemeral only; never export directly
  sizeBytes?: number;
  missing: boolean;
}

interface TestAttempt {
  attemptIndex: number;
  status: TestStatus;
  durationMs?: number;
  errorMessages: string[];
  stackTraceText?: string;
  attachments: TestAttachment[];
}

interface NormalizedTest {
  id: string;
  title: string;
  fullTitle: string;
  suitePath: string[];
  filePath?: string;
  line?: number;
  column?: number;
  projectName?: string;
  status: TestStatus;
  durationMs?: number;
  retryCount: number;
  attempts: TestAttempt[];
  annotations: Array<{ type: string; description?: string }>;
  attachments: TestAttachment[];
  userAnnotation?: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_checked" | "not_applicable";
  note?: string;
  required: boolean;
}

interface NormalizedReport {
  metadata: ReportMetadata;
  tests: NormalizedTest[];
  checklist: ChecklistItem[];
  aggregate: {
    totalLogicalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    interrupted: number;
    flaky: number;
    unknown: number;
    totalAttempts: number;
  };
  evidence: {
    status: EvidenceStatus;
    reasons: string[];
  };
}
```

Do not persist `File`, `Blob`, object URLs or browser objects inside exported JSON. Keep binary references in an import-session asset map and revoke object URLs on clear/unmount.

## 7.5 Parsing and normalization rules

- Validate input size before parsing.
- Parse JSON in a Web Worker where feasible.
- Use Zod at the boundary. Avoid an enormous schema that rejects benign optional fields from newer reporter versions; validate the required shape and tolerate known optional fields.
- Preserve source values where possible and map them into a stable internal model.
- Unknown source statuses become `unknown`, with a visible warning.
- No guessed values. Missing duration remains missing, not zero.
- Use a stable deterministic ID generated from source path + title hierarchy + project + retry index; do not rely on array index alone when comparing runs.
- Separate logical test count from attempt count.
- For retry results, derive the displayed final outcome according to a documented rule and retain every attempt. Do not hide earlier failures. If the exact semantics cannot be safely determined, mark the test as flaky/unknown and explain why.
- Treat `expected` and `unexpected` fields in the Playwright JSON schema carefully; write fixture tests based on actual JSON produced by the pinned Playwright version.
- A JSON report may reference attachments that are not inside the JSON. Do not claim those attachments were imported unless they exist in the ZIP or were manually attached.
- For ZIP, resolve attachment paths only within the archive. Normalize slashes and reject traversal.
- Do not automatically open the imported report's own `index.html`.
- Do not run imported JavaScript, HTML or shell scripts.
- Supported image previews: PNG, JPEG, WebP. Reject SVG in MVP unless a well-reviewed sanitizer is implemented and tested.
- Text attachments are escaped and rendered as text.
- All parsing errors return a typed user-facing error category and a safe message.

## 7.6 Evidence rules

Implement evidence rules as pure functions, independent of React.

Suggested precedence:
1. If parsing is incomplete, the run is interrupted, unknown status count > 0, required source fields are missing, or a required checklist item is `not_checked`, result is `evidence_incomplete`.
2. Else if any test failed/timed out/interrupted, any checklist item is `fail`, or an explicit blocker annotation exists, result is `review_required`.
3. Else if all mapped tests passed or were explicitly skipped, and all required checklist items are pass/not_applicable, result is `no_known_blockers`.
4. If there are zero tests, result is `evidence_incomplete`.
5. Every branch must return a list of reasons.
6. `no_known_blockers` must always be accompanied by the disclaimer: “This summary reflects only the evidence imported into this report. It is not a guarantee of release safety or a release approval.”

Do not add a numeric score in MVP.

## 7.7 Export architecture

- Generate HTML from the normalized domain model using safe, escaped templates or React server-independent rendering with careful escaping.
- Never concatenate untrusted HTML into output.
- Embed supported image data only after checking type, size and total export size.
- Default maximum total embedded assets: 15 MB. If over the limit, allow export without images or export an asset ZIP in a later version.
- Use a static, bundled stylesheet.
- Exported report must contain a generated timestamp and parser version.
- Print styles: A4, avoid breaking test detail blocks where possible, repeat table headers if supported, hide controls, include page footer if feasible.
- HTML export must not load third-party fonts, analytics or external resources.
- Do not export local `blob:` URLs; convert approved image data to safe data URLs or omit them with a warning.
- Include a privacy reminder before export: screenshots, URLs, stack traces and test names may contain secrets or personal data.

---

# 8. Non-functional requirements

## 8.1 Performance
- For a typical report with up to 2,000 logical tests and 10 MB of attachments, the UI should remain responsive on a modern laptop.
- Import feedback should appear immediately.
- Parsing should not block the main UI thread for extended periods; use a worker.
- Use virtualization only if tests show it is needed; avoid premature complexity.
- Avoid loading all high-resolution screenshots into the DOM at once.

## 8.2 Reliability
- Invalid files must not crash the app.
- Every major action has loading, success and error states.
- Empty and edge states are designed, not accidental.
- Browser refresh clears unsaved report data in MVP, and the UI discloses this.
- The app must not silently omit failures or unknown statuses.
- No fake data should be mixed with the user's imported report. Demo mode must be visibly labelled.

## 8.3 Security
- No server means no report upload endpoint in MVP.
- Uploaded files are untrusted.
- Protect against ZIP path traversal, oversized decompression, malicious MIME types and HTML/script injection.
- Escape all strings rendered in UI and export.
- Do not use `dangerouslySetInnerHTML` with imported content.
- Use a restrictive Content Security Policy where supported by the static host and build setup.
- Use dependency scanning/audit in CI when available.
- Keep dependencies minimal and updated deliberately.
- No secrets in the client bundle or repository.
- Do not include `.env` files containing credentials in Git.
- Do not claim that client-side processing makes all data safe: users must still inspect reports before sharing.

## 8.4 Privacy
- Privacy statement must accurately say report data is processed locally in the browser and not transmitted by the application.
- The hosting provider may still receive ordinary web request metadata such as IP address and user-agent; do not claim that no network traffic of any kind exists.
- No analytics, error tracking or external fonts in MVP.
- The user can clear current report data.
- No report contents in URL, browser logs or telemetry.
- Future cloud version requires separate privacy design and consent.

## 8.5 Accessibility and browser support
- Support latest stable Chrome, Edge, Firefox and Safari desktop where feasible.
- Do not promise older browser support.
- Responsive down to 360px viewport width.
- Keyboard-only support for import, filters, checklist, detail panel and export.
- Use accessible contrast and semantic HTML.

## 8.6 Maintainability
- TypeScript strict mode.
- No `any` without an explicit, justified boundary and comment.
- Pure functions for parser normalization, counts, evidence status and export formatting.
- Tests for edge cases.
- Components should not directly parse raw Playwright JSON.
- No monolithic `App.tsx`; split features by responsibility.
- Document non-obvious decisions in `DECISIONS.md`.

---

# 9. Testing and quality gates

## 9.1 Unit tests — required
- JSON shape validation: valid, malformed, empty, unsupported.
- status mapping including unknown statuses.
- logical-test aggregation vs retries.
- duration and count aggregation.
- evidence status precedence.
- missing attachment handling.
- ZIP path traversal rejection.
- file size / entry count limits.
- HTML escaping for `<script>`, quotes, ampersands and special characters.
- export size limit.
- stable ID generation.
- imported strings containing HTML-like payloads render as text.

## 9.2 Component tests — required
- import empty state,
- loading and parse error states,
- dashboard summary counts,
- status filters,
- search,
- test details,
- checklist editing,
- evidence reason display,
- export options,
- clear report action,
- privacy note visibility.

## 9.3 E2E tests — required
1. Open app.
2. Load demo report.
3. Verify summary counts.
4. Filter failed tests.
5. Open a failed test and verify error details.
6. Add a checklist note.
7. Export HTML and verify the download is generated.
8. Clear report and verify dashboard is removed.
9. Import malformed JSON and verify safe error.
10. Import a ZIP with a valid JSON and screenshot.
11. Attempt ZIP traversal / oversized archive fixture and verify rejection.
12. Verify no request sends report contents to a server (inspect network requests during E2E where practical).

## 9.4 CI gates
Every pull request must pass:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:components`
- `npm run build`
- E2E tests on a supported runner if feasible.

The agent must fix failures instead of skipping tests or weakening assertions to make CI green. Do not use `test.skip` as a substitute for implementing a required feature.

---

# 10. Suggested package scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:components": "vitest run --config vitest.components.config.ts",
    "test:e2e": "playwright test"
  }
}
```

Adapt scripts to the final tooling setup, but keep equivalent commands.

---

# 11. MVP milestones and definition of done

Estimated time is indicative for one developer working 15+ hours/week with AI assistance. The actual timeline may be longer because debugging imported report formats and edge cases is uncertain.

## Milestone 0 — Repository and foundations (1–3 days)
Deliver:
- app scaffold,
- TypeScript strict mode,
- lint/format/test scripts,
- CI workflow,
- README and `DECISIONS.md`,
- basic app shell.

Done when:
- clean install works,
- development server starts,
- lint/typecheck/tests/build pass locally and in CI.

## Milestone 1 — Domain model and fixtures (2–4 days)
Deliver:
- normalized model,
- sample Playwright JSON fixtures,
- Zod boundary validation,
- status mapping and aggregation,
- evidence rule pure functions.

Done when:
- unit tests cover valid and malformed inputs, retries, unknown statuses, missing values and zero-test reports.

## Milestone 2 — Import pipeline (3–6 days)
Deliver:
- JSON import,
- ZIP import,
- file limits and validation,
- Web Worker parser,
- attachment resolution,
- safe errors and progress state.

Done when:
- valid JSON and ZIP work;
- malformed and oversized inputs fail safely;
- no imported file is sent over the network;
- ZIP traversal fixtures are rejected.

## Milestone 3 — Dashboard and details (4–7 days)
Deliver:
- summary cards,
- test list, search and filters,
- details panel,
- error/stack display,
- image preview,
- missing-attachment notices.

Done when:
- all P0 dashboard and detail requirements pass component and E2E tests.

## Milestone 4 — Checklist and evidence status (2–4 days)
Deliver:
- editable checklist,
- metadata editor,
- evidence status and exact explanations,
- disclaimers.

Done when:
- all evidence rules have tests and no unsupported “release safe” claim exists.

## Milestone 5 — Export and print (3–6 days)
Deliver:
- export preview,
- standalone HTML export,
- print CSS,
- print/save PDF flow,
- attachment embedding and export size handling.

Done when:
- exported HTML opens offline and safely displays expected content;
- XSS fixtures render as plain text;
- print output is readable.

## Milestone 6 — Polish and launch demo (3–5 days)
Deliver:
- landing page,
- demo data,
- privacy/limitations page,
- responsive and keyboard checks,
- production build and deployment,
- user test instructions.

Done when:
- a person unfamiliar with the project can open the public demo and complete the main flow without assistance;
- the project has no known P0 defects;
- all CI gates pass.

**Indicative total:** about 3–6 weeks of focused part-time development for a disciplined MVP. This is an estimate, not a promise.

---

# 12. Product validation plan

Do not treat successful implementation as proof that the product should become a business.

## 12.1 Before building beyond a prototype
Interview 10–15 target users:
- QA engineers using Playwright,
- QA leads in small teams,
- consultants/freelancers who share test evidence.

Ask:
1. How do you currently share test-run results?
2. Who consumes the report?
3. What is tedious or confusing?
4. How often does the problem occur?
5. What do you currently use?
6. Have you paid for a tool to solve this problem?
7. What would need to be true for you to adopt another tool?
8. Would you try a prototype using synthetic or non-sensitive data?
9. Would you pay for it? If yes, what feature would justify the payment?

Avoid leading questions like “Wouldn't this be useful?” Do not ask people to upload confidential company reports.

## 12.2 Validation thresholds
Use these as practical decision gates, not universal laws:
- At least 5 people can describe the problem from recent experience.
- At least 3 users agree to test a prototype.
- At least 2 users return to use it again within two weeks.
- At least 1 prospective customer shows credible willingness to pay (paid pilot, purchase intent with a defined budget, or another concrete commitment).

If interest is weak, interview more users and narrow the use case before building cloud storage or integrations.

## 12.3 Competitive research
Before choosing a final niche, compare:
- Playwright's built-in HTML report,
- test management/reporting tools,
- bug-reporting and screenshot tools,
- CI artifact/report viewers,
- any existing release-readiness products.

Do not claim “no competitors”. A competitor can be a manual workflow, a free built-in feature or a spreadsheet.

**Important naming note:** a product at `releaseproof.de` already presents a Jira-based release-readiness product. The name ReleaseProof is therefore a working title only and has a likely confusion risk. Do not buy a domain, publish a paid listing or invest in branding until you have completed a proper name/trademark check and differentiated the product.

---

# 13. Subscription and monetisation plan

**Do not implement subscriptions in MVP.** Define the offer and test willingness to pay first. Subscription billing adds tax, refunds, cancellations, failed payments, customer support and legal obligations; it should not distract from validating the core product.

## 13.1 Product packaging hypothesis

These prices are hypotheses for customer interviews and pricing tests, not validated market prices.

### Free — €0
Purpose: acquisition and proof of value.
- local report import,
- summary and failure details,
- basic checklist,
- HTML/print export,
- no account required,
- data stays on the user's device.

Keep the free product useful. Do not introduce an artificial cloud dependency just to force an upgrade.

### Pro — test €8–12/month or €79–99/year
Potential paid value, only if validated:
- compare runs,
- reusable checklist templates,
- custom report branding,
- richer export options,
- local report history or optional encrypted sync,
- advanced failure grouping.

Important: if all functionality remains fully local and easy to copy, a subscription may be difficult to justify. Consider a one-time licence for a local desktop/CLI edition, or reserve recurring subscription pricing for genuinely recurring hosted/team value.

### Team — test €25–49/month per workspace
Only after cloud/team demand is confirmed:
- shared projects and reports,
- access-controlled share links,
- multiple users,
- shared templates,
- retention controls,
- team-level usage and billing.

Define whether price is per workspace, per seat or by usage before implementing. Do not combine all three in the first billing version.

### Business / Enterprise — later, quote-based
Only if customers request and fund it:
- SSO,
- granular roles,
- audit history,
- contractual retention and support,
- advanced integrations,
- security documentation.

Do not publish enterprise commitments until the service can meet them.

## 13.2 Pricing principles
- Charge for recurring value, not arbitrary limits.
- Keep plan differences understandable.
- Make cancellation and export straightforward.
- Never charge for merely accessing a user's own data export.
- Avoid a free trial that requires a credit card at the beginning.
- Test willingness to pay with actual conversations and pilots.
- Do not add metered AI costs to a low-price plan without a cost cap.

## 13.3 Future billing implementation
When validated:
- Stripe Billing is one possible option; verify current Estonian availability, fees and tax setup before implementation.
- Keep billing state server-verified; never trust client-side “isPro” flags.
- Model subscriptions and entitlements in the backend.
- Verify webhook signatures.
- Make webhook processing idempotent.
- Handle active, trialing, past_due, canceled, unpaid and incomplete states.
- Implement a customer portal or documented cancellation flow.
- Do not store card details.
- Add tests for renewal, failed payment, cancellation and downgrade.
- Ensure downgrading does not silently delete customer data; give a clear export/retention path.

---

# 14. Cost plan

## 14.1 MVP and demo
Expected mandatory infrastructure spend: **€0/month** if:
- hosted as a static site on a suitable free tier,
- no backend/database,
- no paid APIs,
- no custom domain,
- no paid analytics,
- no paid transactional email.

Potential optional spend:
- domain: typically a yearly fee depending on domain zone,
- AI coding tools: depends on subscriptions already available to the founder,
- paid user testing or design: optional, not required.

## 14.2 First hosted SaaS
A future hosted version may use free tiers, but do not assume they are permanent or production-grade. For example, Supabase currently documents a free plan with limits and project pausing after inactivity; Cloudflare R2 currently documents a free storage allowance and no egress fees. Verify current pricing/terms before committing:
- https://supabase.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/

A realistic early architecture might remain within €0–30/month at low usage, but email, domain, database uptime, backups, storage and monitoring can change the total. Do not migrate to cloud before user demand justifies the extra operational and privacy burden.

## 14.3 Cost-control requirements for future services
- set budget alerts and usage alerts,
- disable unnecessary paid services,
- use quotas and maximum upload sizes,
- set retention policies,
- avoid unlimited file retention,
- avoid large videos/traces by default,
- never allow a customer action to trigger uncontrolled AI/API costs,
- document what happens when quota is reached,
- do not silently incur overage charges where provider controls allow limits.

---

# 15. Future cloud architecture (not MVP)

Do not implement this until validated.

Potential stack:
- **Frontend:** keep React + TypeScript; migrate to Next.js only if server rendering, server routes or account features genuinely require it. Avoid a framework rewrite solely for fashion.
- **Backend:** a small typed API, or Supabase for auth/Postgres/storage if it fits validated needs and budget.
- **Database:** PostgreSQL.
- **Object storage:** Cloudflare R2 or equivalent; never store binary screenshots in database rows.
- **Auth:** managed authentication provider with email verification and secure session handling.
- **Payments:** Stripe Billing or another supported merchant/payment provider.
- **Email:** only when account recovery/invitations require it; choose a provider with a suitable free tier and verify its terms.
- **Observability:** minimal error monitoring that does not collect report contents or sensitive data.
- **CI:** GitHub Actions.

## 15.1 Multi-tenant data model, if cloud phase begins
Potential entities:
- `users`
- `workspaces`
- `workspace_members`
- `projects`
- `reports`
- `report_tests`
- `report_attachments`
- `checklist_templates`
- `checklist_items`
- `subscriptions`
- `entitlements`
- `audit_events`

Each tenant-owned row must include a workspace/tenant identifier. Every query and object-storage key must enforce tenant boundaries. Add authorization tests before storing real customer reports.

## 15.2 Cloud security requirements
- private buckets by default,
- short-lived signed URLs for attachments,
- strict file-size/type checks on server as well as client,
- malware scanning strategy if accepting arbitrary files,
- tenant isolation tests,
- access control on every report route,
- account deletion and export,
- retention and deletion jobs,
- encrypted transport and provider-managed encryption at rest,
- backup/restore testing,
- rate limiting,
- abuse controls,
- incident response plan,
- privacy policy and terms,
- no claims of certifications unless obtained.

---

# 16. Launch checklist

Before sharing the first public demo:
- [ ] Confirm app has no backend upload endpoint.
- [ ] Inspect browser network activity while importing a report.
- [ ] Test malformed JSON and malicious ZIP fixtures.
- [ ] Confirm imported HTML and scripts are never executed.
- [ ] Confirm no secrets are committed.
- [ ] Run lint, typecheck, unit tests, component tests, E2E tests and production build.
- [ ] Check keyboard navigation and narrow-screen layout.
- [ ] Verify demo report is synthetic and contains no employer data.
- [ ] Add a privacy/limitations page.
- [ ] Add clear supported format instructions.
- [ ] Confirm exported HTML opens offline.
- [ ] Confirm print/PDF output is readable.
- [ ] Review all product copy for exaggerated claims.
- [ ] Confirm hosting provider terms allow the intended commercial path.
- [ ] Keep a known-issues list.
- [ ] Ask 3–5 QA users to try the workflow and observe without coaching them.

Before first paid release:
- [ ] Validate product name and domain.
- [ ] Validate willingness to pay.
- [ ] Choose legal/business setup and review tax/VAT obligations in Estonia/EU.
- [ ] Publish terms, privacy policy and cancellation/refund policy as applicable.
- [ ] Implement billing server-side and test webhook flows.
- [ ] Define data retention, deletion and backups.
- [ ] Document support expectations.
- [ ] Verify costs remain within budget.
- [ ] Do not use customer production data until security controls are appropriate.

---

# 17. Product analytics and metrics

No analytics SDK in MVP. Use interviews and direct observation first.

Once there is a legitimate need for metrics, collect only minimal, non-sensitive events with consent and a privacy review. Never collect test titles, error messages, stack traces, URLs, screenshots or report contents.

Useful product metrics:
- import success rate,
- time from page open to first useful report,
- export completion rate,
- repeat use within 7/14 days,
- number of users who return without prompting,
- conversion from active user to paid pilot,
- churn and cancellation reasons once paid.

Avoid vanity metrics such as raw page views as the primary success measure.

---

# 18. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Built-in Playwright HTML report is sufficient | Low demand | Validate specific missing workflow before expanding |
| Report formats change | Import failures | Pin fixtures, validate schema, version parser and show honest errors |
| Attachments are missing from JSON | Incomplete evidence | ZIP bundle support, manual attachment path, visible missing-file warnings |
| Imported file is malicious or oversized | Crash/security issue | Client-side size limits, worker, ZIP path checks, no execution, safe rendering |
| Product name conflict | Brand confusion/legal risk | Keep working name, research alternatives before public commercial use |
| Free infrastructure pauses or changes terms | Demo downtime | Static hosting, no database in MVP, verify provider terms |
| Too many features | Delayed launch | P0-only MVP, milestone gates, defer integrations |
| Users like it but will not pay | No business | Ask for paid pilots early; do not build cloud SaaS without evidence |
| Customer data may contain secrets | Privacy incident | Local-first design, warnings, no telemetry, no default persistence |
| AI-generated code is inconsistent | Maintenance burden | Strict types, tests, small PRs, code review and architecture boundaries |

---

# 19. Definition of MVP complete

The MVP is complete only when all statements below are true:

1. A new user can use the hosted demo without registering.
2. A supported Playwright JSON report imports successfully.
3. A supported ZIP bundle imports report data and referenced images safely.
4. The app shows correct counts, statuses, errors, attempts and available attachments for the test fixtures.
5. Users can search/filter tests and inspect failures.
6. Users can add release metadata, notes and checklist results.
7. The evidence status is deterministic and explains its reasons.
8. The app exports a standalone HTML report and supports print/save PDF.
9. Malformed and malicious input fixtures fail safely.
10. Report contents are not transmitted to the app's hosting infrastructure.
11. The app has no mandatory paid runtime dependency.
12. CI passes all required checks.
13. The README explains setup, development, tests, deployment and supported report format.
14. Privacy and product limitations are clearly communicated.
15. At least 3 external QA users have attempted the main workflow, and their feedback is recorded.

---

# 20. Instructions for subsequent AI-agent sessions

At the start of every coding session:
1. Read `README.md`, `docs/PRODUCT_SPEC.md` and `DECISIONS.md`.
2. Inspect the current repository state before changing files.
3. Identify the current milestone and its acceptance criteria.
4. Propose a small plan for the next change.
5. Do not rewrite working code or replace the stack without a clear reason.
6. Implement only the requested milestone.
7. Add/update tests for every behavior change.
8. Run the relevant checks and report exact results.
9. Summarize changed files, test results, known limitations and the next recommended step.
10. Never claim tests passed unless they were actually executed.
11. If a requirement conflicts with a security, privacy or cost constraint, stop and explain the conflict rather than silently violating the constraint.
12. Ask before introducing a paid service, sending data to an external API, adding analytics, adding login, or implementing cloud storage.

**First coding task:** implement Milestone 0 only. Do not start building the dashboard, parser or subscription system until the foundation is reviewed.

---

# Appendix A — Demo report requirements

Create a fully synthetic demo report with approximately 12–20 tests:
- several passed tests,
- two failures with different error types,
- one skipped test,
- one retried/flaky test,
- at least one project/browser name,
- some tests with durations,
- at least two screenshots using synthetic, non-sensitive content,
- one missing attachment case,
- one example of an unknown/unsupported status for a fixture test, not necessarily the default user-facing demo.

The demo must clearly say it is illustrative and not actual production test evidence.

# Appendix B — Supported import instructions for the user

Recommended documented workflow:

1. Configure Playwright to write a JSON report, for example:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/playwright-report.json" }]
  ]
});
```

2. Run tests using the team's usual command.
3. To include screenshots, package the JSON report and the attachment files it references into a ZIP, preserving relative paths.
4. Import the JSON for summary-only use, or the ZIP for summary plus supported attachments.

The exact attachment directory and relative paths depend on the test configuration and reporter output. The product's documentation/helper must be tested against an actual generated report. Do not claim that every Playwright HTML report, blob report or arbitrary ZIP is supported by the JSON parser.

# Appendix C — Decision log starter

- `ADR-001`: MVP is client-side and static to meet €0/month target.
- `ADR-002`: No accounts or cloud storage before demand validation.
- `ADR-003`: Deterministic rules, no generative AI dependency.
- `ADR-004`: JSON reporter is the initial canonical import format; ZIP is a wrapper for attachments.
- `ADR-005`: HTML export and browser print-to-PDF avoid paid server-side rendering.
- `ADR-006`: ReleaseProof is a working title only; final naming requires research.
- `ADR-007`: Subscription billing is deferred until there is evidence of recurring customer value.
