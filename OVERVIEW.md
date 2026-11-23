File viewer makes the files your agents mention clickable. When an agent says it wrote `docs/report.md` or saved `/tmp/chart.png`, the path becomes a link and a file bar appears under the reply. Click a file to preview it beside the chat.

## How it works

The plugin adds a one-line instruction (about 30 tokens per turn) asking agents to write files as Markdown links to absolute paths, such as `[report.md](/home/me/project/report.md)`. These links work even without the plugin. The instruction applies when a session opens, including existing agents the next time they reopen. Models do not always follow it, so the plugin also looks for plain paths: inside Japanese, Chinese or Korean sentences with no spaces around them (`/tmp/a.mdを作成しました`), in full-width brackets, relative paths, and `path:line` references. It asks the daemon which of them exist, resolving relative paths against the agent's working directory and then the workspace. Only files that exist are linked, so prose like "and/or" or version numbers is left alone.

- Files inside the workspace become links that open in Paseo's own file tab.
- Every file found, including those outside the workspace such as `/tmp` or your home folder, gets a button in the file bar that opens the File viewer panel. Links to files outside the workspace become plain text, since Paseo's file tab cannot open them.

Replies are left untouched while they stream, and code blocks and web links are never changed.

## The viewer

The File viewer panel opens beside the chat on wide windows and as a tab on narrow ones. You can change this in the plugin settings. It shows:

- Markdown rendered with Paseo's Markdown, with a source view
- PDF and HTML in the desktop and web apps (HTML runs sandboxed without scripts); the mobile apps show the HTML source
- PNG, JPEG, GIF, WebP, SVG and other images
- CSV and TSV as a table (first 1,000 rows)
- JSON pretty-printed, and other text and code with line numbers, scrolled to the referenced line
- Audio (MP3, WAV, M4A, AAC, OGG, Opus, FLAC) and video (MP4, WebM, MOV) with the browser's player in the desktop and web apps, up to 95 MB. The mobile apps play audio from the start without seeking and do not play video

The panel reloads when the file changes on disk and keeps a list of recently opened files. Use `/view <path>` in the composer to open any file, or "Open file viewer" in the Command Center.

## Settings

- Link file paths in agent replies: turn the links and file bar on or off.
- Also find paths written without a link: the plain path detection described above.
- Ask agents to link files: adds the one-line instruction when a session opens. Turn it off to add nothing to agent prompts.
- Open the viewer: automatic, beside the chat, or as a tab.

## Access and limits

The plugin reads files on the machine that runs your Paseo daemon, with the daemon user's permissions, and only when a reply mentions them or you open them. It checks whether mentioned paths exist and reads a file only when you open it. Nothing is sent anywhere else. Text previews stop at 2 MB and binary previews at 40 MB. Office documents are not previewed.

Requires Paseo 0.17.3 or later on both the app and the daemon.
