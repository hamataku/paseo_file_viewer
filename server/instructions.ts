/**
 * Appended on every session open, so it costs tokens on every turn: keep it
 * to one line. Plain Markdown links still render as links without the plugin.
 */
export const FILE_LINK_INSTRUCTION =
  "When mentioning files, always write Markdown links to absolute paths: [name](/abs/path) or [name:42](/abs/path:42).";
