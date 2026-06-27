import YAML from "yaml";

// Split a Markdown file into its YAML frontmatter and body. Pure & synchronous
// — the reverse of frontmatter.ts `buildFrontmatter`. No frontmatter (or a
// malformed/unterminated fence) yields an empty object + the whole text as body.

export interface ParsedFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseMarkdown(text: string): ParsedFile {
  const src = text.replace(/^﻿/, ""); // drop a leading BOM

  // Frontmatter must open on the very first line: `---` then a line break.
  const open = /^---[ \t]*\r?\n/.exec(src);
  if (!open) return { frontmatter: {}, body: src };

  const rest = src.slice(open[0].length);
  // Closing fence: a line that is exactly `---` (trailing spaces tolerated).
  const close = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/.exec(rest);
  if (!close) return { frontmatter: {}, body: src }; // unterminated -> all body

  const yamlText = rest.slice(0, close.index);
  // Body is whatever follows the closing fence, minus the single separator newline.
  const body = rest.slice(close.index + close[0].length).replace(/^\r?\n/, "");

  const parsed = YAML.parse(yamlText);
  const frontmatter =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { frontmatter, body };
}
