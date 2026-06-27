import { describe, it, expect } from "vitest";
import { selectMarkdownFiles, describePlan } from "../src/import/engine.js";

describe("selectMarkdownFiles (F.1)", () => {
  it("keeps .md files, drops INDEX.md and non-markdown, sorted", () => {
    expect(
      selectMarkdownFiles(["b.md", "INDEX.md", "a.md", "notes.txt", "c.MD"])
    ).toEqual(["a.md", "b.md", "c.MD"]);
  });

  it("excludes INDEX.md case-insensitively", () => {
    expect(selectMarkdownFiles(["index.md", "Index.MD", "keep.md"])).toEqual(["keep.md"]);
  });

  it("returns [] for no markdown files", () => {
    expect(selectMarkdownFiles(["a.txt", "b.png"])).toEqual([]);
  });
});

describe("describePlan (F.2)", () => {
  const base = { title: "T", key: "k", properties: {}, notes: [], blocks: [] };

  it("summarizes props, block count, and relation tags", () => {
    const plan = {
      ...base,
      properties: { Name: {}, Type: {} },
      relationTags: { prop: "Cat", databaseId: "d", names: ["A", "B"] },
      blocks: [{ type: "paragraph" }],
    };
    expect(describePlan(plan as any)).toBe("props: Name, Type; 1 blocks; relation tags: A, B");
  });

  it("omits empty sections", () => {
    expect(describePlan(base as any)).toBe("0 blocks");
  });
});
