import { describe, it, expect } from "vitest";
import { findExisting } from "../src/import/engine.js";
import type { NotionPage } from "../src/notion.js";

function page(title: string, created: string, id: string): NotionPage {
  return {
    id,
    created_time: created,
    last_edited_time: created,
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
      Created: { type: "date", date: { start: created } },
    },
  };
}

describe("findExisting (C.2)", () => {
  const pages = [page("Other note", "2026-06-01", "p1"), page("Hello World", "2026-06-24", "p2")];

  it("matches a page by identity key (title + created date)", () => {
    expect(findExisting(pages, "2026-06-24-hello-world", {})).toBe("p2");
  });

  it("returns null when nothing matches", () => {
    expect(findExisting(pages, "2026-06-24-not-here", {})).toBeNull();
  });

  it("matches consistently with the export filename stem", () => {
    // "Personal goals 2026" -> 2026-06-05-personal-goals-2026
    const p = [page("Personal goals 2026", "2026-06-05T10:00", "pg")];
    expect(findExisting(p, "2026-06-05-personal-goals-2026", {})).toBe("pg");
  });
});
