# First-time user test

Use this script with 3–5 QA engineers who have not seen ReleaseProof before.
Allow about 10 minutes per person. Do not coach them through the tasks; ask
them to think aloud and note where they hesitate.

## Preparation

- Use the public demo after GitHub Pages has been enabled, or run the app
  locally with `npm ci` and `npm run dev`.
- Ask testers to use **Try demo report** only. The built-in report and
  screenshots are synthetic.
- Do not request real Playwright reports, credentials, personal data or
  confidential screenshots.
- Explain that local report content stays in the browser, but the static
  hosting provider can receive ordinary web request metadata such as an IP
  address and browser details.
- If testing the authenticated workspace flow against local Supabase, use only
  synthetic reports. A workspace upload is explicit, but the file and any
  bundled attachments are stored in that Supabase project until deleted.

## Tasks

1. From the landing page, explain what the app does and whether you believe
   your report is uploaded.
2. Load the demo, find a failed test, inspect its error and one screenshot, and
   identify the missing-attachment warning.
3. Add a release title, change a checklist result, and explain how the evidence
   status changes.
4. Open the privacy information and describe one limitation that matters
   before sharing a report.
5. Preview and download the HTML report, open it locally, and find its
   evidence status and disclaimer. If time permits, open Print / Save as PDF.
6. Clear the report and explain whether you would know how to import your own
   Playwright JSON or ZIP file.

## Observe and record

Record whether each task was completed without help, the approximate time,
where the tester paused, and any words or labels they misunderstood. Do not
record names, company details, report contents or screenshots.

| Tester ID | Task | Completed without help? | Hesitation / feedback |
| --------- | ---- | ----------------------- | --------------------- |
|           |      |                         |                       |

After each session, ask:

- What was confusing or unexpected?
- What information would you need before sharing the exported report?
- What would prevent you from using this with your own reports?
- What would you change first?

Summarize recurring observations separately from individual opinions. Do not
interpret a successful demo task as proof of product-market fit.
