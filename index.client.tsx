import type { PluginClientContext } from "@getpaseo/plugin/client";
import { scanMessage } from "./shared/paths";
import { createLinkedMessage, LINKED_MESSAGE_KIND, linkedMessageSchema } from "./client/linked-message";
import { messages } from "./client/messages";
import { currentOpenIn, openInViewer, VIEWER_PANEL_ID } from "./client/open-request";
import { setClient } from "./client/client-ref";
import { addFilePanels } from "./client/file-panels";
import { SettingsScreen } from "./client/settings-screen";
import { ViewerPanel } from "./client/viewer-panel";

export default function contribute(client: PluginClientContext) {
  setClient(client);
  const removers = [
    ...addFilePanels(client),
    client.addWorkspacePanel({
      id: VIEWER_PANEL_ID,
      title: messages.message("viewerTitle"),
      icon: "FileSearch",
      locations: ["workspace", "explorer"],
      Component: ViewerPanel,
    }),

    // Completed assistant replies that mention something path-like are drawn by
    // the plugin, which checks the paths on the daemon and links existing files.
    // Streaming replies and replies without paths keep Paseo's own rendering.
    client.addTimelineTransformer({
      id: "link-file-paths",
      query: { itemType: "assistant_message" },
      transform({ item, phase }) {
        if (phase !== "complete") return undefined;
        const { candidates } = scanMessage(item.text);
        if (candidates.length === 0) return undefined;
        return {
          items: [
            {
              type: "plugin",
              kind: LINKED_MESSAGE_KIND,
              version: 1,
              data: { text: item.text, candidates },
            },
          ],
        };
      },
    }),
    client.addTimelineRenderer({
      kind: LINKED_MESSAGE_KIND,
      version: 1,
      schema: linkedMessageSchema,
      Component: createLinkedMessage(client),
    }),

    client.addSlashCommand({
      name: "view",
      description: messages.message("viewCommand"),
      argumentHint: messages.message("viewHint"),
      context: "agent",
      onSubmit({ args, agent }) {
        const path = args.trim().replace(/^["'`]|["'`]$/g, "");
        if (!path) throw new Error(client.i18n.t(messages, "missingPath"));
        openInViewer(client, {
          workspaceId: agent.workspaceId,
          path,
          cwd: agent.cwd,
          openIn: currentOpenIn(),
          compact: false,
        });
      },
    }),

    client.addCommandCenterItem({
      id: "open-viewer",
      title: messages.message("openViewer"),
      icon: "FileSearch",
      keywords: ["file", "preview", "markdown", "pdf", "viewer"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel(VIEWER_PANEL_ID, currentOpenIn() === "workspace" ? undefined : { location: "explorer" });
      },
    }),

    client.addSettingsScreen({
      id: "preferences",
      title: messages.message("settingsTitle"),
      icon: "Settings",
      Component: SettingsScreen,
    }),
  ];
  return () => {
    setClient(null);
    for (const remove of removers) remove();
  };
}
