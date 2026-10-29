# Decisions

- `ADR-001`: Keep the MVP client-side and statically hosted to meet the €0/month
  target.
- `ADR-002`: Do not add accounts or cloud storage before demand validation.
  Superseded for accounts by ADR-015; cloud report storage remains deferred.
- `ADR-003`: Use deterministic analysis; do not require a generative AI service.
- `ADR-004`: Use Playwright JSON as the canonical input format; ZIP is a wrapper
  for report attachments.
- `ADR-005`: Generate HTML locally and use browser print-to-PDF rather than
  server-side rendering.
- `ADR-006`: Treat ReleaseProof as a working title pending name, domain, and
  trademark checks.
- `ADR-007`: Defer subscription billing until recurring customer value is
  validated.
- `ADR-008`: Start with the requested static React/TypeScript/Vite scaffold;
  keep report parsing and product behavior out of the foundation milestone.
- `ADR-009`: Treat recovered retries and expected-to-fail tests as requiring
  review; neither is equivalent to a clean pass for the evidence summary.
- `ADR-010`: A logical test duration is the sum of its attempt durations. Leave
  it unset if any attempt duration is missing rather than treating missing time
  as zero.
- `ADR-011`: Require an explicit user checkbox to identify release notes as a
  blocker; do not infer blocker intent by scanning free-text notes.
- `ADR-012`: Generate standalone HTML locally from escaped normalized report
  data; embed only signature-verified PNG, JPEG, or WebP images and offer an
  image-free export when the 15 MiB output limit is exceeded.
- `ADR-013`: Generate demo results and screenshots from synthetic data in the
  browser rather than bundling customer, employer, or production artifacts.
- `ADR-014`: Use GitHub Pages for static hosting; deploy only from `main` after
  the CI quality and database jobs pass.
- `ADR-015`: Implement the approved Supabase migration one stage at a time.
  Keep the public GitHub Pages build local-first and unauthenticated until a
  hosted project, redirect allowlist, email delivery and release review are
  explicitly configured. Authentication uses only the browser publishable
  key. Local Stages 1–6 now cover database isolation, authentication,
  workspaces, roles, invitations, private report storage and versioned
  collaboration. Hosted auth and report uploads remain disabled until a
  production Supabase project and operational policies are reviewed.
- `ADR-016`: Keep local imports local by default. Uploads to a workspace require
  a separate user confirmation and store the source in a private bucket;
  PostgreSQL stores only report metadata and checklist state. Use stricter
  cloud ZIP limits, report-path-bound Storage policies, role-checked RPCs and
  optimistic report versions. Annotation edits remain read-only in shared
  reports until collaborative persistence is implemented.
