# ReleaseProof

ReleaseProof is a local-first QA evidence report builder for Playwright test
results. The application processes imported report data in the browser; it does
not upload report content.

The implementation has reached **Milestone 6 — Demo readiness**: it includes
a guided landing page, synthetic demo data, privacy and limitations
information, keyboard-accessible dialogs, and a GitHub Pages deployment
workflow that runs after CI passes on `main`. The public deployment and
external user sessions still require owner setup and coordination.

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
Enable **Settings → Pages → Build and deployment → GitHub Actions** in the
repository before the first deployment. The Vite build uses the repository
subpath automatically.

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
npm run build
npm run fixtures:playwright
```

## Current scope

The app accepts Playwright JSON reports and ZIP bundles with report
attachments. Imported data and annotations stay in browser memory and are not
uploaded. Release metadata, the manual checklist, evidence status, standalone
HTML export, and print/save as PDF are available locally. HTML exports are
limited to 15 MiB; screenshots can be omitted when they exceed that limit. The
built-in demo is synthetic and clearly labeled. See
`ReleaseProof_MVP_Product_and_Technical_Specification.md` for product
requirements and the milestone plan, and `docs/PLAYWRIGHT_IMPORT.md` for
supported report generation and import behavior. `DECISIONS.md` records
implementation decisions and deviations.
