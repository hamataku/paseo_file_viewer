import { Platform } from "react-native";

/**
 * The only module that touches browser globals. Everything is gated on web;
 * native callers get null and show a fallback.
 */
declare const atob: (data: string) => string;
declare const Blob: new (parts: unknown[], options: { type: string }) => unknown;
declare const URL: {
  createObjectURL(blob: unknown): string;
  revokeObjectURL(url: string): void;
};
interface MediaElement {
  src: string;
  controls: boolean;
  preload: string;
  style: Record<string, string>;
  pause(): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
}
interface HostElement {
  appendChild(child: unknown): void;
  ownerDocument?: { createElement(tag: string): MediaElement };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createBlobUrl(data: string | Uint8Array, mimeType: string): string | null {
  if (Platform.OS !== "web") return null;
  const bytes = typeof data === "string" ? base64ToBytes(data) : data;
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function revokeBlobUrl(url: string | null): void {
  if (Platform.OS !== "web" || !url) return;
  URL.revokeObjectURL(url);
}

/**
 * Mounts a native <audio> or <video> player with browser controls inside a
 * React Native Web View (whose ref is a DOM element on web). Returns cleanup.
 */
export function mountMediaPlayer(
  parent: unknown,
  url: string,
  kind: "audio" | "video",
  label: string,
): (() => void) | null {
  const host = parent as HostElement | null;
  if (Platform.OS !== "web" || !host?.ownerDocument) return null;
  const element = host.ownerDocument.createElement(kind);
  element.controls = true;
  element.preload = "metadata";
  element.src = url;
  element.setAttribute("aria-label", label);
  element.setAttribute("playsinline", "");
  Object.assign(element.style, {
    width: "100%",
    maxHeight: kind === "video" ? "100%" : "",
    display: "block",
    outline: "none",
  });
  host.appendChild(element);
  return () => {
    element.pause();
    element.src = "";
    element.remove();
  };
}
