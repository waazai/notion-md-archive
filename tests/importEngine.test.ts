import { describe, it, expect } from "vitest";
import { planImport } from "../src/import/engine.js";

describe("planImport", () => {
  const schema = { Name: { type: "title" }, Tags: { type: "multi_select" } };

  it("plans a create from a full note (title, key, properties, blocks)", () => {
    const md = "---\ntitle: Hello World\ncreated: 2026-06-24\n---\n\nHi there.\n\n## Section";
    const plan = planImport(md, schema);
    expect(plan.title).toBe("Hello World");
    expect(plan.key).toBe("2026-06-24-hello-world");
    expect(plan.properties).toEqual({
      Name: { title: [{ type: "text", text: { content: "Hello World" } }] },
    });
    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[0]!.type).toBe("paragraph");
    expect(plan.blocks[1]!.type).toBe("heading_2");
  });

  it("plans a title-only minimal note with an empty body", () => {
    const plan = planImport("---\ntitle: Just Title\n---\n", schema);
    expect(plan.title).toBe("Just Title");
    expect(plan.blocks).toEqual([]);
  });
});
