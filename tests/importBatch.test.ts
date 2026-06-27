import { describe, it, expect } from "vitest";
import { selectMarkdownFiles } from "../src/import/engine.js";

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
