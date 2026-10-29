const SUPPORTED_IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function isSupportedImageContentType(contentType: string): boolean {
  return SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}

export async function matchesImageSignature(
  blob: Blob,
  contentType: string,
): Promise<boolean> {
  const normalizedType = contentType.toLowerCase();
  if (!isSupportedImageContentType(normalizedType)) {
    return false;
  }

  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  if (normalizedType === "image/png") {
    return (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a &&
      bytes[12] === 0x49 &&
      bytes[13] === 0x48 &&
      bytes[14] === 0x44 &&
      bytes[15] === 0x52 &&
      bytes.slice(16, 20).some((value) => value !== 0) &&
      bytes.slice(20, 24).some((value) => value !== 0)
    );
  }
  if (normalizedType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
