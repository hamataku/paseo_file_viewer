import {
  type PluginWorkspacePanelProps,
  useRpc,
  useSubscription,
  useTabState,
  useTranslation,
} from "@getpaseo/plugin/client";
import { copyText, Icon, Loading, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import { readFile, watchFile } from "../shared/contracts";
import { basenameOf, dirnameOf, iconForKind, kindForPath } from "../shared/file-types";
import { MediaPreview } from "./media";
import { messages } from "./messages";
import { latestRequest, subscribeRequests } from "./open-request";
import {
  FramePreview,
  ImagePreview,
  MarkdownPreview,
  Notice,
  prettyJson,
  SourcePreview,
  TablePreview,
} from "./previews";

const entrySchema = z.object({
  path: z.string(),
  cwd: z.string().nullable(),
  lineStart: z.number().optional(),
});
const stateSchema = z.object({
  current: entrySchema.nullable(),
  history: z.array(entrySchema),
  view: z.enum(["preview", "source"]),
});
type ViewerState = z.output<typeof stateSchema>;
type Entry = z.output<typeof entrySchema>;

const DEFAULT_STATE: ViewerState = { current: null, history: [], view: "preview" };
const MAX_HISTORY = 20;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ViewerPanel({ theme, layout, tab, workspaceId }: PluginWorkspacePanelProps) {
  const { t } = useTranslation(messages);
  const toast = useToast();
  const [state, setState] = useTabState(tab, stateSchema, DEFAULT_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Apply open requests issued after this panel mounted, or just before it
  // mounted (the request that created the panel).
  const mountedAt = useRef(Date.now() - 10_000);
  const request = useSyncExternalStore(subscribeRequests, () => latestRequest(workspaceId));
  useEffect(() => {
    if (!request || request.at <= mountedAt.current) return;
    mountedAt.current = request.at;
    const entry: Entry = { path: request.path, cwd: request.cwd, lineStart: request.lineStart };
    const previous = stateRef.current;
    setState({
      ...previous,
      current: entry,
      history: [entry, ...previous.history.filter((h) => h.path !== entry.path)].slice(0, MAX_HISTORY),
    });
  }, [request, setState]);

  const current = state.current;
  const read = useRpc(readFile);
  const queryClient = useQueryClient();
  const queryKey = ["read", current?.path, current?.cwd];
  const file = useQuery({
    queryKey,
    enabled: !!current,
    queryFn: () => read({ path: current!.path, cwd: current!.cwd }),
  });


  const styles = useMemo(
    () => ({
      root: { flex: 1, backgroundColor: theme.colors.surface0 },
      header: {
        paddingHorizontal: layout.compact ? 12 : 16,
        paddingTop: 10,
        paddingBottom: 8,
        gap: 6,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      },
      titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const, flexShrink: 1 },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, alignItems: "center" as const },
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surface2,
      },
      buttonActive: { backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.foreground, fontSize: 12 },
      buttonTextActive: { color: theme.colors.accentForeground, fontSize: 12 },
      historyChip: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      empty: { flex: 1, padding: 24, gap: 8, justifyContent: "center" as const, alignItems: "center" as const },
      emptyTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      emptyText: { color: theme.colors.foregroundMuted, textAlign: "center" as const },
      banner: { color: theme.colors.statusWarning, fontSize: 12 },
      error: { color: theme.colors.statusDanger },
    }),
    [theme, layout.compact],
  );

  const select = (entry: Entry) =>
    setState({
      ...state,
      current: entry,
      history: [entry, ...state.history.filter((h) => h.path !== entry.path)],
    });

  const history =
    state.history.length > 1 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {state.history.map((entry) => {
          const active = entry.path === current?.path;
          return (
            <Pressable
              key={entry.path}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={entry.path}
              onPress={() => select(entry)}
              style={[styles.historyChip, active && { backgroundColor: theme.colors.surface2 }]}
            >
              <Text style={active ? styles.buttonText : styles.meta} numberOfLines={1}>
                {basenameOf(entry.path)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  if (!current) {
    return (
      <View style={[styles.root, styles.empty]}>
        <Icon name="FileSearch" size={28} color={theme.colors.foregroundMuted} />
        <Text style={styles.emptyTitle}>{t("emptyTitle")}</Text>
        <Text style={styles.emptyText}>{t("empty")}</Text>
      </View>
    );
  }

  const data = file.data;
  const absolutePath = data?.absolutePath ?? current.path;
  const kind = data?.status === "ok" ? data.kind : kindForPath(current.path);
  const hasSourceToggle = kind === "markdown" || kind === "html" || kind === "svg";
  const view = hasSourceToggle ? state.view : "preview";

  const button = (
    label: string,
    icon: string,
    onPress: () => void,
    active = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive]}
    >
      <Icon name={icon} size={13} color={active ? theme.colors.accentForeground : theme.colors.foreground} />
      {layout.compact ? null : (
        <Text style={active ? styles.buttonTextActive : styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );

  let body: React.ReactNode;
  if (file.isLoading || !data) {
    body = file.error ? (
      <Notice text={String(file.error)} theme={theme} />
    ) : (
      <Loading />
    );
  } else if (data.status === "error") {
    const key = ({ not_found: "notFound", not_a_file: "notAFile", too_large: "tooLarge", unreadable: "unreadable" } as const)[data.code];
    body = (
      <View style={{ padding: 20, gap: 6 }}>
        <Text style={styles.error}>{t(key)}</Text>
        <Text style={styles.meta} selectable>
          {data.absolutePath}
        </Text>
      </View>
    );
  } else {
    const text = data.text ?? "";
    switch (data.kind) {
      case "markdown":
        body =
          view === "source" ? (
            <SourcePreview text={text} theme={theme} lineStart={current.lineStart} />
          ) : (
            <MarkdownPreview text={text} compact={layout.compact} />
          );
        break;
      case "html":
        body =
          view === "source" ? (
            <SourcePreview text={text} theme={theme} lineStart={current.lineStart} />
          ) : (
            <FramePreview
              base64={data.base64 ?? ""}
              mimeType="text/html"
              theme={theme}
              fallback={
                <View style={{ flex: 1 }}>
                  <Notice text={t("htmlUnavailable")} theme={theme} />
                  <SourcePreview text={text} theme={theme} />
                </View>
              }
            />
          );
        break;
      case "svg":
        body =
          view === "source" ? (
            <SourcePreview text={text} theme={theme} />
          ) : (
            <ImagePreview base64={data.base64 ?? ""} mimeType="image/svg+xml" theme={theme} />
          );
        break;
      case "image":
        body = <ImagePreview base64={data.base64 ?? ""} mimeType={data.mimeType} theme={theme} />;
        break;
      case "pdf":
        body = (
          <FramePreview
            base64={data.base64 ?? ""}
            mimeType="application/pdf"
            theme={theme}
            fallback={<Notice text={t("pdfUnavailable")} theme={theme} />}
          />
        );
        break;
      case "csv":
        body = (
          <TablePreview
            text={text}
            delimiter={absolutePath.toLowerCase().endsWith(".tsv") ? "\t" : ","}
            theme={theme}
          />
        );
        break;
      case "json":
        body = <SourcePreview text={prettyJson(text)} theme={theme} lineStart={current.lineStart} />;
        break;
      case "text":
        body = <SourcePreview text={text} theme={theme} lineStart={current.lineStart} />;
        break;
      case "audio":
      case "video":
        body = (
          <MediaPreview
            path={data.absolutePath}
            mimeType={data.mimeType}
            kind={data.kind}
            modifiedAt={data.modifiedAt}
            theme={theme}
          />
        );
        break;
      default:
        body = <Notice text={t("binary")} theme={theme} />;
    }
  }

  return (
    <View style={styles.root}>
      {data?.status === "ok" ? (
        <FileWatcher
          path={data.absolutePath}
          onChange={() => void queryClient.invalidateQueries({ queryKey })}
        />
      ) : null}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name={iconForKind(kind)} size={16} color={theme.colors.foregroundMuted} />
          <Text style={styles.title} numberOfLines={1}>
            {basenameOf(absolutePath)}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1} selectable>
          {dirnameOf(absolutePath)}
          {data?.status === "ok" ? `  ·  ${formatBytes(data.size)}` : ""}
          {current.lineStart ? `  ·  ${t("line", { line: current.lineStart })}` : ""}
        </Text>
        <View style={styles.actions}>
          {hasSourceToggle ? (
            <>
              {button(t("preview"), "Eye", () => setState({ ...state, view: "preview" }), view === "preview")}
              {button(t("source"), "Code", () => setState({ ...state, view: "source" }), view === "source")}
            </>
          ) : null}
          {button(t("reload"), "RefreshCw", () => void file.refetch())}
          {button(t("copyPath"), "Copy", () => {
            void copyText(absolutePath).then(() => toast.show(t("copied"), { variant: "success" }));
          })}
        </View>
        {history}
        {data?.status === "ok" && data.truncated ? (
          <Text style={styles.banner}>{t("truncated", { size: formatBytes(data.text?.length ?? 0) })}</Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

/** Re-reads the file when it changes on disk; mounted only while a file is shown. */
function FileWatcher({ path, onChange }: { path: string; onChange: () => void }) {
  useSubscription(watchFile, { path }, onChange);
  return null;
}
