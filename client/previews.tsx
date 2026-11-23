import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useTranslation } from "@getpaseo/plugin/client";
import { DocumentFrame, Markdown, ScrollView } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  ScrollView as HorizontalScroll,
  type ScrollView as NativeScrollView,
  Text,
  View,
} from "react-native";
import { messages } from "./messages";
import { createBlobUrl, revokeBlobUrl } from "./web";

type Theme = PluginHostProps["theme"];

const LINE_HEIGHT = 19;
const MONO = { fontFamily: "monospace" as const };

export function MarkdownPreview({ text, compact }: { text: string; compact: boolean }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: compact ? 14 : 22 }}>
      <Markdown>{text}</Markdown>
    </ScrollView>
  );
}

export function SourcePreview({
  text,
  theme,
  lineStart,
}: {
  text: string;
  theme: Theme;
  lineStart?: number;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const gutter = String(lines.length).length;
  // One Text per chunk keeps very long files responsive.
  const chunks = useMemo(() => {
    const size = 400;
    const result: Array<{ start: number; body: string; numbers: string }> = [];
    for (let i = 0; i < lines.length; i += size) {
      const slice = lines.slice(i, i + size);
      result.push({
        start: i,
        body: slice.join("\n"),
        numbers: slice.map((_, j) => String(i + j + 1).padStart(gutter, " ")).join("\n"),
      });
    }
    return result;
  }, [lines, gutter]);
  const lineStyle = { ...MONO, fontSize: 12.5, lineHeight: LINE_HEIGHT };
  const scroller = useRef<NativeScrollView>(null);
  const jumpTo = () => {
    if (lineStart && lineStart > 1) {
      scroller.current?.scrollTo({ y: (lineStart - 1) * LINE_HEIGHT, animated: false });
    }
  };
  return (
    <ScrollView
      ref={scroller}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 12 }}
      onContentSizeChange={jumpTo}
    >
      <HorizontalScroll horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 14 }}>
          <View>
            {chunks.map((chunk) => (
              <Text
                key={chunk.start}
                selectable={false}
                style={[lineStyle, { color: theme.colors.foregroundMuted, textAlign: "right" }]}
              >
                {chunk.numbers}
              </Text>
            ))}
          </View>
          <View>
            {chunks.map((chunk) => (
              <Text key={chunk.start} selectable style={[lineStyle, { color: theme.colors.foreground }]}>
                {chunk.body}
              </Text>
            ))}
          </View>
        </View>
      </HorizontalScroll>
    </ScrollView>
  );
}

export function ImagePreview({
  base64,
  mimeType,
  theme,
}: {
  base64: string;
  mimeType: string;
  theme: Theme;
}) {
  const uri = `data:${mimeType};base64,${base64}`;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => alive && setSize({ width, height }),
      () => alive && setSize({ width: 4, height: 3 }),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface1 }}
      contentContainerStyle={{ padding: 16, alignItems: "center" }}
    >
      {size ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{
            width: "100%",
            maxWidth: size.width,
            aspectRatio: size.width / Math.max(size.height, 1),
          }}
        />
      ) : null}
    </ScrollView>
  );
}

/** PDF and HTML through DocumentFrame on web; native shows a notice. */
export function FramePreview({
  base64,
  mimeType,
  theme,
  fallback,
}: {
  base64: string;
  mimeType: string;
  theme: Theme;
  fallback: React.ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = createBlobUrl(base64, mimeType);
    setUrl(next);
    return () => revokeBlobUrl(next);
  }, [base64, mimeType]);
  if (!url) return <>{fallback}</>;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <DocumentFrame url={url} />
    </View>
  );
}

export function Notice({ text, theme }: { text: string; theme: Theme }) {
  return (
    <View style={{ padding: 20 }}>
      <Text style={{ color: theme.colors.foregroundMuted }}>{text}</Text>
    </View>
  );
}

const MAX_ROWS = 1000;

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length > MAX_ROWS) break;
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function TablePreview({
  text,
  delimiter,
  theme,
}: {
  text: string;
  delimiter: string;
  theme: Theme;
}) {
  const { t } = useTranslation(messages);
  const rows = useMemo(() => parseDelimited(text, delimiter), [text, delimiter]);
  const totalLines = useMemo(() => text.split("\n").filter((l) => l.length > 0).length, [text]);
  const shown = rows.slice(0, MAX_ROWS);
  const columns = Math.max(0, ...shown.map((r) => r.length));
  const widths = useMemo(() => {
    const result: number[] = [];
    for (let c = 0; c < columns; c += 1) {
      let longest = 3;
      for (const r of shown.slice(0, 200)) longest = Math.max(longest, Math.min((r[c] ?? "").length, 40));
      result.push(longest * 7.5 + 20);
    }
    return result;
  }, [shown, columns]);
  const cell = { paddingVertical: 5, paddingHorizontal: 10, fontSize: 12.5 };
  return (
    <ScrollView style={{ flex: 1 }}>
      <HorizontalScroll horizontal>
        <View style={{ padding: 12 }}>
          {shown.map((r, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: rowIndex === 0 ? theme.colors.surface1 : undefined,
              }}
            >
              {Array.from({ length: columns }, (_, c) => (
                <Text
                  key={c}
                  numberOfLines={1}
                  selectable
                  style={[
                    cell,
                    {
                      width: widths[c],
                      color: theme.colors.foreground,
                      fontWeight: rowIndex === 0 ? ("600" as const) : ("400" as const),
                    },
                  ]}
                >
                  {r[c] ?? ""}
                </Text>
              ))}
            </View>
          ))}
          {totalLines > MAX_ROWS ? (
            <Text style={{ color: theme.colors.foregroundMuted, marginTop: 8 }}>
              {t("rows", { shown: MAX_ROWS, total: totalLines })}
            </Text>
          ) : null}
        </View>
      </HorizontalScroll>
    </ScrollView>
  );
}

export function prettyJson(text: string): string {
  if (text.length > 1024 * 1024) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
