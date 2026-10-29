import { ImportPipelineError, type ImportFailure } from "./import-errors";

const megabyte = 1024 * 1024;

export interface ImportLimits {
  maxCompressedFileBytes: number;
  maxZipEntries: number;
  maxTotalUncompressedBytes: number;
  maxSingleUncompressedBytes: number;
}

export const DEFAULT_IMPORT_LIMITS: Readonly<ImportLimits> = {
  maxCompressedFileBytes: 50 * megabyte,
  maxZipEntries: 5_000,
  maxTotalUncompressedBytes: 200 * megabyte,
  maxSingleUncompressedBytes: 50 * megabyte,
};

export type ImportFileType = "json" | "zip";

export type FileValidationResult =
  { ok: true; type: ImportFileType } | { ok: false; error: ImportFailure };

export function validateImportFile(
  file: Pick<File, "name" | "size">,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): FileValidationResult {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "json" && extension !== "zip") {
    return {
      ok: false,
      error: new ImportPipelineError("unsupported_type"),
    };
  }

  if (file.size === 0) {
    return { ok: false, error: new ImportPipelineError("empty_file") };
  }

  if (file.size > limits.maxCompressedFileBytes) {
    return { ok: false, error: new ImportPipelineError("file_too_large") };
  }

  return { ok: true, type: extension };
}

export function hasZipSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return false;
  }

  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06)
  );
}
