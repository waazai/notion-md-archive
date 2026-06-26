import { describe, it, expect } from "vitest";
import { mdToBlocks, parseInline } from "../src/import/mdToBlocks.js";

/** Match the mkText payload shape (no annotations/link keys unless set). */
function t(content: string, ann?: Record<string, boolean>, link?: string) {
  const rt: any = { type: "text", text: { content } };
  if (link) rt.text.link = { url: link };
  if (ann) rt.annotations = ann;
  return rt;
}

describe("mdToBlocks — block level", () => {
  it("splits paragraphs on blank lines", () => {
    expect(mdToBlocks("First para.\n\nSecond para.")).toEqual([
      { type: "paragraph", paragraph: { rich_text: [t("First para.")] } },
      { type: "paragraph", paragraph: { rich_text: [t("Second para.")] } },
    ]);
  });

  it("recognizes h1/h2/h3", () => {
    const blocks = mdToBlocks("# A\n\n## B\n\n### C");
    expect(blocks.map((b) => b.type)).toEqual(["heading_1", "heading_2", "heading_3"]);
    expect((blocks[0] as any).heading_1.rich_text).toEqual([t("A")]);
  });

  it("ignores blank chunks", () => {
    expect(mdToBlocks("\n\n\nhi\n\n\n")).toHaveLength(1);
  });
});

describe("parseInline", () => {
  it("plain text -> a single segment", () => {
    expect(parseInline("hello")).toEqual([t("hello")]);
  });

  it("handles bold / italic / code / strike", () => {
    expect(parseInline("**b**")).toEqual([t("b", { bold: true })]);
    expect(parseInline("*i*")).toEqual([t("i", { italic: true })]);
    expect(parseInline("`c`")).toEqual([t("c", { code: true })]);
    expect(parseInline("~~s~~")).toEqual([t("s", { strikethrough: true })]);
  });

  it("mixes annotated and plain runs", () => {
    expect(parseInline("**bold** and `code`")).toEqual([
      t("bold", { bold: true }),
      t(" and "),
      t("code", { code: true }),
    ]);
  });

  it("parses a link", () => {
    expect(parseInline("[Notion](https://notion.so)")).toEqual([
      t("Notion", undefined, "https://notion.so"),
    ]);
  });
});
