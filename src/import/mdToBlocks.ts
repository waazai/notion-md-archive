// GFM Markdown -> Notion block objects. Pure & synchronous — the mirror of
// convert.ts `blocksToGFM`. A.4 covers the minimal subset (paragraph, h1/h2/h3,
// inline bold/italic/code/strike/link); lists, quotes, code, tables, callouts
// land in Phase B.

export interface RichTextInput {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: Record<string, boolean>;
}

export interface BlockInput {
  type: string;
  [payload: string]: unknown;
}

/** Convert a Markdown body into a flat list of Notion blocks. Line-based so that
 *  multi-line constructs (lists, and — from Phase B.2 — fenced code) parse
 *  correctly rather than being split on blank lines. */
export function mdToBlocks(body: string): BlockInput[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  return parseBlocks(lines, 0).blocks;
}

/** Parse blocks until the lines run out (recursion handles nested list levels). */
function parseBlocks(lines: string[], from: number): { blocks: BlockInput[]; next: number } {
  const blocks: BlockInput[] = [];
  let i = from;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const type = `heading_${heading[1]!.length}`;
      blocks.push({ type, [type]: { rich_text: parseInline(heading[2]!) } });
      i++;
      continue;
    }

    if (matchListItem(line)) {
      const baseIndent = matchListItem(line)!.indent;
      const res = parseListItems(lines, i, baseIndent);
      blocks.push(...res.blocks);
      i = res.next;
      continue;
    }

    // Paragraph: consecutive non-blank lines that don't start another block.
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines[i]!)) {
      para.push(lines[i]!);
      i++;
    }
    blocks.push({ type: "paragraph", paragraph: { rich_text: parseInline(para.join("\n")) } });
  }

  return { blocks, next: i };
}

/** Lines that begin a non-paragraph block (used to terminate paragraph runs). */
function isBlockStart(line: string): boolean {
  return /^#{1,3}\s/.test(line) || matchListItem(line) !== null;
}

interface ListMatch {
  indent: number;
  ordered: boolean;
  checked?: boolean;
  text: string;
}

/** Match a list-item line: `- x`, `* x`, `1. x`, or a `- [ ]` / `- [x]` to_do. */
function matchListItem(line: string): ListMatch | null {
  const m = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
  if (!m) return null;
  const indent = m[1]!.length;
  const ordered = /^\s*\d+\./.test(line);
  let text = m[2]!;
  let checked: boolean | undefined;
  if (!ordered) {
    const todo = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (todo) {
      checked = todo[1]!.toLowerCase() === "x";
      text = todo[2]!;
    }
  }
  return { indent, ordered, checked, text };
}

/** Parse a run of list items at `baseIndent`, recursing for deeper-indented children. */
function parseListItems(
  lines: string[],
  from: number,
  baseIndent: number
): { blocks: BlockInput[]; next: number } {
  const blocks: BlockInput[] = [];
  let i = from;

  while (i < lines.length) {
    if (lines[i]!.trim() === "") break; // blank line ends the list
    const m = matchListItem(lines[i]!);
    if (!m || m.indent < baseIndent) break;
    if (m.indent > baseIndent) break; // deeper item — handled as a child below

    const block = makeListBlock(m);
    i++;

    // Attach any deeper-indented following items as children.
    const childMatch = i < lines.length ? matchListItem(lines[i]!) : null;
    if (childMatch && childMatch.indent > baseIndent) {
      const child = parseListItems(lines, i, childMatch.indent);
      (block[block.type] as { children?: BlockInput[] }).children = child.blocks;
      i = child.next;
    }

    blocks.push(block);
  }

  return { blocks, next: i };
}

function makeListBlock(m: ListMatch): BlockInput {
  const rich_text = parseInline(m.text);
  if (m.checked !== undefined) {
    return { type: "to_do", to_do: { rich_text, checked: m.checked } };
  }
  const type = m.ordered ? "numbered_list_item" : "bulleted_list_item";
  return { type, [type]: { rich_text } };
}

// Inline markers, tried in priority order at each position. Link first so a
// URL's contents aren't mistaken for emphasis; code before * so `*` inside code
// stays literal.
const INLINE: { re: RegExp; make: (m: RegExpExecArray) => RichTextInput }[] = [
  { re: /^\[([^\]]*)\]\(([^)]+)\)/, make: (m) => mkText(m[1]!, {}, m[2]!) },
  { re: /^`([^`]+)`/, make: (m) => mkText(m[1]!, { code: true }) },
  { re: /^\*\*([^*]+)\*\*/, make: (m) => mkText(m[1]!, { bold: true }) },
  { re: /^~~([^~]+)~~/, make: (m) => mkText(m[1]!, { strikethrough: true }) },
  { re: /^\*([^*]+)\*/, make: (m) => mkText(m[1]!, { italic: true }) },
];

/** Parse inline Markdown into Notion rich_text segments. */
export function parseInline(text: string): RichTextInput[] {
  const out: RichTextInput[] = [];
  let plain = "";
  const flush = () => {
    if (plain) {
      out.push(mkText(plain, {}));
      plain = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let matched = false;
    for (const { re, make } of INLINE) {
      const m = re.exec(rest);
      if (m) {
        flush();
        out.push(make(m));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += text[i];
      i++;
    }
  }
  flush();
  return out;
}

function mkText(
  content: string,
  ann: Record<string, boolean>,
  link?: string
): RichTextInput {
  const rt: RichTextInput = { type: "text", text: { content } };
  if (link) rt.text.link = { url: link };
  if (Object.keys(ann).length) rt.annotations = ann;
  return rt;
}
