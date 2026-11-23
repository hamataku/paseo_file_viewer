import type { PluginClientContext, PluginPanelLocation } from "@getpaseo/plugin/client";

/**
 * Panels take no parameters, so a request to show a file goes through this
 * in-memory store: the opener records it, then opens or focuses the panel,
 * and every mounted viewer for that workspace shows the newest request.
 */
export interface OpenRequest {
  path: string;
  /** Base directory for a relative path. */
  cwd: string | null;
  lineStart?: number;
  /** Date.now() when requested; viewers ignore requests older than their mount. */
  at: number;
}

const requests = new Map<string, OpenRequest>();
const listeners = new Set<() => void>();

export function latestRequest(workspaceId: string): OpenRequest | undefined {
  return requests.get(workspaceId);
}

export function subscribeRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type OpenIn = "auto" | "explorer" | "workspace";

/** Last saved preference seen by a component, for callbacks that cannot use hooks. */
let rememberedOpenIn: OpenIn = "auto";
export function rememberOpenIn(value: OpenIn): void {
  rememberedOpenIn = value;
}
export function currentOpenIn(): OpenIn {
  return rememberedOpenIn;
}

export function openInViewer(
  client: PluginClientContext,
  input: {
    workspaceId: string;
    path: string;
    cwd: string | null;
    lineStart?: number;
    openIn: OpenIn;
    compact: boolean;
  },
): void {
  requests.set(input.workspaceId, {
    path: input.path,
    cwd: input.cwd,
    lineStart: input.lineStart,
    at: Date.now(),
  });
  for (const listener of listeners) listener();
  const location: PluginPanelLocation =
    input.openIn === "auto" ? (input.compact ? "workspace" : "explorer") : input.openIn;
  client.openPanel(VIEWER_PANEL_ID, { workspaceId: input.workspaceId, location });
}

export const VIEWER_PANEL_ID = "viewer";
