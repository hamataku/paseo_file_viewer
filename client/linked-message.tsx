import {
  type PluginClientContext,
  type PluginTimelineItemProps,
  useAgent,
  useRpc,
  useSettings,
  useTranslation,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { Icon, Markdown } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { preferences, resolvePaths } from "../shared/contracts";
import { basenameOf, iconForKind, kindForPath } from "../shared/file-types";
import { linkMessage, scanMessage, type LinkedFile } from "../shared/paths";
import { messages } from "./messages";
import { openInViewer, rememberOpenIn } from "./open-request";

export const LINKED_MESSAGE_KIND = "linked-message";

export const linkedMessageSchema = z.object({
  text: z.string(),
  candidates: z.array(z.string()),
});

const MAX_CHIPS = 8;

export function createLinkedMessage(client: PluginClientContext) {
  return function LinkedMessage({
    agentId,
    item,
    theme,
    layout,
  }: PluginTimelineItemProps<z.output<typeof linkedMessageSchema>>) {
    const { t } = useTranslation(messages);
    const agent = useAgent(agentId, (a) => ({ cwd: a.cwd, workspaceId: a.workspaceId }));
    const workspaceDirectory = useWorkspace(agent?.workspaceId ?? "", (w) => w.directory);
    const settings = useSettings(preferences);
    const enabled = settings.status !== "ready" || settings.values.linkMessages;
    const detectBarePaths = settings.status !== "ready" || settings.values.detectBarePaths;
    if (settings.status === "ready") rememberOpenIn(settings.values.openIn);
    const resolve = useRpc(resolvePaths);
    const { text, candidates } = item.data;

    const resolved = useQuery({
      queryKey: ["resolve", agent?.cwd, workspaceDirectory, candidates],
      enabled: enabled && !!agent && candidates.length > 0,
      staleTime: 30_000,
      queryFn: () =>
        resolve({ candidates, cwd: agent!.cwd, workspaceDirectory: workspaceDirectory ?? null }),
    });

    const linked = useMemo(() => {
      if (!enabled || !resolved.data) return null;
      return linkMessage(text, scanMessage(text), resolved.data.files, { detectBarePaths });
    }, [enabled, detectBarePaths, resolved.data, text]);

    const styles = useMemo(
      () => ({
        root: { paddingVertical: 4, gap: 10 },
        bar: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
        chip: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 6,
          maxWidth: layout.compact ? 260 : 360,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        chipText: { color: theme.colors.foreground, fontSize: 13, flexShrink: 1 },
        chipMuted: { color: theme.colors.foregroundMuted, fontSize: 11 },
      }),
      [theme, layout.compact],
    );

    const files = linked?.files ?? [];
    const open = (file: LinkedFile) => {
      if (!agent) return;
      openInViewer(client, {
        workspaceId: agent.workspaceId,
        path: file.absolutePath,
        cwd: agent.cwd,
        lineStart: file.lineStart,
        openIn: settings.status === "ready" ? settings.values.openIn : "auto",
        compact: layout.compact,
      });
    };

    return (
      <View style={styles.root}>
        <Markdown>{linked?.markdown ?? text}</Markdown>
        {files.length > 0 ? (
          <View style={styles.bar} accessibilityLabel={t("filesInMessage", { count: files.length })}>
            {files.slice(0, MAX_CHIPS).map((file) => (
              <Pressable
                key={file.absolutePath}
                accessibilityRole="button"
                accessibilityLabel={`${t("viewerTitle")}: ${file.absolutePath}`}
                onPress={() => open(file)}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                  styles.chip,
                  (hovered || pressed) && { backgroundColor: theme.colors.surface2 },
                ]}
              >
                <Icon
                  name={iconForKind(kindForPath(file.absolutePath))}
                  size={14}
                  color={theme.colors.foregroundMuted}
                />
                <Text style={styles.chipText} numberOfLines={1}>
                  {basenameOf(file.absolutePath)}
                </Text>
                {!file.insideWorkspace ? (
                  <Text style={styles.chipMuted} numberOfLines={1}>
                    {t("outsideWorkspace")}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {files.length > MAX_CHIPS ? (
              <Text style={[styles.chipMuted, { alignSelf: "center" }]}>
                +{files.length - MAX_CHIPS}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };
}
