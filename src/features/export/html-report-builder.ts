import type {
  ChecklistItem,
  NormalizedReport,
  NormalizedTest,
  TestAttachment,
} from "../../domain/report";
import { appConfig } from "../../config/app-config";
import { TEST_STATUS_LABELS } from "../../domain/test-status";
import { formatDuration } from "../../lib/format-duration";
import { NO_KNOWN_BLOCKERS_DISCLAIMER } from "../evidence/evidence-rules";
import {
  isSupportedImageContentType,
  matchesImageSignature,
} from "../import-report/image-signature";

const megabyte = 1024 * 1024;
export const DEFAULT_MAX_HTML_EXPORT_BYTES = 15 * megabyte;

export interface HtmlExportOptions {
  includeImages?: boolean;
  maxBytes?: number;
  generatedAt?: string;
}

export type HtmlExportResult =
  | {
      kind: "ready";
      html: string;
      sizeBytes: number;
      embeddedImageCount: number;
      omittedImageCount: number;
    }
  | {
      kind: "too_large";
      estimatedSizeBytes: number;
      limitBytes: number;
      cause: "report" | "images";
    };

interface ExportImage {
  attachment: TestAttachment;
  blob: Blob;
  contentType: string;
  base64Length: number;
}

export async function buildStandaloneHtmlReport(
  report: NormalizedReport,
  assets: ReadonlyMap<string, Blob>,
  options: HtmlExportOptions = {},
): Promise<HtmlExportResult> {
  const includeImages = options.includeImages ?? true;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_HTML_EXPORT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("The export size limit must be a positive integer.");
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const allImageAttachments = collectImageAttachments(report);
  const baseHtml = renderReportHtml(report, new Map(), generatedAt);
  const baseSizeBytes = htmlSize(baseHtml);

  if (baseSizeBytes > maxBytes) {
    return {
      kind: "too_large",
      estimatedSizeBytes: baseSizeBytes,
      limitBytes: maxBytes,
      cause: "report",
    };
  }

  if (!includeImages) {
    return {
      kind: "ready",
      html: baseHtml,
      sizeBytes: baseSizeBytes,
      embeddedImageCount: 0,
      omittedImageCount: allImageAttachments.length,
    };
  }

  const imageCandidates: ExportImage[] = [];
  for (const attachment of allImageAttachments) {
    const blob = assets.get(attachment.id);
    const contentType = attachment.contentType.toLowerCase();
    if (
      attachment.missing ||
      !blob ||
      !isSupportedImageContentType(contentType) ||
      blob.type.toLowerCase() !== contentType ||
      !(await matchesImageSignature(blob, contentType))
    ) {
      continue;
    }

    imageCandidates.push({
      attachment,
      blob,
      contentType,
      base64Length: 4 * Math.ceil(blob.size / 3),
    });
  }

  const imagePrefixes = new Map(
    imageCandidates.map(({ attachment, contentType }) => [
      attachment.id,
      `data:${contentType};base64,`,
    ]),
  );
  const templateHtml = renderReportHtml(report, imagePrefixes, generatedAt);
  const referenceCounts = collectImageReferenceCounts(report);
  const estimatedSizeBytes =
    htmlSize(templateHtml) +
    imageCandidates.reduce(
      (total, image) =>
        total +
        image.base64Length * (referenceCounts.get(image.attachment.id) ?? 0),
      0,
    );

  if (estimatedSizeBytes > maxBytes) {
    return {
      kind: "too_large",
      estimatedSizeBytes,
      limitBytes: maxBytes,
      cause: "images",
    };
  }

  const imageData = new Map<string, string>();
  for (const image of imageCandidates) {
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    imageData.set(
      image.attachment.id,
      `data:${image.contentType};base64,${bytesToBase64(bytes)}`,
    );
  }

  const html = renderReportHtml(report, imageData, generatedAt);
  const sizeBytes = htmlSize(html);
  if (sizeBytes > maxBytes) {
    return {
      kind: "too_large",
      estimatedSizeBytes: sizeBytes,
      limitBytes: maxBytes,
      cause: "images",
    };
  }

  return {
    kind: "ready",
    html,
    sizeBytes,
    embeddedImageCount: imageCandidates.length,
    omittedImageCount: allImageAttachments.length - imageCandidates.length,
  };
}

export function createHtmlExportFilename(title: string): string {
  const fallbackName =
    appConfig.productName
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "report";
  const safeTitle = Array.from(title.normalize("NFKC"), (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || '<>:"/\\|?*'.includes(character) ? "-" : character;
  })
    .join("")
    .replace(/^\.+/u, "")
    .replace(/[. ]+$/gu, "")
    .trim()
    .slice(0, 80);
  const safeBasename =
    safeTitle && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(safeTitle)
      ? safeTitle
      : `${fallbackName}-report`;
  return `${safeBasename}.html`;
}

function renderReportHtml(
  report: NormalizedReport,
  imageSources: ReadonlyMap<string, string>,
  generatedAt: string,
): string {
  const { metadata, aggregate } = report;
  const reportTitle =
    metadata.runTitle.trim() || `${appConfig.productName} report`;
  const evidenceLabels = {
    evidence_incomplete: "Evidence incomplete",
    review_required: "Review required",
    no_known_blockers: "No known blockers in imported evidence",
  } as const;
  const metadataRows: Array<[string, string | undefined]> = [
    ["Run / release title", metadata.runTitle],
    ["Environment", metadata.environment],
    ["Build / version", metadata.buildVersion],
    ["Commit SHA", metadata.commitSha],
    [
      "Run date and time",
      metadata.runDate && formatTimestamp(metadata.runDate),
    ],
    ["Release notes", metadata.notes],
    ["User-reported blocker", metadata.userReportedBlocker ? "Yes" : "No"],
    ["Playwright run outcome", metadata.runOutcome],
    [
      "Run duration",
      metadata.runDurationMs === undefined
        ? undefined
        : formatDuration(metadata.runDurationMs),
    ],
    ["Imported file", metadata.sourceFileName],
    ["Imported at", formatTimestamp(metadata.importedAt)],
    ["Playwright version", metadata.playwrightVersion],
    ["Parser version", metadata.parserVersion],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #172321; background: #f3f6f4; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem; }
    main { max-width: 70rem; margin: 0 auto; padding: 2rem; background: #fff; }
    h1 { margin: 0; font-size: 2rem; overflow-wrap: anywhere; }
    h2 { margin: 2rem 0 0.75rem; font-size: 1.35rem; }
    h3 { margin: 1.25rem 0 0.5rem; font-size: 1.05rem; }
    p { line-height: 1.5; }
    .eyebrow, .muted { color: #59665f; font-size: 0.85rem; }
    .privacy, .evidence { padding: 1rem; border: 1px solid #dce5df; border-radius: 0.6rem; background: #f3f6f4; }
    .privacy { border-color: #c88223; background: #fff8e9; }
    .demo-label { color: #20583f; font-weight: 700; }
    .evidence-status { font-size: 1.15rem; font-weight: 700; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.8rem; }
    dl > div { min-width: 0; padding: 0.8rem; border: 1px solid #dce5df; border-radius: 0.5rem; overflow-wrap: anywhere; }
    dt { color: #59665f; font-size: 0.8rem; }
    dd { margin: 0.35rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.55rem; border: 1px solid #dce5df; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f3f6f4; }
    .test-detail, .attempt, .attachment { margin: 0.75rem 0; padding: 0.8rem; border: 1px solid #dce5df; border-radius: 0.5rem; break-inside: avoid; }
    .attempts { padding-left: 1.3rem; }
    pre { max-width: 100%; padding: 0.7rem; background: #f3f6f4; white-space: pre-wrap; overflow-wrap: anywhere; font: 0.8rem/1.5 ui-monospace, Consolas, monospace; }
    img { display: block; max-width: 100%; max-height: 28rem; object-fit: contain; }
    .attachment-image { margin-top: 0.5rem; border: 1px solid #dce5df; }
    .status { font-weight: 700; }
    @page { size: A4; margin: 16mm; }
    @media print {
      body { padding: 0; background: #fff; }
      main { max-width: none; padding: 0; }
      thead { display: table-header-group; }
      tr, .test-detail, .attempt, .attachment { break-inside: avoid; }
      h1, h2, h3 { break-after: avoid; }
      details > * { display: block; }
    }
    @media screen and (max-width: 640px) {
      body { padding: 0.5rem; }
      main { padding: 1rem; }
      table { font-size: 0.8rem; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">${escapeHtml(appConfig.productName)} · QA evidence report</p>
      <h1>${escapeHtml(reportTitle)}</h1>
      ${metadata.isDemo ? '<p class="demo-label">Illustrative synthetic demo — not actual production test evidence.</p>' : ""}
      <p class="muted">Generated ${escapeHtml(formatTimestamp(generatedAt))}</p>
      <p class="privacy"><strong>Before sharing:</strong> Test names, URLs, stack traces, notes and screenshots may contain secrets or personal data. Review this report before sharing.</p>
    </header>
    <section aria-labelledby="metadata-title">
      <h2 id="metadata-title">Run metadata</h2>
      <dl>${metadataRows
        .filter(([, value]) => value !== undefined)
        .map(
          ([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "")}</dd></div>`,
        )
        .join("")}</dl>
    </section>
    <section aria-labelledby="summary-title">
      <h2 id="summary-title">Summary</h2>
      <table>
        <thead><tr><th>Outcome</th><th>Count</th></tr></thead>
        <tbody>
          <tr><th scope="row">Logical tests</th><td>${aggregate.totalLogicalTests}</td></tr>
          <tr><th scope="row">Passed</th><td>${aggregate.passed}</td></tr>
          <tr><th scope="row">Failed</th><td>${aggregate.failed}</td></tr>
          <tr><th scope="row">Skipped</th><td>${aggregate.skipped}</td></tr>
          <tr><th scope="row">Flaky</th><td>${aggregate.flaky}</td></tr>
          <tr><th scope="row">Timed out</th><td>${aggregate.timedOut}</td></tr>
          <tr><th scope="row">Interrupted</th><td>${aggregate.interrupted}</td></tr>
          <tr><th scope="row">Expected to fail</th><td>${aggregate.expectedToFail}</td></tr>
          <tr><th scope="row">Unknown / unmapped</th><td>${aggregate.unknown}</td></tr>
          <tr><th scope="row">Total attempts</th><td>${aggregate.totalAttempts}</td></tr>
        </tbody>
      </table>
    </section>
    <section aria-labelledby="import-status-title">
      <h2 id="import-status-title">Import status</h2>
      <p>Report completeness: ${metadata.isPartial ? "Partial" : "Complete"}</p>
      ${
        metadata.missingRequiredFields.length > 0
          ? `<p>Missing required source fields: ${metadata.missingRequiredFields.map(escapeHtml).join(", ")}</p>`
          : ""
      }
      ${
        metadata.warnings.length > 0
          ? `<ul>${metadata.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
          : "<p>No import warnings.</p>"
      }
    </section>
    <section class="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Evidence status</h2>
      <p class="evidence-status">${escapeHtml(evidenceLabels[report.evidence.status])}</p>
      <ul>${report.evidence.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <p>${escapeHtml(NO_KNOWN_BLOCKERS_DISCLAIMER)}</p>
    </section>
    <section aria-labelledby="checklist-title">
      <h2 id="checklist-title">QA checklist</h2>
      ${
        report.checklist.length === 0
          ? "<p>No checklist items were included.</p>"
          : `<ul>${report.checklist.map(renderChecklistItem).join("")}</ul>`
      }
    </section>
    <section aria-labelledby="tests-title">
      <h2 id="tests-title">Test results</h2>
      <table>
        <thead><tr><th>Test</th><th>Status</th><th>Duration</th><th>Attempts</th></tr></thead>
        <tbody>${report.tests
          .map(
            (test) =>
              `<tr><th scope="row">${escapeHtml(test.fullTitle)}</th><td>${escapeHtml(TEST_STATUS_LABELS[test.status])}</td><td>${escapeHtml(formatDuration(test.durationMs))}</td><td>${test.attempts.length}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
      ${report.tests.map((test) => renderTestDetails(test, imageSources)).join("")}
    </section>
    <section aria-labelledby="limitations-title">
      <h2 id="limitations-title">Limitations</h2>
      <p>This report summarizes only the Playwright data and user-entered checks listed above. It does not certify release quality, guarantee release safety, or approve a release.</p>
      <p>Only verified PNG, JPEG and WebP screenshots may be embedded. Other attachment contents are not executed or included.</p>
    </section>
  </main>
</body>
</html>`;
}

function renderChecklistItem(item: ChecklistItem): string {
  return `<li><strong>${escapeHtml(item.label)}</strong> — ${escapeHtml(checklistStatusLabel(item.status))}${item.required ? " (required)" : ""}${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</li>`;
}

function checklistStatusLabel(status: ChecklistItem["status"]): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "not_checked":
      return "Not checked";
    case "not_applicable":
      return "Not applicable";
  }
}

function renderTestDetails(
  test: NormalizedTest,
  imageSources: ReadonlyMap<string, string>,
): string {
  const metadata = [
    test.filePath && `File: ${test.filePath}`,
    test.projectName && `Project / browser: ${test.projectName}`,
    `Retries: ${test.retryCount}`,
    test.userAnnotation && `QA annotation: ${test.userAnnotation}`,
  ]
    .filter((value): value is string => value !== undefined)
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("");

  return `<article class="test-detail">
    <h3>${escapeHtml(test.fullTitle)}</h3>
    <p class="status">${escapeHtml(TEST_STATUS_LABELS[test.status])} · ${escapeHtml(formatDuration(test.durationMs))}</p>
    ${metadata ? `<ul>${metadata}</ul>` : ""}
    ${test.annotations.length > 0 ? `<p><strong>Source annotations:</strong> ${test.annotations.map((annotation) => escapeHtml([annotation.type, annotation.description].filter(Boolean).join(": "))).join("; ")}</p>` : ""}
    <h4>Attempts</h4>
    ${
      test.attempts.length === 0
        ? "<p>No attempt details were included.</p>"
        : `<ol class="attempts">${test.attempts.map((attempt) => `<li class="attempt"><strong>${escapeHtml(TEST_STATUS_LABELS[attempt.status])}</strong> · ${escapeHtml(formatDuration(attempt.durationMs))}${attempt.errorMessages.length > 0 ? `<ul>${attempt.errorMessages.map((message) => `<li><pre>${escapeHtml(message)}</pre></li>`).join("")}</ul>` : ""}${attempt.stackTraceText ? `<details open><summary>Stack trace</summary><pre>${escapeHtml(attempt.stackTraceText)}</pre></details>` : ""}</li>`).join("")}</ol>`
    }
    ${
      test.attachments.length > 0
        ? `<h4>Attachments</h4><ul>${test.attachments.map((attachment) => renderAttachment(attachment, imageSources)).join("")}</ul>`
        : "<p>No attachments were included for this test.</p>"
    }
  </article>`;
}

function renderAttachment(
  attachment: TestAttachment,
  imageSources: ReadonlyMap<string, string>,
): string {
  const description = attachment.missing
    ? "Attachment was not included in the imported bundle."
    : attachment.kind === "image" && !imageSources.has(attachment.id)
      ? "Screenshot was not embedded in this export."
      : attachment.kind === "text"
        ? "Text attachment content is not included in the export."
        : attachment.kind === "unsupported"
          ? "This attachment type is not supported for export."
          : "";

  const imageSource = imageSources.get(attachment.id);
  const image =
    attachment.kind === "image" && imageSource
      ? `<img class="attachment-image" src="${imageSource}" alt="${escapeHtml(attachment.name)}">`
      : "";

  return `<li class="attachment"><strong>${escapeHtml(attachment.name)}</strong> <span class="muted">${escapeHtml(attachment.contentType)}</span>${image}<p>${escapeHtml(description)}</p></li>`;
}

function collectImageAttachments(report: NormalizedReport): TestAttachment[] {
  const attachments = new Map<string, TestAttachment>();
  for (const test of report.tests) {
    for (const attachment of test.attachments) {
      if (attachment.kind === "image" && !attachments.has(attachment.id)) {
        attachments.set(attachment.id, attachment);
      }
    }
  }
  return [...attachments.values()];
}

function collectImageReferenceCounts(
  report: NormalizedReport,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const test of report.tests) {
    for (const attachment of test.attachments) {
      if (attachment.kind === "image") {
        counts.set(attachment.id, (counts.get(attachment.id) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function htmlSize(html: string): number {
  return new Blob([html], { type: "text/html;charset=utf-8" }).size;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
