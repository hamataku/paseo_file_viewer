# paseo-file-viewer

A [Paseo](https://paseo.sh) plugin that turns file paths in agent replies into links and previews the files beside the chat. See [OVERVIEW.md](OVERVIEW.md) for what it does.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"      # first time
paseo plugin reload paseo-file-viewer
```

Layout:

- `shared/paths.ts`: path detection and Markdown rewriting (pure, unit tested in `test/`)
- `shared/contracts.ts`: RPCs, the file watch subscription, and settings
- `server/files.ts`: resolving candidates, reading files, polling for changes
- `client/linked-message.tsx`: timeline renderer for replies with file links and the file bar
- `client/viewer-panel.tsx`, `client/previews.tsx`: the File viewer panel
- `client/web.ts`: the only module that uses browser globals (blob URLs for PDF and HTML)
