import { Platform } from "react-native";

/**
 * Opens the browser PDF viewer with the page sidebar closed. Chromium reads
 * `pagemode`, Adobe-style viewers read `navpanes`. Fetching a blob URL ignores
 * the fragment, so DocumentFrame still sees the same document.
 */
export function pdfViewerUrl(url: string): string {
  if (Platform.OS !== "web" || url.includes("#")) return url;
  return `${url}#pagemode=none&navpanes=0`;
}
