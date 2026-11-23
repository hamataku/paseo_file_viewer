import {
  type PluginClientContext,
  type PluginFilePanelProps,
  useFileUrl,
} from "@getpaseo/plugin/client";
import { DocumentFrame, Loading } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { pdfViewerUrl } from "./pdf-url";
import { kindForPath, mimeForPath } from "../shared/file-types";
import { MediaPreview } from "./media";

/**
 * Paseo's file tab has no built-in panel for PDF, audio or video, so links to
 * them showed "Binary preview unavailable". These panels fill that gap.
 */
function PdfPanel({ file, theme }: PluginFilePanelProps) {
  const url = useFileUrl(file);
  if (url.status === "loading") return <Loading />;
  if (url.status === "error") {
    return <Text style={{ color: theme.colors.statusDanger, padding: 20 }}>{url.error.message}</Text>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <DocumentFrame url={pdfViewerUrl(url.url)} />
    </View>
  );
}

function MediaPanel({ file, theme }: PluginFilePanelProps) {
  const kind = kindForPath(file.path);
  if (kind !== "audio" && kind !== "video") return null;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <MediaPreview
        path={file.path}
        mimeType={mimeForPath(file.path)}
        kind={kind}
        modifiedAt={file.modifiedAt}
        theme={theme}
      />
    </View>
  );
}

export function addFilePanels(client: PluginClientContext): Array<() => void> {
  return [
    client.addFilePanel({
      id: "pdf",
      title: "PDF",
      icon: "FileType2",
      files: { extensions: ["pdf"] },
      Component: PdfPanel,
    }),
    client.addFilePanel({
      id: "media",
      title: "Audio and video",
      icon: "FileVideo",
      files: {
        extensions: ["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "weba", "mp4", "m4v", "webm", "mov", "ogv"],
      },
      Component: MediaPanel,
    }),
  ];
}
