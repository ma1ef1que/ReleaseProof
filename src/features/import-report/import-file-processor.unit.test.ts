import JSZip from "jszip";
import generatedFixture from "../../test-fixtures/playwright-json/generated.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_IMPORT_LIMITS, validateImportFile } from "./file-validation";
import { processImportFile } from "./import-file-processor";
import { resolveAttachmentArchivePath } from "./zip-reader";
import { inspectZipCentralDirectory } from "./zip-central-directory";
import { playwrightJsonReportSchema } from "../playwright/playwright-json-schema";
import {
  PRIVATE_REPORT_IMPORT_LIMITS,
  validateSharedReportFile,
} from "../workspaces/reports";

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x13, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

async function createZipBytes(
  entries: Array<[string, string | Uint8Array]>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of entries) {
    zip.file(path, content, {
      binary: typeof content !== "string",
      createFolders: false,
    });
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function createFile(bytes: Uint8Array, name = "bundle.zip"): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name);
}

function requireFirstTestResult() {
  const report = playwrightJsonReportSchema.parse(
    structuredClone(generatedFixture),
  );
  const testResult = report.suites[0]?.specs?.[0]?.tests?.[0]?.results?.[0];
  if (!testResult) {
    throw new Error("Generated fixture has no first test result.");
  }
  return { report, testResult };
}

function captureError(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw.");
}

describe("import file validation", () => {
  it("enforces the documented private upload limits", () => {
    expect(PRIVATE_REPORT_IMPORT_LIMITS).toMatchObject({
      maxCompressedFileBytes: 25 * 1024 * 1024,
      maxZipEntries: 200,
      maxTotalUncompressedBytes: 100 * 1024 * 1024,
      maxSingleUncompressedBytes: 50 * 1024 * 1024,
      maxImageAttachmentBytes: 5 * 1024 * 1024,
    });
    expect(() =>
      validateSharedReportFile({
        name: "report.json",
        size: 10 * 1024 * 1024,
      }),
    ).not.toThrow();
    expect(() =>
      validateSharedReportFile({
        name: "report.json",
        size: 10 * 1024 * 1024 + 1,
      }),
    ).toThrow("JSON reports must be 10 MB or smaller for cloud storage.");
    expect(() =>
      validateSharedReportFile({
        name: "report.zip",
        size: 25 * 1024 * 1024,
      }),
    ).not.toThrow();
    expect(() =>
      validateSharedReportFile({
        name: "report.zip",
        size: 25 * 1024 * 1024 + 1,
      }),
    ).toThrow("ZIP reports must be 25 MB or smaller for cloud storage.");
  });

  it("accepts JSON and ZIP extensions without trusting the MIME type", () => {
    expect(validateImportFile({ name: "REPORT.JSON", size: 12 })).toMatchObject(
      {
        ok: true,
        type: "json",
      },
    );
    expect(validateImportFile({ name: "bundle.zip", size: 12 })).toMatchObject({
      ok: true,
      type: "zip",
    });
  });

  it("rejects unsupported, empty, and oversized files", () => {
    expect(validateImportFile({ name: "report.html", size: 10 })).toMatchObject(
      {
        ok: false,
        error: { category: "unsupported_type" },
      },
    );
    expect(validateImportFile({ name: "report.json", size: 0 })).toMatchObject({
      ok: false,
      error: { category: "empty_file" },
    });
    expect(
      validateImportFile(
        { name: "report.json", size: 11 },
        { ...DEFAULT_IMPORT_LIMITS, maxCompressedFileBytes: 10 },
      ),
    ).toMatchObject({
      ok: false,
      error: { category: "file_too_large" },
    });
  });

  it("rejects absolute paths, traversal, and null bytes", () => {
    expect(
      captureError(() =>
        inspectZipCentralDirectory(new Uint8Array(), DEFAULT_IMPORT_LIMITS),
      ),
    ).toMatchObject({ category: "invalid_archive" });
    expect(
      resolveAttachmentArchivePath("../secret.png", ["secret.png"]),
    ).toBeUndefined();
    expect(
      resolveAttachmentArchivePath("C:\\reports\\..\\secret.png", [
        "secret.png",
      ]),
    ).toBeUndefined();
    expect(
      resolveAttachmentArchivePath("a\u0000b", ["a\u0000b"]),
    ).toBeUndefined();
  });
});

describe("local report processing", () => {
  it("parses JSON locally and emits progress", async () => {
    const file = new File(
      [JSON.stringify(generatedFixture)],
      "playwright.json",
      { type: "application/json" },
    );
    const progress: number[] = [];

    const result = await processImportFile(file, (update) => {
      progress.push(update.percent);
    });

    expect(result.report.aggregate.totalLogicalTests).toBe(4);
    expect(result.assets).toEqual([]);
    expect(progress.at(-1)).toBe(95);
  });

  it("returns safe errors for malformed and unsupported JSON", async () => {
    await expect(
      processImportFile(new File(["{"], "malformed.json")),
    ).rejects.toMatchObject({ category: "malformed_json" });
    await expect(
      processImportFile(new File(['{"hello":"world"}'], "not-a-report.json")),
    ).rejects.toMatchObject({ category: "unsupported_report" });
  });

  it("imports a ZIP report and resolves a supported image by archive-relative path", async () => {
    const { report, testResult } = requireFirstTestResult();
    testResult.attachments = [
      {
        name: "screenshot",
        contentType: "image/png",
        path: "assets/screenshot.png",
      },
    ];
    const bytes = await createZipBytes([
      ["bundle/playwright-report.json", JSON.stringify(report)],
      ["bundle/assets/screenshot.png", pngSignature],
    ]);

    const result = await processImportFile(createFile(bytes));
    const attachment = result.report.tests[0]?.attachments[0];

    expect(result.report.aggregate.totalLogicalTests).toBe(4);
    expect(attachment).toMatchObject({
      name: "screenshot",
      kind: "image",
      missing: false,
    });

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.attachmentId).toBe(attachment?.id);
    expect(result.assets[0]?.blob.type).toBe("image/png");
  });

  it("applies the private-upload image limit while retaining local import limits", async () => {
    const { report, testResult } = requireFirstTestResult();
    testResult.attachments = [
      {
        name: "screenshot",
        contentType: "image/png",
        path: "assets/screenshot.png",
      },
    ];
    const bytes = await createZipBytes([
      ["playwright-report.json", JSON.stringify(report)],
      ["assets/screenshot.png", pngSignature],
    ]);

    await expect(
      processImportFile(createFile(bytes), () => {}, {
        ...PRIVATE_REPORT_IMPORT_LIMITS,
        maxImageAttachmentBytes: 1,
      }),
    ).rejects.toMatchObject({
      category: "entry_too_large",
      message: "An image attachment exceeds the private-upload size limit.",
    });
    expect(DEFAULT_IMPORT_LIMITS.maxImageAttachmentBytes).toBeUndefined();
  });

  it("rejects an unsafe ZIP traversal entry before extracting it", async () => {
    const bytes = await createZipBytes([["aa/bb", "fixture"]]);
    const unsafeBytes = new Uint8Array(bytes);
    const sourceName = new TextEncoder().encode("aa/bb");
    const traversalName = new TextEncoder().encode("../bb");
    let replacedNames = 0;

    for (
      let offset = 0;
      offset <= unsafeBytes.length - sourceName.length;
      offset += 1
    ) {
      if (
        sourceName.every(
          (value, index) => unsafeBytes[offset + index] === value,
        )
      ) {
        unsafeBytes.set(traversalName, offset);
        replacedNames += 1;
      }
    }

    expect(replacedNames).toBe(2);
    await expect(
      processImportFile(createFile(unsafeBytes)),
    ).rejects.toMatchObject({
      category: "unsafe_archive_path",
    });
  });

  it("enforces entry count, per-file, and total uncompressed ZIP limits", async () => {
    const bytes = await createZipBytes([
      ["first.txt", "four"],
      ["second.txt", "four"],
    ]);
    const limits = DEFAULT_IMPORT_LIMITS;

    expect(
      captureError(() =>
        inspectZipCentralDirectory(new Uint8Array(bytes), {
          ...limits,
          maxZipEntries: 1,
        }),
      ),
    ).toMatchObject({ category: "too_many_entries" });
    expect(
      captureError(() =>
        inspectZipCentralDirectory(new Uint8Array(bytes), {
          ...limits,
          maxSingleUncompressedBytes: 3,
        }),
      ),
    ).toMatchObject({ category: "entry_too_large" });
    expect(
      captureError(() =>
        inspectZipCentralDirectory(new Uint8Array(bytes), {
          ...limits,
          maxTotalUncompressedBytes: 7,
        }),
      ),
    ).toMatchObject({ category: "archive_too_large" });
  });

  it("rejects a ZIP extension without a ZIP content signature", async () => {
    await expect(
      processImportFile(new File(["not a zip"], "broken.zip")),
    ).rejects.toMatchObject({ category: "invalid_archive" });
  });

  it("requires a deterministic report choice when multiple JSON files exist", async () => {
    const report = JSON.stringify(generatedFixture);
    const bytes = await createZipBytes([
      ["first.json", report],
      ["second.json", report],
    ]);

    await expect(processImportFile(createFile(bytes))).rejects.toMatchObject({
      category: "ambiguous_report",
    });
  });

  it("does not claim unresolved referenced attachments are present", async () => {
    const { report, testResult } = requireFirstTestResult();
    testResult.attachments = [
      {
        name: "missing",
        contentType: "image/png",
        path: "assets/missing.png",
      },
    ];
    const bytes = await createZipBytes([
      ["playwright-report.json", JSON.stringify(report)],
    ]);

    const result = await processImportFile(createFile(bytes));
    expect(result.report.tests[0]?.attachments[0]?.missing).toBe(true);
    expect(result.assets).toHaveLength(0);
  });
});
