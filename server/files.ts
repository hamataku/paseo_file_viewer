import { watchFile as fsWatchFile, unwatchFile, type Stats } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { kindForPath, mimeForPath, type FileKind } from "../shared/file-types";
import type { readBytes, readFile, resolvePaths } from "../shared/contracts";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_BYTES = 40 * 1024 * 1024;
/** One RPC value carries at most 100 MiB less framing. */
const MAX_MEDIA_BYTES = 95 * 1024 * 1024;
const SNIFF_BYTES = 8192;

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(homedir(), value.slice(2));
  return value;
}

function toAbsolute(candidate: string, base: string | null): string {
  let value = candidate.trim();
  if (/^file:\/\//i.test(value)) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      // Leave as is.
    }
  }
  value = expandHome(value);
  if (path.isAbsolute(value)) return path.normalize(value);
  return path.resolve(base ?? homedir(), value);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function statFile(absolutePath: string): Promise<Stats | null> {
  try {
    const stats = await stat(absolutePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

/** Canonical paths so symlinks do not make a workspace file look external. */
async function canonical(value: string): Promise<string> {
  try {
    return await realpath(value);
  } catch {
    return value;
  }
}

export async function handleResolvePaths(
  input: RpcInput<typeof resolvePaths>,
): Promise<RpcOutput<typeof resolvePaths>> {
  const files: RpcOutput<typeof resolvePaths>["files"] = {};
  const workspace = input.workspaceDirectory ? await canonical(input.workspaceDirectory) : null;
  const bases = [...new Set([input.cwd, input.workspaceDirectory].filter((b): b is string => !!b))];

  await Promise.all(
    input.candidates.map(async (candidate) => {
      const tries = path.isAbsolute(expandHome(candidate))
        ? [toAbsolute(candidate, null)]
        : bases.map((base) => toAbsolute(candidate, base));
      for (const absolutePath of tries) {
        if (await statFile(absolutePath)) {
          const real = await canonical(absolutePath);
          files[candidate] = {
            absolutePath,
            insideWorkspace: workspace !== null && isInside(workspace, real),
          };
          return;
        }
      }
    }),
  );
  return { files };
}

function looksBinary(bytes: Uint8Array): boolean {
  const length = Math.min(bytes.length, SNIFF_BYTES);
  let suspicious = 0;
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[i]!;
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32 && byte !== 27)) suspicious += 1;
  }
  return length > 0 && suspicious / length > 0.1;
}

async function readHead(absolutePath: string, bytes: number): Promise<Buffer> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function handleReadFile(
  input: RpcInput<typeof readFile>,
): Promise<RpcOutput<typeof readFile>> {
  const absolutePath = toAbsolute(input.path, input.cwd);
  let stats: Stats;
  try {
    stats = await stat(absolutePath);
  } catch {
    return { status: "error", absolutePath, code: "not_found", message: "File not found" };
  }
  if (!stats.isFile()) {
    return { status: "error", absolutePath, code: "not_a_file", message: "Not a regular file" };
  }

  let kind: FileKind = kindForPath(absolutePath);
  const base = {
    status: "ok" as const,
    absolutePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    mimeType: mimeForPath(absolutePath),
  };

  try {
    if (kind === "image" || kind === "pdf" || kind === "svg" || kind === "html") {
      if (stats.size > MAX_BINARY_BYTES) {
        return { status: "error", absolutePath, code: "too_large", message: "File is too large to preview" };
      }
      const bytes = await readHead(absolutePath, stats.size);
      const text = kind === "svg" || kind === "html" ? bytes.toString("utf8") : undefined;
      return { ...base, kind, base64: bytes.toString("base64"), text, truncated: false };
    }
    if (kind === "audio" || kind === "video") {
      // Played from raw bytes fetched with files.readBytes.
      if (stats.size > MAX_MEDIA_BYTES) {
        return { status: "error", absolutePath, code: "too_large", message: "File is too large to play" };
      }
      return { ...base, kind, truncated: false };
    }
    if (kind === "binary") {
      return { ...base, kind, truncated: false };
    }
    const limit = Math.min(stats.size, MAX_TEXT_BYTES);
    const bytes = await readHead(absolutePath, limit);
    if (looksBinary(bytes)) {
      kind = "binary";
      return { ...base, kind, truncated: false };
    }
    let text = bytes.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // Drop a partial multi-byte character at the cut.
    if (stats.size > limit) text = text.replace(/�$/, "");
    return { ...base, kind, text, truncated: stats.size > limit };
  } catch (error) {
    return {
      status: "error",
      absolutePath,
      code: "unreadable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleReadBytes(input: RpcInput<typeof readBytes>): Promise<Uint8Array> {
  const absolutePath = toAbsolute(input.path, null);
  const stats = await stat(absolutePath);
  if (!stats.isFile()) throw new Error("Not a regular file");
  if (stats.size > MAX_MEDIA_BYTES) throw new Error("File is too large to play");
  return readHead(absolutePath, stats.size);
}

/** Poll-based watcher: works on every platform, including network mounts. */
export function watchPath(
  rawPath: string,
  push: (event: { modifiedAt: string | null }) => unknown,
  signal: AbortSignal,
): void {
  const absolutePath = toAbsolute(rawPath, null);
  const listener = (current: Stats, previous: Stats) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
    void push({ modifiedAt: current.mtimeMs === 0 ? null : current.mtime.toISOString() });
  };
  fsWatchFile(absolutePath, { interval: 1000, persistent: false }, listener);
  signal.addEventListener("abort", () => unwatchFile(absolutePath, listener), { once: true });
}
