import { parsePlaywrightJson } from "../playwright/playwright-normalizer";
import {
  DEFAULT_IMPORT_LIMITS,
  validateImportFile,
  type ImportLimits,
} from "./file-validation";
import { ImportPipelineError } from "./import-errors";
import {
  readPlaywrightZip,
  type ImportProgress,
  type ProcessedReport,
} from "./zip-reader";

type ProgressCallback = (progress: ImportProgress) => void;

export async function processImportFile(
  file: File,
  onProgress: ProgressCallback = () => {},
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ProcessedReport> {
  const validation = validateImportFile(file, limits);
  if (!validation.ok) {
    throw new ImportPipelineError(
      validation.error.category,
      validation.error.message,
    );
  }

  onProgress({
    phase: "validating",
    percent: 5,
    message: "Validating the selected file",
  });

  if (validation.type === "zip") {
    onProgress({
      phase: "reading",
      percent: 10,
      message: "Reading the ZIP archive",
    });
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (error) {
      if (error instanceof RangeError) {
        throw error;
      }
      throw new ImportPipelineError("invalid_archive");
    }

    return readPlaywrightZip(
      new Uint8Array(bytes),
      file.name,
      onProgress,
      limits,
    );
  }

  onProgress({
    phase: "reading",
    percent: 25,
    message: "Reading the JSON report",
  });
  let source: string;
  try {
    const bytes = await file.arrayBuffer();
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new ImportPipelineError("malformed_json");
  }

  onProgress({
    phase: "normalizing",
    percent: 70,
    message: "Validating and normalizing the report",
  });
  const parsed = parsePlaywrightJson(source.replace(/^\uFEFF/, ""), {
    sourceFileName: file.name,
  });
  if (!parsed.ok) {
    const category =
      parsed.error.category === "empty"
        ? "empty_report"
        : parsed.error.category === "malformed"
          ? "malformed_json"
          : "unsupported_report";
    throw new ImportPipelineError(category, parsed.error.message);
  }

  onProgress({
    phase: "normalizing",
    percent: 95,
    message: "Preparing the normalized report",
  });
  return { report: parsed.report, assets: [] };
}
