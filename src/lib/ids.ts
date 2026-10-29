export function createStableId(parts: readonly string[]): string {
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  let hash = 0xcbf29ce484222325n;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(36);
}
