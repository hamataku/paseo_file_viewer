export type FileKind =
  | "markdown"
  | "html"
  | "image"
  | "svg"
  | "pdf"
  | "csv"
  | "json"
  | "text"
  | "audio"
  | "video"
  | "binary";

const MARKDOWN = ["md", "markdown", "mdx", "mdown", "mkd"];
const HTML = ["html", "htm", "xhtml"];
const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
const CSV = ["csv", "tsv"];
const JSON_EXT = ["json", "jsonc", "json5", "ipynb", "geojson"];
const AUDIO = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "weba"];
const VIDEO = ["mp4", "m4v", "webm", "mov", "ogv"];
const BINARY = [
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "whl",
  "exe", "dll", "so", "dylib", "o", "a", "bin", "class", "pyc", "wasm",
  "mkv", "avi", "wmv", "flv",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "key", "pages", "numbers",
  "ttf", "otf", "woff", "woff2", "eot", "psd", "ai", "sketch", "fig",
  "sqlite", "db", "parquet", "arrow", "feather", "npy", "npz", "pkl", "pt", "onnx", "h5",
  "tif", "tiff", "heic", "heif",
];

export function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function basenameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index > 0 ? path.slice(0, index) : index === 0 ? "/" : "";
}

/** Classification by name. The daemon refines "text" vs "binary" by sniffing bytes. */
export function kindForPath(path: string): FileKind {
  const ext = extensionOf(path);
  if (MARKDOWN.includes(ext)) return "markdown";
  if (HTML.includes(ext)) return "html";
  if (ext === "svg") return "svg";
  if (IMAGE.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (CSV.includes(ext)) return "csv";
  if (JSON_EXT.includes(ext)) return "json";
  if (AUDIO.includes(ext)) return "audio";
  if (VIDEO.includes(ext)) return "video";
  if (BINARY.includes(ext)) return "binary";
  return "text";
}

export function mimeForPath(path: string): string {
  const ext = extensionOf(path);
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "bmp": return "image/bmp";
    case "ico": return "image/x-icon";
    case "avif": return "image/avif";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "aac": return "audio/aac";
    case "ogg":
    case "oga": return "audio/ogg";
    case "opus": return "audio/opus";
    case "flac": return "audio/flac";
    case "weba": return "audio/webm";
    case "mp4":
    case "m4v": return "video/mp4";
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "ogv": return "video/ogg";
    case "html":
    case "htm":
    case "xhtml": return "text/html";
    default: return "application/octet-stream";
  }
}

/** Lucide icon per kind, used for chips and headers. */
export function iconForKind(kind: FileKind): string {
  switch (kind) {
    case "markdown": return "FileText";
    case "html": return "FileCode2";
    case "image":
    case "svg": return "FileImage";
    case "pdf": return "FileType2";
    case "csv": return "FileSpreadsheet";
    case "json": return "FileJson";
    case "text": return "FileCode";
    case "audio": return "FileAudio";
    case "video": return "FileVideo";
    default: return "File";
  }
}
