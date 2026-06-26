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

describe("mdToBlocks — lists (B.1)", () => {
  it("builds a bulleted list", () => {
    const b = mdToBlocks("- one\n- two");
    expect(b.map((x) => x.type)).toEqual(["bulleted_list_item", "bulleted_list_item"]);
    expect((b[0] as any).bulleted_list_item.rich_text).toEqual([t("one")]);
  });

  it("builds a numbered list (ordinal not stored)", () => {
    const b = mdToBlocks("1. a\n2. b");
    expect(b.map((x) => x.type)).toEqual(["numbered_list_item", "numbered_list_item"]);
    expect((b[1] as any).numbered_list_item.rich_text).toEqual([t("b")]);
  });

  it("builds to_do items with checked state", () => {
    const b = mdToBlocks("- [ ] todo\n- [x] done");
    expect(b[0]).toEqual({ type: "to_do", to_do: { rich_text: [t("todo")], checked: false } });
    expect((b[1] as any).to_do.checked).toBe(true);
  });

  it("nests via 2-space indent (children)", () => {
    const b = mdToBlocks("- parent\n  - child\n  - child2");
    expect(b).toHaveLength(1);
    const kids = (b[0] as any).bulleted_list_item.children;
    expect(kids).toHaveLength(2);
    expect(kids[0].type).toBe("bulleted_list_item");
    expect(kids[0].bulleted_list_item.rich_text).toEqual([t("child")]);
  });

  it("separates a list from a following paragraph", () => {
    const b = mdToBlocks("- item\n\nAfter.");
    expect(b.map((x) => x.type)).toEqual(["bulleted_list_item", "paragraph"]);
  });

  it("parses inline marks inside an item", () => {
    const b = mdToBlocks("- **bold** x");
    expect((b[0] as any).bulleted_list_item.rich_text).toEqual([t("bold", { bold: true }), t(" x")]);
  });
});

describe("mdToBlocks — rich blocks (B.2)", () => {
  it("builds a quote", () => {
    expect(mdToBlocks("> quoted line")).toEqual([
      { type: "quote", quote: { rich_text: [t("quoted line")] } },
    ]);
  });

  it("joins a multi-line quote with soft breaks", () => {
    expect((mdToBlocks("> a\n> b")[0] as any).quote.rich_text).toEqual([t("a\nb")]);
  });

  it("builds a callout with the flavor emoji", () => {
    expect(mdToBlocks("> [!WARNING]\n> be careful")).toEqual([
      {
        type: "callout",
        callout: { rich_text: [t("be careful")], icon: { type: "emoji", emoji: "⚠️" } },
      },
    ]);
  });

  it("builds a code block with language", () => {
    expect(mdToBlocks("```js\nconst x = 1;\n```")).toEqual([
      { type: "code", code: { rich_text: [t("const x = 1;")], language: "js" } },
    ]);
  });

  it("defaults code language to plain text and keeps blank lines", () => {
    const b = mdToBlocks("```\nline1\n\nline3\n```");
    expect(b).toHaveLength(1);
    expect((b[0] as any).code.language).toBe("plain text");
    expect((b[0] as any).code.rich_text).toEqual([t("line1\n\nline3")]);
  });

  it("builds a divider", () => {
    expect(mdToBlocks("---")).toEqual([{ type: "divider", divider: {} }]);
  });

  it("builds an equation block", () => {
    expect(mdToBlocks("$$\nE = mc^2\n$$")).toEqual([
      { type: "equation", equation: { expression: "E = mc^2" } },
    ]);
  });
});
