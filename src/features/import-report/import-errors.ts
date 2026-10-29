export type ImportErrorCategory =
  | "unsupported_type"
  | "file_too_large"
  | "empty_file"
  | "invalid_archive"
  | "unsafe_archive_path"
  | "too_many_entries"
  | "archive_too_large"
  | "entry_too_large"
  | "report_not_found"
  | "ambiguous_report"
  | "empty_report"
  | "malformed_json"
  | "unsupported_report"
  | "worker_unavailable"
  | "worker_failure"
  | "cancelled"
  | "memory_limit"
  | "processing_failed";

const defaultMessages: Record<ImportErrorCategory, string> = {
  unsupported_type: "Choose a Playwright JSON report or ZIP bundle.",
  file_too_large: "The selected file exceeds the 50 MB import limit.",
  empty_file: "The selected file is empty.",
  invalid_archive: "The ZIP archive is invalid or could not be read.",
  unsafe_archive_path: "The ZIP contains an unsafe path and was rejected.",
  too_many_entries: "The ZIP contains more entries than the configured limit.",
  archive_too_large: "The ZIP expands beyond the configured size limit.",
  entry_too_large: "A ZIP entry exceeds its configured size limit.",
  report_not_found: "The ZIP does not contain a Playwright JSON report.",
  ambiguous_report:
    "The ZIP contains multiple possible JSON reports; include only one report or name it playwright-report.json.",
  empty_report: "The selected report file is empty.",
  malformed_json: "The selected file is not valid JSON.",
  unsupported_report:
    "This Playwright report version or format is not supported yet.",
  worker_unavailable: "The report parser could not be started in this browser.",
  worker_failure: "The report parser stopped unexpectedly. Please try again.",
  cancelled: "Import cancelled.",
  memory_limit:
    "The browser ran out of memory while reading this file. Try a smaller report.",
  processing_failed: "The file could not be processed safely.",
};

export class ImportPipelineError extends Error {
  readonly category: ImportErrorCategory;

  constructor(category: ImportErrorCategory, message?: string) {
    super(message ?? defaultMessages[category]);
    this.name = "ImportPipelineError";
    this.category = category;
  }
}

export interface ImportFailure {
  category: ImportErrorCategory;
  message: string;
}

export function toImportFailure(error: unknown): ImportFailure {
  if (error instanceof ImportPipelineError) {
    return { category: error.category, message: error.message };
  }

  if (error instanceof RangeError) {
    return {
      category: "memory_limit",
      message: defaultMessages.memory_limit,
    };
  }

  return {
    category: "processing_failed",
    message: defaultMessages.processing_failed,
  };
}

export function getImportErrorMessage(category: ImportErrorCategory): string {
  return defaultMessages[category];
}
