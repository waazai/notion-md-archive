import { describe, it, expect } from "vitest";
import { resolveRelationTags, type TagWriter } from "../src/import/tagsWrite.js";
import type { NotionPage } from "../src/notion.js";

/** Fake TagWriter backed by an in-memory related-DB of title->id. */
function fakeNotion(existing: Record<string, string>) {
  const created: { db: string; props: any }[] = [];
  let counter = 1;
  const notion: TagWriter & { created: typeof created } = {
    created,
    async retrieveDatabase() {
      return { name: "Tags", properties: { Name: { type: "title" } } };
    },
    async queryDatabase(): Promise<NotionPage[]> {
      return Object.entries(existing).map(([title, id]) => ({
        id,
        created_time: "",
        last_edited_time: "",
        properties: { Name: { type: "title", title: [{ plain_text: title }] } },
      }));
    },
    async createPage(db: string, props: Record<string, unknown>) {
      created.push({ db, props });
      return `new-${counter++}`;
    },
  };
  return notion;
}

describe("resolveRelationTags (D.1)", () => {
  it("resolves existing tag names to relation ids", async () => {
    const n = fakeNotion({ Work: "w1", Health: "h1" });
    const res = await resolveRelationTags(n, "db", ["Work", "Health"]);
    expect(res).toEqual({ relation: [{ id: "w1" }, { id: "h1" }] });
    expect(n.created).toHaveLength(0);
  });

  it("auto-creates a missing tag page and links it", async () => {
    const n = fakeNotion({ Work: "w1" });
    const res = await resolveRelationTags(n, "db", ["Work", "New Tag"]);
    expect(res.relation[0]).toEqual({ id: "w1" });
    expect(res.relation[1]!.id).toMatch(/^new-/);
    expect(n.created).toHaveLength(1);
    expect(n.created[0]!.props).toEqual({
      Name: { title: [{ type: "text", text: { content: "New Tag" } }] },
    });
  });

  it("matches existing tags case-insensitively", async () => {
    const n = fakeNotion({ Work: "w1" });
    const res = await resolveRelationTags(n, "db", ["work"]);
    expect(res).toEqual({ relation: [{ id: "w1" }] });
    expect(n.created).toHaveLength(0);
  });
});
