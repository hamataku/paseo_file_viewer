/**
 * File path detection for agent messages.
 *
 * Agents mention files in many shapes: inline code, bare prose, Japanese or Chinese
 * sentences without spaces (`/tmp/a.mdを作成しました`), full-width brackets, and
 * relative paths with any extension. Guessing exactly where a path ends from text
 * alone is unreliable, so this module proposes several candidate spans per token
 * and the daemon confirms which of them exist. Only existing files become links.
 *
 * Pure and dependency-free: shared by client and server, and unit tested in Node.
 */

export interface PathCandidate {
  /** The path text as written, without a line suffix. */
  path: string;
  lineStart?: number;
  lineEnd?: number;
}

/** A place in the message where a candidate may be linked. */
interface Occurrence {
  /** Offset in the source of the replaced text. */
  start: number;
  end: number;
  /** Alternatives, longest first. The first one that resolves wins. */
  options: Array<PathCandidate & { start: number; end: number }>;
  /** The whole inline code span, including backticks, is replaced. */
  inlineCode: boolean;
  /** An authored Markdown link to a local file; `label` is its text. */
  explicit?: { label: string };
}

export interface ResolvedFile {
  /** Absolute path on the daemon host. */
  absolutePath: string;
  /** True when Paseo's own file tab can open it (inside the workspace). */
  insideWorkspace: boolean;
}

export interface MessageScan {
  occurrences: Occurrence[];
  /** Unique candidate path strings to resolve on the daemon. */
  candidates: string[];
}

const MAX_CANDIDATES = 200;
const MAX_PATH_LENGTH = 1024;

// Characters that never belong to a path written in prose. Full-width and CJK
// punctuation (、。「」（）：etc.) end a path just like ASCII spaces do.
const HARD_BOUNDARY =
  /[\s"'`<>|*()[\]{},;　-〿！-／：-＠［-｀｛-･‘-‟…]/;
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;
const ASCII_PATH_CHAR = /[A-Za-z0-9_\-./\\~@%+=#]/;
const EXTENSION_AT = /^\.([A-Za-z0-9]{1,10})(?=$|[^A-Za-z0-9])/;
const LINE_SUFFIX = /^(?::(\d+)(?::\d+)?(?:-(\d+)(?::\d+)?)?|#L(\d+)(?:-L?(\d+))?)/;

function isAscii(char: string | undefined): boolean {
  return char !== undefined && char.charCodeAt(0) < 0x80;
}

/** Plausibility filter applied before asking the daemon. */
export function looksLikePath(value: string): boolean {
  if (!value || value.length > MAX_PATH_LENGTH) return false;
  if (value.includes("://")) return false;
  if (/^[a-z][a-z0-9+.-]*:(?![\\/])/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return false;
  if (/^[.~/\\]+$/.test(value)) return false;
  if (value.startsWith("@") || value.startsWith("#")) return false;
  const hasSeparator = /[\\/]/.test(value);
  const base = value.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const extension = /\.([A-Za-z0-9]{1,10})$/.exec(base)?.[1];
  const hasLetterExtension = extension !== undefined && /[A-Za-z]/.test(extension);
  if (hasSeparator) {
    // `a/b` style prose ("and/or", "yes/no") is too noisy without an extension
    // unless the path is rooted.
    return hasLetterExtension || /^(?:~?\/|\.{1,2}\/|[A-Za-z]:[\\/])/.test(value);
  }
  // Bare names need a 2+ character extension so prose like "e.g" stays out.
  return hasLetterExtension && extension!.length >= 2 && base.length > extension!.length + 1;
}

function parseLineSuffix(text: string): { length: number; lineStart?: number; lineEnd?: number } {
  const match = LINE_SUFFIX.exec(text);
  if (!match) return { length: 0 };
  const start = Number(match[1] ?? match[3]);
  const endRaw = match[2] ?? match[4];
  const end = endRaw ? Number(endRaw) : undefined;
  if (!Number.isFinite(start) || start <= 0) return { length: 0 };
  return {
    length: match[0].length,
    lineStart: start,
    lineEnd: end !== undefined && end >= start ? end : undefined,
  };
}

/** Candidate spans inside one prose token, longest first per start. */
function tokenOptions(token: string, offset: number): Occurrence["options"] {
  const starts = new Set<number>([0]);
  for (let i = 1; i < token.length; i += 1) {
    // A script change starts a new possible path: `レポートを/tmp/a.pdf`, `ファイルdocs/a.md`.
    if (isAscii(token[i]) && !isAscii(token[i - 1]) && ASCII_PATH_CHAR.test(token[i]!)) {
      starts.add(i);
    }
  }

  // Ends: after an extension (optionally followed by a line suffix), at a script
  // change back to non-ASCII, and at the token end.
  const ends: Array<{ end: number; suffixEnd: number; lineStart?: number; lineEnd?: number }> = [];
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === ".") {
      const ext = EXTENSION_AT.exec(token.slice(i));
      if (ext) {
        const end = i + ext[0].length;
        const suffix = parseLineSuffix(token.slice(end));
        ends.push({ end, suffixEnd: end + suffix.length, ...suffix });
      }
    }
    if (i > 0 && !isAscii(token[i]) && isAscii(token[i - 1])) {
      ends.push({ end: i, suffixEnd: i });
    }
  }
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  {
    // `path:12` at the end of a token.
    const lineMatch = /(?::(\d+)(?::\d+)?(?:-(\d+)(?::\d+)?)?|#L(\d+)(?:-L?(\d+))?)$/.exec(trimmed);
    if (lineMatch) {
      const suffix = parseLineSuffix(lineMatch[0]);
      ends.push({
        end: trimmed.length - lineMatch[0].length,
        suffixEnd: trimmed.length,
        lineStart: suffix.lineStart,
        lineEnd: suffix.lineEnd,
      });
    }
    ends.push({ end: trimmed.length, suffixEnd: trimmed.length });
  }

  const options: Occurrence["options"] = [];
  const seen = new Set<string>();
  for (const start of [...starts].sort((a, b) => a - b)) {
    const forStart = ends
      .filter((e) => e.end > start)
      .sort((a, b) => b.end - a.end || b.suffixEnd - a.suffixEnd);
    for (const e of forStart) {
      const path = token.slice(start, e.end).replace(TRAILING_PUNCTUATION, "");
      if (!looksLikePath(path)) continue;
      const key = `${start}:${path}:${e.lineStart ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        path,
        lineStart: e.lineStart,
        lineEnd: e.lineEnd,
        start: offset + start,
        end: offset + start + path.length + (e.suffixEnd - e.end),
      });
    }
  }
  return options;
}

/** Inline code: the whole span must be one path, optionally with a line suffix. */
function inlineCodeCandidate(content: string): PathCandidate | null {
  const value = content.trim();
  if (!value || /\s/.test(value)) {
    // Allow spaces only for rooted paths without other shell syntax.
    if (!/^(?:~?\/|[A-Za-z]:[\\/])[^|&;<>$`"']+$/.test(value)) return null;
  }
  const fileUrl = /^file:\/\/(.+)$/i.exec(value);
  let path = fileUrl ? safeDecode(fileUrl[1]!) : value;
  let lineStart: number | undefined;
  let lineEnd: number | undefined;
  const line = /(?::(\d+)(?::\d+)?(?:-(\d+)(?::\d+)?)?|#L(\d+)(?:-L?(\d+))?)$/.exec(path);
  if (line && line.index > 0) {
    const suffix = parseLineSuffix(line[0]);
    if (suffix.lineStart) {
      path = path.slice(0, line.index);
      lineStart = suffix.lineStart;
      lineEnd = suffix.lineEnd;
    }
  }
  if (!looksLikePath(path)) return null;
  return { path, lineStart, lineEnd };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Scan Markdown for path candidates. Fenced code blocks, indented code,
 * authored links, autolinks, and HTML tags are left alone.
 */
export function scanMessage(markdown: string): MessageScan {
  const occurrences: Occurrence[] = [];
  const lines = splitLinesWithOffsets(markdown);
  let fence: { char: string; length: number } | null = null;
  let previousBlank = true;

  for (const { text: line, offset } of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1]![0] === fence.char && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1]![0]!, length: fenceMatch[1]!.length };
      continue;
    }
    if (previousBlank && /^(?: {4}|\t)/.test(line)) {
      continue; // Indented code block line.
    }
    previousBlank = line.trim() === "";
    scanInline(line, offset, occurrences);
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  outer: for (const occurrence of occurrences) {
    for (const option of occurrence.options) {
      if (seen.has(option.path)) continue;
      if (candidates.length >= MAX_CANDIDATES) break outer;
      seen.add(option.path);
      candidates.push(option.path);
    }
  }
  return { occurrences, candidates };
}

function splitLinesWithOffsets(text: string): Array<{ text: string; offset: number }> {
  const result: Array<{ text: string; offset: number }> = [];
  let offset = 0;
  for (const part of text.split("\n")) {
    result.push({ text: part, offset });
    offset += part.length + 1;
  }
  return result;
}

function scanInline(line: string, lineOffset: number, out: Occurrence[]): void {
  let i = 0;
  let proseStart = 0;
  const flushProse = (end: number) => {
    if (end > proseStart) scanProse(line.slice(proseStart, end), lineOffset + proseStart, out);
  };

  while (i < line.length) {
    const char = line[i]!;
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === "`") {
      const run = /^`+/.exec(line.slice(i))![0];
      const close = line.indexOf(run, i + run.length);
      if (close < 0) {
        i += run.length;
        continue;
      }
      flushProse(i);
      const content = line.slice(i + run.length, close);
      const candidate = inlineCodeCandidate(content);
      const end = close + run.length;
      if (candidate) {
        out.push({
          start: lineOffset + i,
          end: lineOffset + end,
          inlineCode: true,
          options: [{ ...candidate, start: lineOffset + i, end: lineOffset + end }],
        });
      }
      i = end;
      proseStart = i;
      continue;
    }
    if (char === "[" || (char === "!" && line[i + 1] === "[")) {
      const linkEnd = findLinkEnd(line, char === "!" ? i + 1 : i);
      if (linkEnd > 0) {
        flushProse(i);
        if (char === "[") {
          const explicit = explicitLinkOccurrence(line.slice(i, linkEnd), lineOffset + i);
          if (explicit) out.push(explicit);
        }
        i = linkEnd;
        proseStart = i;
        continue;
      }
    }
    if (char === "<") {
      const close = line.indexOf(">", i + 1);
      if (close > 0 && /^<(?:[a-z][a-z0-9+.-]*:|\/?[a-z][a-z0-9-]*[\s/>])/i.test(line.slice(i, close + 1))) {
        flushProse(i);
        i = close + 1;
        proseStart = i;
        continue;
      }
    }
    if (/^https?:\/\//i.test(line.slice(i, i + 8)) && (i === 0 || !/[A-Za-z0-9]/.test(line[i - 1]!))) {
      flushProse(i);
      while (i < line.length && !/[\s<>]/.test(line[i]!)) i += 1;
      proseStart = i;
      continue;
    }
    i += 1;
  }
  flushProse(line.length);
}

/**
 * `[label](/abs/file.md)`, `[label](<docs/a b.md>)`, `[label](file:///x.pdf#L3)`:
 * the format agents are instructed to use. Web URLs and anchors are ignored.
 */
function explicitLinkOccurrence(link: string, offset: number): Occurrence | null {
  const match = /^\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)$/.exec(link);
  if (!match) return null;
  let destination = match[2]!;
  if (destination.startsWith("<")) destination = destination.slice(1, -1);
  else destination = safeDecode(destination);
  if (!destination || destination.startsWith("#") || /^(?:https?|mailto|tel):/i.test(destination)) {
    return null;
  }
  const candidate = inlineCodeCandidate(destination);
  if (!candidate) return null;
  const end = offset + link.length;
  return {
    start: offset,
    end,
    inlineCode: false,
    explicit: { label: match[1]! },
    options: [{ ...candidate, start: offset, end }],
  };
}

/** Returns the index after `[text](dest)` or `[text][ref]`, or -1. */
function findLinkEnd(line: string, open: number): number {
  let depth = 0;
  let i = open;
  for (; i < line.length; i += 1) {
    const c = line[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return -1;
  const next = line[i + 1];
  if (next === "(") {
    let parens = 0;
    for (let j = i + 1; j < line.length; j += 1) {
      if (line[j] === "\\") {
        j += 1;
        continue;
      }
      if (line[j] === "(") parens += 1;
      else if (line[j] === ")") {
        parens -= 1;
        if (parens === 0) return j + 1;
      }
    }
    return -1;
  }
  if (next === "[") {
    const close = line.indexOf("]", i + 2);
    return close > 0 ? close + 1 : -1;
  }
  return -1;
}

function scanProse(text: string, offset: number, out: Occurrence[]): void {
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const char = text[i];
    const boundary = char === undefined || HARD_BOUNDARY.test(char);
    if (!boundary && start < 0) start = i;
    if (boundary && start >= 0) {
      const token = text.slice(start, i);
      // Fast reject: a path needs a separator or a dot.
      if (/[./\\]/.test(token)) {
        const options = tokenOptions(token, offset + start);
        if (options.length > 0) {
          out.push({ start: offset + start, end: offset + i, inlineCode: false, options });
        }
      }
      start = -1;
    }
  }
}

export interface LinkedFile extends ResolvedFile {
  /** Text as it appeared in the message. */
  label: string;
  lineStart?: number;
  lineEnd?: number;
}

/**
 * Rewrite the message so resolved files inside the workspace become explicit
 * Markdown links, which Paseo opens in its file tab. Returns the files in order
 * of first mention, including those outside the workspace.
 */
export function linkMessage(
  markdown: string,
  scan: MessageScan,
  resolved: Readonly<Record<string, ResolvedFile | null | undefined>>,
  options: { linkInline?: boolean; detectBarePaths?: boolean } = {},
): { markdown: string; files: LinkedFile[] } {
  const linkInline = options.linkInline ?? true;
  const detectBarePaths = options.detectBarePaths ?? true;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const files: LinkedFile[] = [];
  const seenFiles = new Set<string>();

  for (const occurrence of scan.occurrences) {
    if (!occurrence.explicit && !detectBarePaths) continue;
    // Pick non-overlapping matches inside the token, earliest start then longest.
    let cursor = occurrence.start;
    const sorted = [...occurrence.options].sort((a, b) => a.start - b.start || b.end - a.end);
    for (const option of sorted) {
      if (option.start < cursor) continue;
      const file = resolved[option.path];
      if (!file) continue;
      cursor = option.end;
      if (!seenFiles.has(file.absolutePath)) {
        seenFiles.add(file.absolutePath);
        files.push({
          ...file,
          label: option.path,
          lineStart: option.lineStart,
          lineEnd: option.lineEnd,
        });
      }
      if (occurrence.explicit) {
        // Normalize to an absolute target Paseo's file tab can open. A link to a
        // file outside the workspace would fail there, so it becomes plain text
        // and the file bar opens it instead.
        const text =
          file.insideWorkspace && !/[<>\n]/.test(file.absolutePath)
            ? `[${occurrence.explicit.label}](<${hrefFor(file.absolutePath, option)}>)`
            : occurrence.explicit.label;
        edits.push({ start: option.start, end: option.end, text });
        continue;
      }
      if (!linkInline || !file.insideWorkspace || /[<>\n]/.test(file.absolutePath)) {
        continue;
      }
      const original = markdown.slice(option.start, option.end);
      const href = hrefFor(file.absolutePath, option);
      const label = occurrence.inlineCode ? original : codeSpan(original);
      edits.push({ start: option.start, end: option.end, text: `[${label}](<${href}>)` });
    }
  }

  let output = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { markdown: output, files };
}

function hrefFor(absolutePath: string, line: { lineStart?: number; lineEnd?: number }): string {
  if (!line.lineStart) return absolutePath;
  return `${absolutePath}:${line.lineStart}${line.lineEnd ? `-${line.lineEnd}` : ""}`;
}

function codeSpan(text: string): string {
  if (!text.includes("`")) return `\`${text}\``;
  return `\`\` ${text} \`\``;
}
