import type { PluginServerContext } from "@getpaseo/plugin/server";
import { preferences, readBytes, readFile, resolvePaths, watchFile } from "./shared/contracts";
import { handleReadBytes, handleReadFile, handleResolvePaths, watchPath } from "./server/files";
import { FILE_LINK_INSTRUCTION } from "./server/instructions";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  server.handle(resolvePaths, handleResolvePaths);
  server.handle(readFile, handleReadFile);
  server.handle(readBytes, handleReadBytes);
  server.handle(watchFile, ({ path }, { push, signal }) => {
    watchPath(path, push, signal);
  });

  // Asks agents to write files as Markdown links. Applied on each session open,
  // so existing agents pick it up the next time they reopen. Not saved on the agent.
  const removeHook = server.addHook("agent.open.before", async ({ request }) => {
    if (request.background || request.purpose !== "interactive") return;
    const current = await settings.read();
    if (current.status === "ready" && !current.values.instructAgents) return;
    return {
      ...request,
      appendSystemPrompt: [...(request.appendSystemPrompt ?? []), FILE_LINK_INSTRUCTION],
    };
  });
  return () => removeHook();
}
