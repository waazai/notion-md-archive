import { describe, it, expect } from "vitest";
import { blocksToGFM } from "../src/convert.js";
import { mdToBlocks } from "../src/import/mdToBlocks.js";
import type { NotionBlock, RichText } from "../src/types.js";

// Export-shape factories (mirror convert.test.ts).
function rt(text: string, ann: RichText["annotations"] = {}, href?: string): RichText {
  return { type: "text", plain_text: text, annotations: ann, href: href ?? null };
}
function eb(type: string, payload: Record<string, unknown> = {}, children?: NotionBlock[]): NotionBlock {
  return { id: type, type, [type]: payload, children, has_children: !!children?.length };
}

// Reduce either block shape to { type, text?, children? } for structural comparison.
function normExport(b: NotionBlock): any {
  const data: any = (b as any)[b.type] ?? {};
  const out: any = { type: b.type };
  if (data.rich_text) out.text = (data.rich_text as RichText[]).map((r) => r.plain_text).join("");
  if (b.children?.length) out.children = b.children.map(normExport);
  return out;
}
function normImport(b: any): any {
  const data = b[b.type] ?? {};
  const out: any = { type: b.type };
  if (data.rich_text) out.text = data.rich_text.map((r: any) => r.text.content).join("");
  if (data.children?.length) out.children = data.children.map(normImport);
  return out;
}

function t(content: string, ann?: Record<string, boolean>) {
  const x: any = { type: "text", text: { content } };
  if (ann) x.annotations = ann;
  return x;
}

describe("round-trip: blocksToGFM -> mdToBlocks (B.4)", () => {
  it("preserves structure + text across the supported subset", () => {
    const source: NotionBlock[] = [
      eb("heading_1", { rich_text: [rt("Title")] }),
      eb("paragraph", { rich_text: [rt("Some "), rt("bold", { bold: true }), rt(" and "), rt("code", { code: true })] }),
      eb("bulleted_list_item", { rich_text: [rt("parent")] }, [
        eb("bulleted_list_item", { rich_text: [rt("child")] }),
      ]),
      eb("to_do", { rich_text: [rt("done")], checked: true }),
      eb("quote", { rich_text: [rt("wisdom")] }),
      eb("callout", { rich_text: [rt("be careful")], icon: { emoji: "⚠️" } }),
      eb("code", { rich_text: [rt("x=1")], language: "javascript" }),
      eb("divider", {}),
      eb("equation", { expression: "e=mc^2" }),
      eb("table", { has_column_header: true }, [
        eb("table_row", { cells: [[rt("H1")], [rt("H2")]] }),
        eb("table_row", { cells: [[rt("a")], [rt("b")]] }),
      ]),
    ];

    const round = mdToBlocks(blocksToGFM(source));
    expect(round.map(normImport)).toEqual(source.map(normExport));
  });

  it("round-trips combined bold+italic (***x***)", () => {
    const md = blocksToGFM([eb("paragraph", { rich_text: [rt("x", { bold: true, italic: true })] })]);
    expect((mdToBlocks(md)[0] as any).paragraph.rich_text).toEqual([t("x", { bold: true, italic: true })]);
  });

  it("documents the toggle flatten loss (export flattens; import sees paragraphs)", () => {
    const md = blocksToGFM([
      eb("toggle", { rich_text: [rt("Section")] }, [eb("paragraph", { rich_text: [rt("body")] })]),
    ]);
    // toggle does NOT come back as a toggle — it degrades to bold-title + body paragraphs.
    expect(mdToBlocks(md).map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });
});
