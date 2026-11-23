import type { PluginClientContext } from "@getpaseo/plugin/client";

/** The client context, for components that need APIs only it offers (playAudio). */
let current: PluginClientContext | null = null;

export function setClient(client: PluginClientContext | null): void {
  current = client;
}

export function getClient(): PluginClientContext | null {
  return current;
}
