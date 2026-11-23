import { type PluginHostProps, useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Icon, Loading, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { readBytes } from "../shared/contracts";
import { basenameOf } from "../shared/file-types";
import { bytesToBase64 } from "./base64";
import { getClient } from "./client-ref";
import { messages } from "./messages";
import { createBlobUrl, mountMediaPlayer, revokeBlobUrl } from "./web";

type Theme = PluginHostProps["theme"];

interface MediaProps {
  path: string;
  mimeType: string;
  kind: "audio" | "video";
  modifiedAt: string;
  theme: Theme;
}

export function MediaPreview(props: MediaProps) {
  return Platform.OS === "web" ? <WebMedia {...props} /> : <NativeMedia {...props} />;
}

/** Browser player with seeking, volume and full screen, from a blob URL. */
function WebMedia({ path, mimeType, kind, modifiedAt, theme }: MediaProps) {
  const read = useRpc(readBytes);
  const bytes = useQuery({
    queryKey: ["bytes", path, modifiedAt],
    queryFn: () => read({ path }),
    gcTime: 0,
  });
  const host = useRef<View>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bytes.data) return;
    const url = createBlobUrl(bytes.data, mimeType);
    if (!url) return;
    let unmount: (() => void) | null = null;
    try {
      unmount = mountMediaPlayer(host.current, url, kind, basenameOf(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    return () => {
      unmount?.();
      revokeBlobUrl(url);
    };
  }, [bytes.data, mimeType, kind, path]);

  if (bytes.isLoading) return <Loading />;
  const failure = error ?? (bytes.error ? String(bytes.error) : null);
  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        justifyContent: "center",
        backgroundColor: kind === "video" ? theme.colors.surface1 : theme.colors.surface0,
      }}
    >
      {failure ? <Text style={{ color: theme.colors.statusDanger }}>{failure}</Text> : null}
      <View ref={host} style={kind === "video" ? { flex: 1, justifyContent: "center" } : undefined} />
    </View>
  );
}

/** Native apps play audio through Paseo's player; video needs the desktop or web app. */
function NativeMedia({ path, mimeType, kind, theme }: MediaProps) {
  const { t } = useTranslation(messages);
  const read = useRpc(readBytes);
  const toast = useToast();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  if (kind === "video") {
    return (
      <View style={{ padding: 20 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>{t("videoUnavailable")}</Text>
      </View>
    );
  }

  const play = async () => {
    const client = getClient();
    if (!client) return;
    try {
      setState("loading");
      const bytes = await read({ path });
      setState("playing");
      await client.playAudio({ base64: bytesToBase64(bytes), mimeType });
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    } finally {
      setState("idle");
    }
  };

  return (
    <View style={{ flex: 1, padding: 24, gap: 12, alignItems: "center", justifyContent: "center" }}>
      <Icon name="FileAudio" size={36} color={theme.colors.foregroundMuted} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("play")}
        disabled={state !== "idle"}
        onPress={() => void play()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 18,
          borderRadius: 10,
          backgroundColor: theme.colors.accent,
          opacity: state === "idle" ? 1 : 0.6,
        }}
      >
        <Icon name="Play" size={16} color={theme.colors.accentForeground} />
        <Text style={{ color: theme.colors.accentForeground }}>
          {state === "playing" ? t("playing") : t("play")}
        </Text>
      </Pressable>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
        {t("nativeAudioHint")}
      </Text>
    </View>
  );
}
