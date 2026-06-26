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

/** Convert a Markdown body into a flat list of Notion blocks. */
export function mdToBlocks(body: string): BlockInput[] {
  const blocks: BlockInput[] = [];
  const chunks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);

  for (const chunk of chunks) {
    const text = chunk.trim();
    if (!text) continue;

    const heading = /^(#{1,3})\s+(.*)$/s.exec(text);
    if (heading) {
      const type = `heading_${heading[1]!.length}`;
      blocks.push({ type, [type]: { rich_text: parseInline(heading[2]!) } });
    } else {
      blocks.push({ type: "paragraph", paragraph: { rich_text: parseInline(text) } });
    }
  }

  return blocks;
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
