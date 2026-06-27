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

describe("buildProperties (C.1)", () => {
  const schema = {
    Name: { type: "title" },
    Type: { type: "select" },
    Tags: { type: "multi_select" },
    Created: { type: "date" },
  };

  it("emits a title value keyed by the schema's title-typed prop", () => {
    const { properties } = buildProperties({ title: "Hi" }, { Name: { type: "title" }, Tags: { type: "multi_select" } });
    expect(properties).toEqual({ Name: { title: [{ type: "text", text: { content: "Hi" } }] } });
  });

  it("returns no title when the DB has no title-typed property", () => {
    const { properties } = buildProperties({ title: "Hi" }, { Tags: { type: "multi_select" } });
    expect(properties).toEqual({});
  });

  it("maps title + type(select) + tags(multi_select) + created(date)", () => {
    const fm = { title: "Hi", type: "Note", tags: ["a", "b"], created: "2026-06-24" };
    const { properties } = buildProperties(fm, schema);
    expect(properties).toEqual({
      Name: { title: [{ type: "text", text: { content: "Hi" } }] },
      Type: { select: { name: "Note" } },
      Tags: { multi_select: [{ name: "a" }, { name: "b" }] },
      Created: { date: { start: "2026-06-24" } },
    });
  });

  it("writes a status-typed type prop", () => {
    const { properties } = buildProperties(
      { title: "x", type: "Done" },
      { Name: { type: "title" }, Type: { type: "status" } }
    );
    expect(properties.Type).toEqual({ status: { name: "Done" } });
  });

  it("writes a scalar tag into a select-typed tag prop", () => {
    const { properties } = buildProperties(
      { title: "x", tags: "solo" },
      { Name: { type: "title" }, Tags: { type: "select" } }
    );
    expect(properties.Tags).toEqual({ select: { name: "solo" } });
  });

  it("defers a relation-typed tag prop (Phase D) and notes it", () => {
    const { properties, notes } = buildProperties(
      { title: "x", tags: ["t"] },
      { Name: { type: "title" }, Category: { type: "relation" } }
    );
    expect(properties.Category).toBeUndefined();
    expect(notes.join(" ")).toMatch(/relation/i);
  });

  it("honors a --map override for a field name", () => {
    const { properties } = buildProperties(
      { title: "Hi", type: "N" },
      { Name: { type: "title" }, Kind: { type: "select" } },
      { type: "Kind" }
    );
    expect(properties.Kind).toEqual({ select: { name: "N" } });
  });

  it("notes ignored frontmatter keys with no target", () => {
    const { notes } = buildProperties({ title: "Hi", author: "me" }, { Name: { type: "title" } });
    expect(notes.join(" ")).toMatch(/author/);
  });
});
