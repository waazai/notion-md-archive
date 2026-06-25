import type { NotionBlock, RichText, ConvertCtx } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Notion block tree → GitHub-Flavored Markdown.
//
// Pure & synchronous: takes a fully-fetched block tree (children attached) and
// returns a string. No network. Media downloading is handled out-of-band by the
// caller, which passes a `mediaMap` (originalUrl -> local relative path); this
// converter just looks URLs up there.
//
// Newline rules:
//   - block boundary (hard return)      -> "\n\n"
//   - consecutive items of one list     -> "\n"
//   - soft break inside a block (\n)     -> preserved as single "\n"
// ─────────────────────────────────────────────────────────────────────────────

const LIST_TYPES = new Set([
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
]);

export function blocksToGFM(blocks: NotionBlock[], ctx: ConvertCtx = {}): string {
  return renderBlocks(blocks, 0, ctx).trimEnd() + "\n";
}

function renderBlocks(blocks: NotionBlock[], indent: number, ctx: ConvertCtx): string {
  const parts: { block: NotionBlock; text: string }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    let ordinal = 1;
    if (block.type === "numbered_list_item") {
      // number within the current run of consecutive numbered items
      let j = i;
      while (j > 0 && blocks[j - 1]!.type === "numbered_list_item") j--;
      ordinal = i - j + 1;
    }
    const text = renderBlock(block, indent, ordinal, ctx);
    if (text !== null) parts.push({ block, text });
  }

  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const a = parts[i - 1]!.block.type;
      const b = parts[i]!.block.type;
      const sameList = LIST_TYPES.has(a) && LIST_TYPES.has(b) && a === b;
      out += sameList ? "\n" : "\n\n";
    }
    out += parts[i]!.text;
  }
  return out;
}

/** Returns the markdown for a single block, or null if the block is skipped. */
function renderBlock(
  block: NotionBlock,
  indent: number,
  ordinal: number,
  ctx: ConvertCtx
): string | null {
  const pad = "  ".repeat(indent);
  const data = (block[block.type] ?? {}) as Record<string, unknown>;
  const rich = (data.rich_text as RichText[] | undefined) ?? [];
  const children = block.children ?? [];

  switch (block.type) {
    case "paragraph": {
      const body = richToMd(rich);
      const kids = children.length ? "\n\n" + renderBlocks(children, indent, ctx) : "";
      return prefixLines(body, pad) + kids;
    }

    case "heading_1":
      return pad + "# " + richToMd(rich);
    case "heading_2":
      return pad + "## " + richToMd(rich);
    case "heading_3":
      return pad + "### " + richToMd(rich);

    case "bulleted_list_item":
      return listItem(pad + "- ", rich, children, indent, ctx);
    case "numbered_list_item":
      return listItem(pad + ordinal + ". ", rich, children, indent, ctx);
    case "to_do": {
      const checked = (data.checked as boolean) ? "x" : " ";
      return listItem(pad + `- [${checked}] `, rich, children, indent, ctx);
    }

    case "quote":
      return blockquote(richToMd(rich), children, indent, ctx, pad);

    case "callout": {
      const flavor = calloutFlavor(data.icon);
      const inner =
        richToMd(rich) +
        (children.length ? "\n\n" + renderBlocks(children, 0, ctx) : "");
      const body = inner
        .split("\n")
        .map((l) => (l.length ? "> " + l : ">"))
        .join("\n");
      return pad + `> [!${flavor}]\n` + indentBlock(body, pad);
    }

    case "toggle": {
      // flatten: bold title line, children rendered flat (no extra indent)
      const title = pad + "**" + richToMd(rich) + "**";
      const kids = children.length ? "\n\n" + renderBlocks(children, indent, ctx) : "";
      return title + kids;
    }

    case "code": {
      const lang = (data.language as string | undefined) ?? "";
      const text = plain(rich);
      return pad + "```" + normalizeLang(lang) + "\n" + text + "\n" + pad + "```";
    }

    case "divider":
      return pad + "---";

    case "equation":
      return pad + "$$\n" + ((data.expression as string) ?? "") + "\n" + pad + "$$";

    case "column_list":
    case "column":
    case "synced_block":
      // structural-only: flatten children
      return children.length ? renderBlocks(children, indent, ctx) : null;

    case "table":
      return renderTable(block, pad);

    case "image":
      return pad + mediaMarkdown(data, ctx, true);
    case "file":
    case "pdf":
    case "video":
    case "audio":
      return pad + mediaMarkdown(data, ctx, false);

    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = (data.url as string) ?? "";
      const caption = richToMd((data.caption as RichText[]) ?? []);
      const label = caption || url;
      return url ? pad + `[${label}](${url})` : null;
    }

    case "table_of_contents":
    case "breadcrumb":
    case "child_page":
    case "child_database":
    case "unsupported":
      return null;

    default:
      // unknown block: emit its text if any, else skip
      return rich.length ? prefixLines(richToMd(rich), pad) : null;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function listItem(
  marker: string,
  rich: RichText[],
  children: NotionBlock[],
  indent: number,
  ctx: ConvertCtx
): string {
  let out = marker + richToMd(rich);
  if (children.length) {
    out += "\n" + renderBlocks(children, indent + 1, ctx);
  }
  return out;
}

function blockquote(
  body: string,
  children: NotionBlock[],
  indent: number,
  ctx: ConvertCtx,
  pad: string
): string {
  const inner =
    body + (children.length ? "\n\n" + renderBlocks(children, 0, ctx) : "");
  const quoted = inner
    .split("\n")
    .map((l) => (l.length ? "> " + l : ">"))
    .join("\n");
  return indentBlock(quoted, pad);
}

function renderTable(block: NotionBlock, pad: string): string | null {
  const rows = (block.children ?? []).filter((c) => c.type === "table_row");
  if (!rows.length) return null;
  const matrix = rows.map((r) => {
    const cells = ((r.table_row as { cells?: RichText[][] })?.cells ?? []) as RichText[][];
    return cells.map((cell) => richToMd(cell).replace(/\|/g, "\\|").replace(/\n/g, " "));
  });
  const cols = Math.max(...matrix.map((r) => r.length));
  const norm = matrix.map((r) => {
    const copy = [...r];
    while (copy.length < cols) copy.push("");
    return copy;
  });
  const line = (cells: string[]) => pad + "| " + cells.join(" | ") + " |";
  const header = norm[0]!;
  const sep = pad + "| " + header.map(() => "---").join(" | ") + " |";
  return [line(header), sep, ...norm.slice(1).map(line)].join("\n");
}

function mediaMarkdown(
  data: Record<string, unknown>,
  ctx: ConvertCtx,
  isImage: boolean
): string {
  const url = extractMediaUrl(data);
  const caption = richToMd((data.caption as RichText[]) ?? []);
  const resolved = (url && ctx.mediaMap?.get(url)) || url;
  if (!resolved) return caption;
  return isImage ? `![${caption}](${resolved})` : `[${caption || "file"}](${resolved})`;
}

export function extractMediaUrl(data: Record<string, unknown>): string {
  const file = data.file as { url?: string } | undefined;
  const external = data.external as { url?: string } | undefined;
  return file?.url ?? external?.url ?? (data.url as string) ?? "";
}

function calloutFlavor(icon: unknown): string {
  const emoji = (icon as { emoji?: string } | undefined)?.emoji ?? "";
  const map: Record<string, string> = {
    "💡": "TIP",
    "⚠️": "WARNING",
    "❗": "IMPORTANT",
    "🚨": "CAUTION",
    "🔥": "CAUTION",
  };
  return map[emoji] ?? "NOTE";
}

/** Inline rich-text array -> markdown. Soft breaks (\n) are preserved. */
export function richToMd(rich: RichText[]): string {
  return rich
    .map((r) => {
      if (r.type === "equation" || r.equation) {
        return "$" + (r.equation?.expression ?? r.plain_text) + "$";
      }
      let t = r.plain_text ?? "";
      const a = r.annotations ?? {};
      if (a.code) {
        t = "`" + t + "`";
      } else {
        if (a.bold) t = "**" + t + "**";
        if (a.italic) t = "*" + t + "*";
        if (a.strikethrough) t = "~~" + t + "~~";
      }
      if (r.href) t = `[${t}](${r.href})`;
      return t;
    })
    .join("");
}

function plain(rich: RichText[]): string {
  return rich.map((r) => r.plain_text ?? "").join("");
}

function prefixLines(text: string, pad: string): string {
  if (!pad) return text;
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

function indentBlock(text: string, pad: string): string {
  if (!pad) return text;
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

function normalizeLang(lang: string): string {
  if (!lang || lang === "plain text") return "";
  return lang.replace(/\s+/g, "");
}
