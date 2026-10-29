# Playwright JSON reports

ReleaseProof currently targets the Playwright Test JSON reporter output. Other
formats, including HTML and blob reports, are not supported by the normalizer.
The checked-in representative report was generated with Playwright Test 1.64.1;
the generator uses synthetic tests and removes machine-specific paths.

To generate a JSON report from a project, configure Playwright's built-in JSON
reporter:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["json", { outputFile: "artifacts/playwright-report.json" }]],
});
```

Then run the project's usual test command, for example:

```sh
npx playwright test
```

To regenerate this repository's synthetic compatibility fixture, run:

```sh
npm run fixtures:playwright
```

A JSON report can refer to attachments stored separately from the JSON. Import
the report and its attachments together in a ZIP bundle to include matching
files; importing the JSON alone leaves those attachments missing. ZIP imports
reject unsafe archive paths and enforce limits on archive size, entry count,
and extracted data. Only supported image files with matching content
signatures are imported as image attachments.

Local-only imports allow JSON and ZIP files up to 50 MiB, with up to 5,000 ZIP
entries and 200 MiB of expanded data. Explicit workspace uploads apply stricter
limits: JSON up to 10 MiB; ZIP up to 25 MiB, 200 entries and 100 MiB expanded
data; each image attachment is limited to 5 MiB. The source file remains in
private workspace Storage so authorized members can reload or download it.
