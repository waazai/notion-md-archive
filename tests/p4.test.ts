import { describe, it, expect } from "vitest";
import { shouldExport } from "../src/incremental.js";
import { buildIndexMarkdown, type IndexRow } from "../src/indexfile.js";

describe("shouldExport (--since)", () => {
  it("without --since always exports", () => {
    expect(shouldExport({ lastEdited: "2026-01-01T00:00:00Z", lastSynced: "2030-01-01T00:00:00Z" }, false)).toBe(true);
  });
  it("never-synced note always exports", () => {
    expect(shouldExport({ lastEdited: "2026-01-01T00:00:00Z", lastSynced: null }, true)).toBe(true);
  });
  it("edited after sync -> export", () => {
    expect(shouldExport({ lastEdited: "2026-06-25T10:00:00Z", lastSynced: "2026-06-24T10:00:00Z" }, true)).toBe(true);
  });
  it("edited before/at sync -> skip", () => {
    expect(shouldExport({ lastEdited: "2026-06-24T10:00:00Z", lastSynced: "2026-06-25T10:00:00Z" }, true)).toBe(false);
    expect(shouldExport({ lastEdited: "2026-06-24T10:00:00Z", lastSynced: "2026-06-24T10:00:00Z" }, true)).toBe(false);
  });
  it("absorbs the write-back self-edit within tolerance -> skip", () => {
    // last_edited bumped ~0.5s after we wrote last_synced = now
    expect(shouldExport({ lastEdited: "2026-06-24T10:00:00.500Z", lastSynced: "2026-06-24T10:00:00.000Z" }, true)).toBe(false);
    // edge: 59s after still within the 1-min window
    expect(shouldExport({ lastEdited: "2026-06-24T10:00:59Z", lastSynced: "2026-06-24T10:00:00Z" }, true)).toBe(false);
  });
  it("a real edit beyond tolerance -> export", () => {
    // 90s after the sync = a genuine post-sync edit
    expect(shouldExport({ lastEdited: "2026-06-24T10:01:30Z", lastSynced: "2026-06-24T10:00:00Z" }, true)).toBe(true);
  });
});

describe("buildIndexMarkdown", () => {
  const rows: IndexRow[] = [
    { filename: "2026-06-24-alpha.md", title: "Alpha", created: "2026-06-24T16:20", tags: ["Work"], lastSynced: "2026-06-25T14:02:00Z" },
    { filename: "2026-06-25-beta.md", title: "Beta | edge", created: "2026-06-25T09:00", tags: ["Reading", "Personal"], lastSynced: null },
  ];

  it("renders a sorted table (newest first) with header and count", () => {
    const md = buildIndexMarkdown("Notes", rows, [], new Date("2026-06-25T00:00:00Z"));
    expect(md).toContain("# Notes — archive index");
    expect(md).toContain("_2 notes · generated 2026-06-25_");
    expect(md).toContain("| File | Title | Created | Tags | Last synced |");
    // beta (2026-06-25) sorts before alpha (2026-06-24)
    expect(md.indexOf("beta.md")).toBeLessThan(md.indexOf("alpha.md"));
  });

  it("escapes pipes and shows em-dash for null sync", () => {
    const md = buildIndexMarkdown("Notes", rows, [], new Date("2026-06-25T00:00:00Z"));
    expect(md).toContain("Beta \\| edge");
    expect(md).toContain("Reading, Personal");
    expect(md).toMatch(/beta\.md.*\| — \|/); // null lastSynced -> —
  });

  it("renders Orphans section only when present", () => {
    const none = buildIndexMarkdown("Notes", rows, []);
    expect(none).not.toContain("## Orphans");
    const some = buildIndexMarkdown("Notes", rows, ["2026-01-01-old.md"]);
    expect(some).toContain("## Orphans");
    expect(some).toContain("[2026-01-01-old.md](2026-01-01-old.md)");
  });
});
