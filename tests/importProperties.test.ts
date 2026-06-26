import { describe, it, expect } from "vitest";
import { readImportMeta, identityKey, buildProperties } from "../src/import/properties.js";

describe("readImportMeta", () => {
  it("reads title and created from frontmatter", () => {
    expect(readImportMeta({ title: "Hello World", created: "2026-06-24" })).toEqual({
      title: "Hello World",
      created: "2026-06-24",
    });
  });

  it("falls back to Untitled when title is missing/blank", () => {
    expect(readImportMeta({}).title).toBe("Untitled");
    expect(readImportMeta({ title: "   " }).title).toBe("Untitled");
  });

  it("ignores a non-string created", () => {
    expect(readImportMeta({ title: "X", created: 2026 }).created).toBeUndefined();
  });
});

describe("identityKey", () => {
  it("matches the export filename stem (YYYY-MM-DD-slug)", () => {
    expect(identityKey({ title: "Personal goals 2026", created: "2026-06-24T16:20" })).toBe(
      "2026-06-24-personal-goals-2026"
    );
  });
});

describe("buildProperties", () => {
  it("emits a Notion title value keyed by the schema's title-typed prop", () => {
    const schema = { Name: { type: "title" }, Tags: { type: "multi_select" } };
    expect(buildProperties({ title: "Hi" }, schema)).toEqual({
      Name: { title: [{ type: "text", text: { content: "Hi" } }] },
    });
  });

  it("returns no title when the DB has no title-typed property", () => {
    expect(buildProperties({ title: "Hi" }, { Tags: { type: "multi_select" } })).toEqual({});
  });
});
