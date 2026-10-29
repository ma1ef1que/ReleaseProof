import { DEFAULT_IMPORT_LIMITS, type ImportLimits } from "./file-validation";
import { ImportPipelineError } from "./import-errors";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export interface ZipEntryMetadata {
  path: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
}

export function inspectZipCentralDirectory(
  bytes: Uint8Array,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ZipEntryMetadata[] {
  if (bytes.byteLength < END_OF_CENTRAL_DIRECTORY_SIZE) {
    throw new ImportPipelineError("invalid_archive");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset === undefined) {
    throw new ImportPipelineError("invalid_archive");
  }

  const diskNumber = view.getUint16(endOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const commentLength = view.getUint16(endOffset + 20, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    endOffset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength !==
      bytes.byteLength
  ) {
    throw new ImportPipelineError("invalid_archive");
  }

  if (entryCount > limits.maxZipEntries) {
    throw new ImportPipelineError("too_many_entries");
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryEnd > endOffset ||
    centralDirectoryOffset > bytes.byteLength
  ) {
    throw new ImportPipelineError("invalid_archive");
  }

  const entries: ZipEntryMetadata[] = [];
  const paths = new Set<string>();
  let totalUncompressedBytes = 0;
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    ensureRange(view, cursor, 46, centralDirectoryEnd);
    if (view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_FILE_HEADER) {
      throw new ImportPipelineError("invalid_archive");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const startDisk = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const recordLength = 46 + fileNameLength + extraLength + entryCommentLength;

    ensureRange(view, cursor, recordLength, centralDirectoryEnd);

    if (
      startDisk !== 0 ||
      (flags & 0x0001) !== 0 ||
      ![0, 8].includes(compressionMethod)
    ) {
      throw new ImportPipelineError("invalid_archive");
    }

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ImportPipelineError("archive_too_large");
    }

    const fileNameStart = cursor + 46;
    const fileNameBytes = bytes.subarray(
      fileNameStart,
      fileNameStart + fileNameLength,
    );
    if (fileNameBytes.includes(0)) {
      throw new ImportPipelineError("unsafe_archive_path");
    }

    const rawPath = new TextDecoder().decode(fileNameBytes);
    const normalized = normalizeArchiveEntryPath(rawPath);
    const unixFileType = (externalAttributes >>> 16) & 0xf000;
    if (
      unixFileType !== 0 &&
      unixFileType !== 0x8000 &&
      unixFileType !== 0x4000
    ) {
      throw new ImportPipelineError("invalid_archive");
    }

    const isDirectory =
      normalized.isDirectory ||
      unixFileType === 0x4000 ||
      (externalAttributes & 0x10) !== 0;

    if (paths.has(normalized.path)) {
      throw new ImportPipelineError("invalid_archive");
    }
    paths.add(normalized.path);

    if (uncompressedSize > limits.maxSingleUncompressedBytes) {
      throw new ImportPipelineError("entry_too_large");
    }
    if (
      uncompressedSize >
      limits.maxTotalUncompressedBytes - totalUncompressedBytes
    ) {
      throw new ImportPipelineError("archive_too_large");
    }
    totalUncompressedBytes += uncompressedSize;

    entries.push({
      path: normalized.path,
      isDirectory,
      compressedSize,
      uncompressedSize,
    });
    cursor += recordLength;
  }

  if (cursor !== centralDirectoryEnd) {
    throw new ImportPipelineError("invalid_archive");
  }

  return entries;
}

export function normalizeArchiveEntryPath(rawPath: string): {
  path: string;
  isDirectory: boolean;
} {
  if (rawPath.length === 0 || rawPath.includes("\0")) {
    throw new ImportPipelineError("unsafe_archive_path");
  }

  const slashPath = rawPath.replaceAll("\\", "/");
  const isDirectory = slashPath.endsWith("/");
  if (
    slashPath.startsWith("/") ||
    /^[a-zA-Z]:/.test(slashPath) ||
    slashPath.startsWith("//")
  ) {
    throw new ImportPipelineError("unsafe_archive_path");
  }

  const segments = slashPath.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new ImportPipelineError("unsafe_archive_path");
  }

  const safeSegments = segments.filter(
    (segment) => segment.length > 0 && segment !== ".",
  );
  if (safeSegments.length === 0) {
    throw new ImportPipelineError("unsafe_archive_path");
  }

  return { path: safeSegments.join("/"), isDirectory };
}

function findEndOfCentralDirectory(view: DataView): number | undefined {
  const earliestOffset = Math.max(
    0,
    view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_ZIP_COMMENT_BYTES,
  );

  for (
    let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      const commentLength = view.getUint16(offset + 20, true);
      if (
        offset + END_OF_CENTRAL_DIRECTORY_SIZE + commentLength ===
        view.byteLength
      ) {
        return offset;
      }
    }
  }

  return undefined;
}

function ensureRange(
  view: DataView,
  offset: number,
  length: number,
  maximumOffset: number,
): void {
  if (
    offset < 0 ||
    length < 0 ||
    offset + length > maximumOffset ||
    offset + length > view.byteLength
  ) {
    throw new ImportPipelineError("invalid_archive");
  }
}
