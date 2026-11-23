const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without browser or Node globals, for native playback. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    chunk +=
      ALPHABET[a >> 2]! +
      ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]! +
      (b === undefined ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!) +
      (c === undefined ? "=" : ALPHABET[c & 63]!);
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}
