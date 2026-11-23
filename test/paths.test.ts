import assert from "node:assert/strict";
import { test } from "node:test";
import { linkMessage, scanMessage, type ResolvedFile } from "../shared/paths.ts";

const WS = "/home/u/ws";

/** Simulates the daemon: only these files exist. */
function resolveWith(existing: string[], scan: ReturnType<typeof scanMessage>) {
  const resolved: Record<string, ResolvedFile | null> = {};
  for (const candidate of scan.candidates) {
    const absolute = candidate.startsWith("/") ? candidate : `${WS}/${candidate.replace(/^\.\//, "")}`;
    resolved[candidate] = existing.includes(absolute)
      ? { absolutePath: absolute, insideWorkspace: absolute.startsWith(`${WS}/`) }
      : null;
  }
  return resolved;
}

function link(markdown: string, existing: string[]) {
  const scan = scanMessage(markdown);
  return linkMessage(markdown, scan, resolveWith(existing, scan));
}

const cases: Array<[string, string, string[], string]> = [
  [
    "Japanese suffix without space",
    "/home/u/ws/docs/report.mdを作成しました",
    [`${WS}/docs/report.md`],
    "[`/home/u/ws/docs/report.md`](</home/u/ws/docs/report.md>)を作成しました",
  ],
  [
    "Japanese prefix and suffix",
    "レポートを/home/u/ws/out/report.pdfに出力しました",
    [`${WS}/out/report.pdf`],
    "レポートを[`/home/u/ws/out/report.pdf`](</home/u/ws/out/report.pdf>)に出力しました",
  ],
  [
    "full-width parentheses",
    "（/home/u/ws/report.pdf）",
    [`${WS}/report.pdf`],
    "（[`/home/u/ws/report.pdf`](</home/u/ws/report.pdf>)）",
  ],
  [
    "Japanese period",
    "出力先: /home/u/ws/report.pdf。",
    [`${WS}/report.pdf`],
    "出力先: [`/home/u/ws/report.pdf`](</home/u/ws/report.pdf>)。",
  ],
  [
    "kagikakko relative",
    "「docs/report.md」を作成",
    [`${WS}/docs/report.md`],
    "「[`docs/report.md`](</home/u/ws/docs/report.md>)」を作成",
  ],
  [
    "relative pdf in prose",
    "See docs/report.pdf.",
    [`${WS}/docs/report.pdf`],
    "See [`docs/report.pdf`](</home/u/ws/docs/report.pdf>).",
  ],
  [
    "bare filename",
    "report.pdf を作りました",
    [`${WS}/report.pdf`],
    "[`report.pdf`](</home/u/ws/report.pdf>) を作りました",
  ],
  [
    "inline code",
    "Wrote `docs/a.md` now",
    [`${WS}/docs/a.md`],
    "Wrote [`docs/a.md`](</home/u/ws/docs/a.md>) now",
  ],
  [
    "Japanese file name",
    "`/home/u/ws/資料/議事録.md` を更新",
    [`${WS}/資料/議事録.md`],
    "[`/home/u/ws/資料/議事録.md`](</home/u/ws/資料/議事録.md>) を更新",
  ],
  [
    "Japanese file name in prose",
    "/home/u/ws/資料/議事録.mdを更新",
    [`${WS}/資料/議事録.md`],
    "[`/home/u/ws/資料/議事録.md`](</home/u/ws/資料/議事録.md>)を更新",
  ],
  [
    "line suffix",
    "Bug at src/app.ts:42 here",
    [`${WS}/src/app.ts`],
    "Bug at [`src/app.ts:42`](</home/u/ws/src/app.ts:42>) here",
  ],
  [
    "missing file is untouched",
    "Maybe /home/u/ws/nope.md exists",
    [],
    "Maybe /home/u/ws/nope.md exists",
  ],
  [
    "fenced code untouched",
    "```\n/home/u/ws/a.md\n```",
    [`${WS}/a.md`],
    "```\n/home/u/ws/a.md\n```",
  ],
  [
    "existing link untouched",
    "[report](https://example.com/a.md) and https://example.com/a.md",
    [`${WS}/a.md`],
    "[report](https://example.com/a.md) and https://example.com/a.md",
  ],
  [
    "bold path",
    "**/home/u/ws/a.md**",
    [`${WS}/a.md`],
    "**[`/home/u/ws/a.md`](</home/u/ws/a.md>)**",
  ],
  [
    "outside workspace is listed but not linked inline",
    "Saved /tmp/out.pdf",
    ["/tmp/out.pdf"],
    "Saved /tmp/out.pdf",
  ],
  [
    "explicit link inside workspace keeps its label",
    "[レポート](/home/u/ws/docs/report.md)を作成しました",
    [`${WS}/docs/report.md`],
    "[レポート](</home/u/ws/docs/report.md>)を作成しました",
  ],
  [
    "explicit relative link with line becomes absolute",
    "See [app.ts:42](src/app.ts:42).",
    [`${WS}/src/app.ts`],
    "See [app.ts:42](</home/u/ws/src/app.ts:42>).",
  ],
  [
    "explicit link with encoded space",
    "[my file](/home/u/ws/my%20file.md)",
    [`${WS}/my file.md`],
    "[my file](</home/u/ws/my file.md>)",
  ],
  [
    "explicit link outside workspace becomes plain text",
    "Saved [out.pdf](/tmp/out.pdf).",
    ["/tmp/out.pdf"],
    "Saved out.pdf.",
  ],
  [
    "explicit link to a missing file is untouched",
    "[gone](/home/u/ws/gone.md)",
    [],
    "[gone](/home/u/ws/gone.md)",
  ],
];

for (const [name, input, existing, expected] of cases) {
  test(name, () => {
    assert.equal(link(input, existing).markdown, expected);
  });
}

test("files list includes outside-workspace files once", () => {
  const { files } = link("Saved /tmp/out.pdf and again `/tmp/out.pdf`, plus a.md", ["/tmp/out.pdf", `${WS}/a.md`]);
  assert.deepEqual(
    files.map((f) => [f.absolutePath, f.insideWorkspace]),
    [
      ["/tmp/out.pdf", false],
      [`${WS}/a.md`, true],
    ],
  );
});

test("noise is not proposed", () => {
  const { candidates } = scanMessage("Use and/or e.g. v1.2.3 Node 22. Ok... 3.14 :) http://x.y/z.md");
  assert.deepEqual(candidates, []);
});

test("bare path detection can be turned off; explicit links still work", () => {
  const markdown = "Wrote /home/u/ws/a.md and [b](/home/u/ws/b.md)";
  const scan = scanMessage(markdown);
  const result = linkMessage(markdown, scan, resolveWith([`${WS}/a.md`, `${WS}/b.md`], scan), {
    detectBarePaths: false,
  });
  assert.equal(result.markdown, "Wrote /home/u/ws/a.md and [b](</home/u/ws/b.md>)");
  assert.deepEqual(result.files.map((f) => f.absolutePath), [`${WS}/b.md`]);
});
