import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import type { NormalizedReport, TestAttachment } from "../../domain/report";
import { parsePlaywrightJson } from "../playwright/playwright-normalizer";
import { describe, expect, it } from "vitest";
import {
  buildStandaloneHtmlReport,
  createHtmlExportFilename,
} from "./html-report-builder";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x13, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

function createReport(): NormalizedReport {
  const parsed = parsePlaywrightJson(JSON.stringify(generatedFixture), {
    sourceFileName: "generated.json",
    importedAt: "2026-10-29T12:00:00.000Z",
  });
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.report;
}

function addImageAttachment(
  report: NormalizedReport,
  attachmentId = "image-1",
): TestAttachment {
  const test = report.tests[0];
  if (!test) {
    throw new Error("Generated fixture has no first test.");
  }
  const attachment: TestAttachment = {
    id: attachmentId,
    name: "screenshot.png",
    contentType: "image/png",
    kind: "image",
    sourcePath: "assets/screenshot.png",
    sizeBytes: pngBytes.byteLength,
    missing: false,
  };
  test.attachments.push(attachment);
  return attachment;
}

describe("standalone HTML report export", () => {
  it("includes report data and escapes imported strings as text", async () => {
    const report = createReport();
    const maliciousText =
      '<img src=x onerror="alert(1)"> & <script>alert(1)</script>';
    report.metadata.runTitle = maliciousText;
    report.metadata.notes = maliciousText;
    report.metadata.sourceFileName = maliciousText;
    report.checklist = [
      {
        id: "check-1",
        label: maliciousText,
        status: "pass",
        note: maliciousText,
        required: true,
      },
    ];
    const test = report.tests[0];
    if (!test) {
      throw new Error("Generated fixture has no first test.");
    }
    test.fullTitle = maliciousText;
    test.userAnnotation = maliciousText;
    test.attempts[0]?.errorMessages.push(maliciousText);

    const result = await buildStandaloneHtmlReport(report, new Map(), {
      generatedAt: "2026-10-30T12:00:00.000Z",
      includeImages: false,
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("Expected an HTML report.");
    }
    expect(result.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(result.html).not.toMatch(/<script\b|<img src=x onerror/i);
    expect(result.html).toContain("Imported file");
    expect(result.html).toContain("Parser version");
    expect(result.html).toContain("1.0.0");
    expect(result.html).toContain("Summary");
    expect(result.html).toContain("Evidence status");
    expect(result.html).toContain("QA checklist");
    expect(result.html).toContain("Attempts");
    expect(result.html).toContain("Before sharing:");
    expect(result.html).toContain("not a guarantee of release safety");
    expect(result.html).toContain("@page { size: A4");
    expect(result.html).not.toMatch(/<(?:script|link|iframe)\b/i);
    expect(result.sizeBytes).toBe(
      new Blob([result.html], { type: "text/html;charset=utf-8" }).size,
    );
  });

  it("embeds only supported, verified image assets as data URLs", async () => {
    const report = createReport();
    const attachment = addImageAttachment(report);
    const asset = new Blob([pngBytes], { type: "image/png" });

    const result = await buildStandaloneHtmlReport(
      report,
      new Map([[attachment.id, asset]]),
      { generatedAt: "2026-10-30T12:00:00.000Z" },
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("Expected an HTML report.");
    }
    expect(result.embeddedImageCount).toBe(1);
    expect(result.omittedImageCount).toBe(0);
    expect(result.html).toContain(
      `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
    );
    expect(result.html).not.toContain("blob:");
  });

  it("labels synthetic demo reports in the exported document", async () => {
    const report = createReport();
    report.metadata.isDemo = true;
    const result = await buildStandaloneHtmlReport(report, new Map(), {
      includeImages: false,
      generatedAt: "2026-10-30T12:00:00.000Z",
    });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.html).toContain(
        "Illustrative synthetic demo — not actual production test evidence.",
      );
    }
  });

  it("offers a smaller export without images when embedding exceeds the limit", async () => {
    const report = createReport();
    const attachment = addImageAttachment(report);
    const assets = new Map([
      [attachment.id, new Blob([pngBytes], { type: "image/png" })],
    ]);
    const noImageResult = await buildStandaloneHtmlReport(report, assets, {
      includeImages: false,
      generatedAt: "2026-10-30T12:00:00.000Z",
    });
    if (noImageResult.kind !== "ready") {
      throw new Error("Expected the report without images to fit.");
    }
    const maxBytes = noImageResult.sizeBytes + 8;

    const withImages = await buildStandaloneHtmlReport(report, assets, {
      maxBytes,
      generatedAt: "2026-10-30T12:00:00.000Z",
    });
    expect(withImages).toMatchObject({
      kind: "too_large",
      cause: "images",
      limitBytes: maxBytes,
    });

    const smallerExport = await buildStandaloneHtmlReport(report, assets, {
      includeImages: false,
      maxBytes,
      generatedAt: "2026-10-30T12:00:00.000Z",
    });
    expect(smallerExport).toMatchObject({
      kind: "ready",
      embeddedImageCount: 0,
      omittedImageCount: 1,
    });
    if (smallerExport.kind === "ready") {
      expect(smallerExport.html).toContain(
        "Screenshot was not embedded in this export.",
      );
      expect(smallerExport.html).not.toContain('src="data:image/');
    }
  });

  it("reports when even the report without images exceeds the configured limit", async () => {
    const result = await buildStandaloneHtmlReport(createReport(), new Map(), {
      includeImages: false,
      maxBytes: 100,
      generatedAt: "2026-10-30T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      kind: "too_large",
      cause: "report",
      limitBytes: 100,
    });
  });

  it("omits images whose declared type does not match their bytes", async () => {
    const report = createReport();
    const attachment = addImageAttachment(report);
    const result = await buildStandaloneHtmlReport(
      report,
      new Map([
        [attachment.id, new Blob(["not an image"], { type: "image/png" })],
      ]),
      { generatedAt: "2026-10-30T12:00:00.000Z" },
    );

    expect(result).toMatchObject({
      kind: "ready",
      embeddedImageCount: 0,
      omittedImageCount: 1,
    });
    if (result.kind === "ready") {
      expect(result.html).not.toContain('src="data:image/');
      expect(result.html).toContain(
        "Screenshot was not embedded in this export.",
      );
    }
  });

  it("never embeds SVG or arbitrary attachment markup", async () => {
    const report = createReport();
    const attachment = addImageAttachment(report);
    attachment.contentType = "image/svg+xml";
    const svg = '<svg onload="alert(1)"><script>alert(1)</script></svg>';
    const result = await buildStandaloneHtmlReport(
      report,
      new Map([[attachment.id, new Blob([svg], { type: "image/svg+xml" })]]),
      { generatedAt: "2026-10-30T12:00:00.000Z" },
    );

    expect(result).toMatchObject({
      kind: "ready",
      embeddedImageCount: 0,
      omittedImageCount: 1,
    });
    if (result.kind === "ready") {
      expect(result.html).not.toContain("<svg");
      expect(result.html).not.toContain("<script");
      expect(result.html).not.toContain("data:image/svg+xml");
    }
  });

  it("creates a safe HTML download filename", () => {
    expect(createHtmlExportFilename("../release: report.")).toBe(
      "-release- report.html",
    );
    expect(createHtmlExportFilename("CON")).toBe("releaseproof-report.html");
    expect(createHtmlExportFilename("")).toBe("releaseproof-report.html");
  });
});
