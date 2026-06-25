import { describe, it, expect } from "vitest";
import { blocksToGFM, richToMd } from "../src/convert.js";
import type { NotionBlock, RichText } from "../src/types.js";

// rich-text factory
function rt(text: string, ann: RichText["annotations"] = {}, href?: string): RichText {
  return { type: "text", plain_text: text, annotations: ann, href: href ?? null };
}
// block factory
function block(type: string, payload: Record<string, unknown> = {}, children?: NotionBlock[]): NotionBlock {
  return { id: type + "-" + Math.random().toString(36).slice(2), type, ...{ [type]: payload }, children, has_children: !!children?.length };
}

describe("richToMd inline", () => {
  it("plain text", () => {
    expect(richToMd([rt("hello")])).toBe("hello");
  });
  it("bold + italic + strike", () => {
    expect(richToMd([rt("x", { bold: true })])).toBe("**x**");
    expect(richToMd([rt("x", { italic: true })])).toBe("*x*");
    expect(richToMd([rt("x", { strikethrough: true })])).toBe("~~x~~");
    expect(richToMd([rt("x", { bold: true, italic: true })])).toBe("***x***");
  });
  it("inline code wins over other annotations", () => {
    expect(richToMd([rt("x", { code: true, bold: true })])).toBe("`x`");
  });
  it("link", () => {
    expect(richToMd([rt("site", {}, "https://e.com")])).toBe("[site](https://e.com)");
  });
  it("preserves soft break", () => {
    expect(richToMd([rt("a\nb")])).toBe("a\nb");
  });
});

describe("headings & paragraphs", () => {
  it("h1/h2/h3", () => {
    const out = blocksToGFM([
      block("heading_1", { rich_text: [rt("A")] }),
      block("heading_2", { rich_text: [rt("B")] }),
      block("heading_3", { rich_text: [rt("C")] }),
    ]);
    expect(out).toBe("# A\n\n## B\n\n### C\n");
  });
  it("paragraphs separated by blank line", () => {
    const out = blocksToGFM([
      block("paragraph", { rich_text: [rt("one")] }),
      block("paragraph", { rich_text: [rt("two")] }),
    ]);
    expect(out).toBe("one\n\ntwo\n");
  });
});

describe("lists", () => {
  it("consecutive bullets single newline", () => {
    const out = blocksToGFM([
      block("bulleted_list_item", { rich_text: [rt("a")] }),
      block("bulleted_list_item", { rich_text: [rt("b")] }),
    ]);
    expect(out).toBe("- a\n- b\n");
  });
  it("numbered list numbers sequentially", () => {
    const out = blocksToGFM([
      block("numbered_list_item", { rich_text: [rt("a")] }),
      block("numbered_list_item", { rich_text: [rt("b")] }),
      block("numbered_list_item", { rich_text: [rt("c")] }),
    ]);
    expect(out).toBe("1. a\n2. b\n3. c\n");
  });
  it("nested bullets indent by 2 spaces", () => {
    const out = blocksToGFM([
      block("bulleted_list_item", { rich_text: [rt("parent")] }, [
        block("bulleted_list_item", { rich_text: [rt("child")] }),
      ]),
    ]);
    expect(out).toBe("- parent\n  - child\n");
  });
  it("to-do checked / unchecked", () => {
    const out = blocksToGFM([
      block("to_do", { rich_text: [rt("done")], checked: true }),
      block("to_do", { rich_text: [rt("todo")], checked: false }),
    ]);
    expect(out).toBe("- [x] done\n- [ ] todo\n");
  });
  it("paragraph after list gets blank line", () => {
    const out = blocksToGFM([
      block("bulleted_list_item", { rich_text: [rt("a")] }),
      block("paragraph", { rich_text: [rt("p")] }),
    ]);
    expect(out).toBe("- a\n\np\n");
  });
});

describe("code, quote, divider", () => {
  it("fenced code with language", () => {
    const out = blocksToGFM([
      block("code", { rich_text: [rt("const x = 1;")], language: "javascript" }),
    ]);
    expect(out).toBe("```javascript\nconst x = 1;\n```\n");
  });
  it("quote", () => {
    const out = blocksToGFM([block("quote", { rich_text: [rt("wisdom")] })]);
    expect(out).toBe("> wisdom\n");
  });
  it("divider", () => {
    const out = blocksToGFM([block("divider", {})]);
    expect(out).toBe("---\n");
  });
});

describe("rich blocks (P2)", () => {
  it("callout -> GFM alert, emoji maps flavor", () => {
    const out = blocksToGFM([
      block("callout", { rich_text: [rt("be careful")], icon: { emoji: "⚠️" } }),
    ]);
    expect(out).toBe("> [!WARNING]\n> be careful\n");
  });
  it("callout default NOTE", () => {
    const out = blocksToGFM([
      block("callout", { rich_text: [rt("info")], icon: { emoji: "📝" } }),
    ]);
    expect(out).toBe("> [!NOTE]\n> info\n");
  });
  it("toggle flattens to bold title + flat children", () => {
    const out = blocksToGFM([
      block("toggle", { rich_text: [rt("Section")] }, [
        block("paragraph", { rich_text: [rt("hidden body")] }),
      ]),
    ]);
    expect(out).toBe("**Section**\n\nhidden body\n");
  });
  it("column_list flattens children sequentially", () => {
    const out = blocksToGFM([
      block("column_list", {}, [
        block("column", {}, [block("paragraph", { rich_text: [rt("left")] })]),
        block("column", {}, [block("paragraph", { rich_text: [rt("right")] })]),
      ]),
    ]);
    expect(out).toBe("left\n\nright\n");
  });
  it("table -> GFM table", () => {
    const out = blocksToGFM([
      block("table", { has_column_header: true }, [
        block("table_row", { cells: [[rt("H1")], [rt("H2")]] }),
        block("table_row", { cells: [[rt("a")], [rt("b")]] }),
      ]),
    ]);
    expect(out).toBe("| H1 | H2 |\n| --- | --- |\n| a | b |\n");
  });
  it("equation block", () => {
    const out = blocksToGFM([block("equation", { expression: "e=mc^2" })]);
    expect(out).toBe("$$\ne=mc^2\n$$\n");
  });
  it("bookmark -> link", () => {
    const out = blocksToGFM([block("bookmark", { url: "https://e.com", caption: [] })]);
    expect(out).toBe("[https://e.com](https://e.com)\n");
  });
  it("skips table_of_contents / breadcrumb", () => {
    const out = blocksToGFM([
      block("table_of_contents", {}),
      block("paragraph", { rich_text: [rt("kept")] }),
      block("breadcrumb", {}),
    ]);
    expect(out).toBe("kept\n");
  });
});

describe("attachments (P3)", () => {
  it("image keeps remote url when no mediaMap", () => {
    const out = blocksToGFM([
      block("image", { type: "file", file: { url: "https://s3/x.png?sig=1" }, caption: [rt("cap")] }),
    ]);
    expect(out).toBe("![cap](https://s3/x.png?sig=1)\n");
  });
  it("image rewritten to local path via mediaMap", () => {
    const url = "https://s3/x.png?sig=1";
    const out = blocksToGFM(
      [block("image", { type: "file", file: { url }, caption: [rt("cap")] })],
      { mediaMap: new Map([[url, "attachments/abc123.png"]]) }
    );
    expect(out).toBe("![cap](attachments/abc123.png)\n");
  });
  it("file block (non-image) -> link", () => {
    const url = "https://s3/doc.pdf?sig=1";
    const out = blocksToGFM(
      [block("file", { type: "file", file: { url }, caption: [rt("spec")] })],
      { mediaMap: new Map([[url, "attachments/def.pdf"]]) }
    );
    expect(out).toBe("[spec](attachments/def.pdf)\n");
  });
});

describe("template note (integration)", () => {
  it("matches the Personal goals 2026 note layout", () => {
    const out = blocksToGFM([
      block("heading_3", { rich_text: [rt("Personal goals 2026")] }),
      block("bulleted_list_item", { rich_text: [rt("Health: exercise.")] }),
      block("bulleted_list_item", { rich_text: [rt("Learning: courses.")] }),
      block("bulleted_list_item", { rich_text: [rt("Work: themes.")] }),
    ]);
    expect(out).toBe(
      "### Personal goals 2026\n\n- Health: exercise.\n- Learning: courses.\n- Work: themes.\n"
    );
  });
});
