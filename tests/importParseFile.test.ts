import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/import/parseFile.js";

describe("parseMarkdown", () => {
  it("splits frontmatter and body", () => {
    const text = "---\ntitle: Hello World\ntags: [a, b]\n---\n\nFirst para.\n\nSecond.\n";
    const { frontmatter, body } = parseMarkdown(text);
    expect(frontmatter).toEqual({ title: "Hello World", tags: ["a", "b"] });
    expect(body).toBe("First para.\n\nSecond.\n");
  });

  it("handles frontmatter with no body", () => {
    const { frontmatter, body } = parseMarkdown("---\ntitle: Only\n---\n");
    expect(frontmatter).toEqual({ title: "Only" });
    expect(body).toBe("");
  });

  it("handles a file with no frontmatter", () => {
    const { frontmatter, body } = parseMarkdown("# Just a heading\n\ntext");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just a heading\n\ntext");
  });

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = parseMarkdown("---\n---\nbody");
    expect(frontmatter).toEqual({});
    expect(body).toBe("body");
  });

  it("strips a leading BOM", () => {
    const { frontmatter } = parseMarkdown("﻿---\ntitle: X\n---\n");
    expect(frontmatter).toEqual({ title: "X" });
  });

  it("treats an unterminated fence as plain body", () => {
    const text = "---\ntitle: oops\nno close";
    const { frontmatter, body } = parseMarkdown(text);
    expect(frontmatter).toEqual({});
    expect(body).toBe(text);
  });

  it("tolerates CRLF line endings", () => {
    const { frontmatter, body } = parseMarkdown("---\r\ntitle: Win\r\n---\r\n\r\nbody\r\n");
    expect(frontmatter).toEqual({ title: "Win" });
    expect(body).toBe("body\r\n");
  });
});
