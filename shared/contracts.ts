import { defineRpc, defineSettings, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

/** Resolve path candidates from a message to existing files on the daemon host. */
export const resolvePaths = defineRpc({
  name: "files.resolve",
  input: z.object({
    candidates: z.array(z.string()).max(400),
    /** Agent working directory; relative candidates resolve here first. */
    cwd: z.string(),
    /** Workspace directory; decides whether Paseo's file tab can open a file. */
    workspaceDirectory: z.string().nullable(),
  }),
  output: z.object({
    files: z.record(
      z.string(),
      z.object({
        absolutePath: z.string(),
        insideWorkspace: z.boolean(),
      }),
    ),
  }),
});

export const fileKindSchema = z.enum([
  "markdown",
  "html",
  "image",
  "svg",
  "pdf",
  "csv",
  "json",
  "text",
  "audio",
  "video",
  "binary",
]);

/** Read a file for the viewer panel. */
export const readFile = defineRpc({
  name: "files.read",
  input: z.object({
    path: z.string(),
    /** Base directory for a relative path. */
    cwd: z.string().nullable(),
  }),
  output: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      absolutePath: z.string(),
      kind: fileKindSchema,
      size: z.number(),
      modifiedAt: z.string(),
      mimeType: z.string(),
      /** UTF-8 text for text kinds. */
      text: z.string().optional(),
      /** Base64 bytes for images, SVG, PDF, and HTML. */
      base64: z.string().optional(),
      /** The content was cut at the size limit. */
      truncated: z.boolean(),
    }),
    z.object({
      status: z.literal("error"),
      absolutePath: z.string(),
      code: z.enum(["not_found", "not_a_file", "too_large", "unreadable"]),
      message: z.string(),
    }),
  ]),
});

/** Raw bytes for media playback; crosses the wire as binary, not base64. */
export const readBytes = defineRpc({
  name: "files.read-bytes",
  input: z.object({ path: z.string() }),
  output: z.instanceof(Uint8Array),
});

/** Emits whenever the watched file changes or disappears. */
export const watchFile = defineSubscription({
  name: "files.watch",
  input: z.object({ path: z.string() }),
  event: z.object({ modifiedAt: z.string().nullable() }),
});

export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Turn file links in agent replies into working links and show the file bar. */
    linkMessages: z.boolean().default(true),
    /** Also find file paths agents wrote without a link (older chats, missed instructions). */
    detectBarePaths: z.boolean().default(true),
    /** Ask new agents to write files as Markdown links to absolute paths. */
    instructAgents: z.boolean().default(true),
    /** Where the viewer opens: beside the chat, as a tab, or decided by window width. */
    openIn: z.enum(["auto", "explorer", "workspace"]).default("auto"),
  }),
});
