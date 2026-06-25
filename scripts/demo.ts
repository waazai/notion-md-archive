// Offline demo: build a representative page + block tree (mirrors the LifeCanvas
// "Quick scratchpad" note + a few rich blocks) and run the pure pipeline to emit a
// real archive file. No network. For eyeballing the output format at a checkpoint.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapPageToMeta, buildFrontmatter, filenameFor } from "../src/frontmatter.js";
import { blocksToGFM } from "../src/convert.js";
import type { NotionPage } from "../src/notion.js";
import type { NotionBlock } from "../src/types.js";

const rt = (t: string, a = {}, href?: string) => ({ type: "text", plain_text: t, annotations: a, href: href ?? null });
const b = (type: string, p: Record<string, unknown> = {}, children?: NotionBlock[]): NotionBlock =>
  ({ id: Math.random().toString(36).slice(2), type, [type]: p, children, has_children: !!children?.length });

const page: NotionPage = {
  id: "demo",
  created_time: "2026-06-24T08:20:00.000Z",
  last_edited_time: "2026-06-24T09:42:00.000Z",
  properties: {
    Name: { type: "title", title: [rt("Quick scratchpad 1")] },
    Type: { type: "select", select: { name: "Note" } },
    Category: { type: "relation", relation: [{ id: "w" }, { id: "r" }] },
    Created: { type: "date", date: { start: "2026-06-24T16:20:00.000+08:00" } },
  },
};

const tree: NotionBlock[] = [
  b("heading_3", { rich_text: [rt("Quick scratchpad 1")] }),
  b("paragraph", { rich_text: [rt("Use this space for "), rt("rough thinking", { bold: true }), rt(":")] }),
  b("bulleted_list_item", { rich_text: [rt("Jot down half-baked ideas.")] }),
  b("bulleted_list_item", { rich_text: [rt("Capture quick to-dos before they are forgotten.")] }, [
    b("bulleted_list_item", { rich_text: [rt("nested detail with "), rt("code", { code: true })] }),
  ]),
  b("to_do", { rich_text: [rt("review weekly")], checked: false }),
  b("callout", { rich_text: [rt("Remember to archive before editing.")], icon: { emoji: "💡" } }),
  b("toggle", { rich_text: [rt("Hidden notes")] }, [
    b("paragraph", { rich_text: [rt("This was inside a toggle, now flattened.")] }),
  ]),
  b("code", { rich_text: [rt('console.log("hi");')], language: "javascript" }),
  b("quote", { rich_text: [rt("A quote line.")] }),
  b("divider", {}),
];

const meta = mapPageToMeta(page, new Map([["w", "Work"], ["r", "Reading"]]));
const content = buildFrontmatter(meta) + "\n" + blocksToGFM(tree);

const dir = join(process.cwd(), "out", "Notes");
mkdirSync(dir, { recursive: true });
const file = join(dir, filenameFor(meta));
writeFileSync(file, content);
console.log("wrote", file, "\n\n" + content);
