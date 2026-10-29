import JSZip from "jszip";
import type { NormalizedReport } from "../../domain/report";
import { parsePlaywrightJson } from "../playwright/playwright-normalizer";
import {
  DEFAULT_IMPORT_LIMITS,
  hasZipSignature,
  type ImportLimits,
} from "./file-validation";
import { ImportPipelineError } from "./import-errors";
import {
  inspectZipCentralDirectory,
  normalizeArchiveEntryPath,
  type ZipEntryMetadata,
} from "./zip-central-directory";
import { matchesImageSignature } from "./image-signature";

export interface ImportProgress {
  phase: "validating" | "reading" | "extracting" | "normalizing";
  percent: number;
  message: string;
}

export interface ImportedAsset {
  attachmentId: string;
  blob: Blob;
}

export interface ProcessedReport {
  report: NormalizedReport;
  assets: ImportedAsset[];
}

type ProgressCallback = (progress: ImportProgress) => void;

export async function readPlaywrightZip(
  bytes: Uint8Array,
  sourceFileName: string,
  onProgress: ProgressCallback,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ProcessedReport> {
  if (!hasZipSignature(bytes)) {
    throw new ImportPipelineError("invalid_archive");
  }

  onProgress({
    phase: "validating",
    percent: 15,
    message: "Checking ZIP entries and size limits",
  });
  const centralEntries = inspectZipCentralDirectory(bytes, limits);
  const zip = await loadZip(bytes);
  const zipEntries = indexZipEntries(zip);
  validateZipEntries(centralEntries, zipEntries);

  const reportEntry = findReportEntry(centralEntries, zipEntries);
  onProgress({
    phase: "reading",
    percent: 35,
    message: "Reading the Playwright JSON report",
  });

  let reportBytes: Uint8Array;
  let reportText: string;
  try {
    reportBytes = await reportEntry.file.async("uint8array", (metadata) =>
      onProgress({
        phase: "reading",
        percent: Math.min(60, 35 + Math.round(metadata.percent * 0.25)),
        message: "Reading the Playwright JSON report",
      }),
    );
    if (reportBytes.byteLength > limits.maxSingleUncompressedBytes) {
      throw new ImportPipelineError("entry_too_large");
    }
    reportText = new TextDecoder("utf-8", { fatal: true }).decode(reportBytes);
  } catch (error) {
    if (error instanceof ImportPipelineError) {
      throw error;
    }
    if (error instanceof RangeError) {
      throw error;
    }
    throw new ImportPipelineError("invalid_archive");
  }

  const parsedReport = parsePlaywrightJson(reportText.replace(/^\uFEFF/, ""), {
    sourceFileName,
  });
  if (!parsedReport.ok) {
    const category =
      parsedReport.error.category === "empty"
        ? "empty_report"
        : parsedReport.error.category === "malformed"
          ? "malformed_json"
          : "unsupported_report";
    throw new ImportPipelineError(category, parsedReport.error.message);
  }

  onProgress({
    phase: "extracting",
    percent: 65,
    message: "Resolving report attachments",
  });
  const assets = await resolveAttachments(
    parsedReport.report,
    zipEntries,
    limits,
    onProgress,
    reportBytes.byteLength,
  );
  onProgress({
    phase: "normalizing",
    percent: 95,
    message: "Preparing the normalized report",
  });

  return { report: parsedReport.report, assets };
}

export function resolveAttachmentArchivePath(
  sourcePath: string,
  archivePaths: readonly string[],
): string | undefined {
  if (sourcePath.includes("\0")) {
    return undefined;
  }

  const normalized = sourcePath.replaceAll("\\", "/");
  const isAbsolute =
    normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized);
  const segments = normalized.split("/").filter((segment) => {
    return segment.length > 0 && segment !== ".";
  });
  if (segments.some((segment) => segment === "..") || segments.length === 0) {
    return undefined;
  }

  if (/^[a-zA-Z]:$/.test(segments[0] ?? "")) {
    segments.shift();
  }
  const reference = segments.join("/");
  const allowSuffixMatch = isAbsolute || segments.length > 1;
  const matches = archivePaths.filter(
    (path) =>
      path === reference ||
      (allowSuffixMatch &&
        (reference.endsWith(`/${path}`) || path.endsWith(`/${reference}`))),
  );

  return matches.length === 1 ? matches[0] : undefined;
}

interface IndexedZipEntry {
  path: string;
  file: JSZip.JSZipObject;
}

async function loadZip(bytes: Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(bytes, {
      checkCRC32: false,
      createFolders: false,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new ImportPipelineError("invalid_archive");
  }
}

function indexZipEntries(zip: JSZip): Map<string, IndexedZipEntry> {
  const entries = new Map<string, IndexedZipEntry>();

  for (const file of Object.values(zip.files)) {
    const originalName = file.unsafeOriginalName ?? file.name;
    const normalized = normalizeArchiveEntryPath(originalName);
    if (entries.has(normalized.path)) {
      throw new ImportPipelineError("invalid_archive");
    }
    entries.set(normalized.path, { path: normalized.path, file });
  }

  return entries;
}

function validateZipEntries(
  centralEntries: ZipEntryMetadata[],
  zipEntries: Map<string, IndexedZipEntry>,
): void {
  if (centralEntries.length !== zipEntries.size) {
    throw new ImportPipelineError("invalid_archive");
  }

  for (const entry of centralEntries) {
    const indexed = zipEntries.get(entry.path);
    if (!indexed || indexed.file.dir !== entry.isDirectory) {
      throw new ImportPipelineError("invalid_archive");
    }
  }
}

function findReportEntry(
  centralEntries: ZipEntryMetadata[],
  zipEntries: Map<string, IndexedZipEntry>,
): IndexedZipEntry {
  const candidates = centralEntries.filter(
    (entry) => !entry.isDirectory && /\.json$/i.test(entry.path),
  );
  if (candidates.length === 0) {
    throw new ImportPipelineError("report_not_found");
  }

  const preferred = candidates.filter((entry) => {
    const name = entry.path.split("/").at(-1)?.toLowerCase();
    return name === "playwright-report.json" || name === "report.json";
  });
  const selected = preferred.length > 0 ? preferred : candidates;
  if (selected.length !== 1) {
    throw new ImportPipelineError("ambiguous_report");
  }

  const report = zipEntries.get(selected[0]!.path);
  if (!report) {
    throw new ImportPipelineError("invalid_archive");
  }
  return report;
}

async function resolveAttachments(
  report: NormalizedReport,
  zipEntries: Map<string, IndexedZipEntry>,
  limits: ImportLimits,
  onProgress: ProgressCallback,
  initialUncompressedBytes: number,
): Promise<ImportedAsset[]> {
  const attachments = report.tests.flatMap((test) => test.attachments);
  const assets: ImportedAsset[] = [];
  let actualUncompressedBytes = initialUncompressedBytes;
  let completed = 0;

  for (const attachment of attachments) {
    if (!attachment.sourcePath) {
      completed += 1;
      continue;
    }

    const path = resolveAttachmentArchivePath(attachment.sourcePath, [
      ...zipEntries.keys(),
    ]);
    const indexed = path ? zipEntries.get(path) : undefined;
    if (!indexed || indexed.file.dir) {
      if (path === undefined) {
        report.metadata.warnings.push(
          `Attachment "${attachment.name}" could not be matched safely within the ZIP.`,
        );
      }
      completed += 1;
      continue;
    }

    attachment.missing = false;
    if (attachment.kind === "unsupported") {
      completed += 1;
      continue;
    }

    try {
      const blob = await indexed.file.async("blob", (metadata) => {
        onProgress({
          phase: "extracting",
          percent:
            attachments.length === 0
              ? 90
              : Math.min(
                  90,
                  65 +
                    Math.round(
                      ((completed + metadata.percent / 100) /
                        attachments.length) *
                        25,
                    ),
                ),
          message: `Resolving attachment ${completed + 1} of ${attachments.length}`,
        });
      });
      actualUncompressedBytes += blob.size;
      if (blob.size > limits.maxSingleUncompressedBytes) {
        throw new ImportPipelineError("entry_too_large");
      }
      if (
        attachment.kind === "image" &&
        limits.maxImageAttachmentBytes !== undefined &&
        blob.size > limits.maxImageAttachmentBytes
      ) {
        throw new ImportPipelineError(
          "entry_too_large",
          "An image attachment exceeds the private-upload size limit.",
        );
      }
      if (actualUncompressedBytes > limits.maxTotalUncompressedBytes) {
        throw new ImportPipelineError("archive_too_large");
      }

      if (
        attachment.kind === "image" &&
        !(await matchesImageSignature(blob, attachment.contentType))
      ) {
        attachment.kind = "unsupported";
        report.metadata.warnings.push(
          `Attachment "${attachment.name}" did not match its reported image type and was not imported.`,
        );
      } else {
        assets.push({
          attachmentId: attachment.id,
          blob: blob.slice(0, blob.size, attachment.contentType),
        });
      }
    } catch (error) {
      if (error instanceof ImportPipelineError || error instanceof RangeError) {
        throw error;
      }
      if (!(error instanceof Error)) {
        throw error;
      }
      attachment.missing = true;
      report.metadata.warnings.push(
        `Attachment "${attachment.name}" could not be read from the ZIP.`,
      );
    }

    completed += 1;
  }

  return assets;
}
