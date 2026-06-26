import { describe, it, expect } from "vitest";
import { parseImportArgs } from "../src/import/options.js";

describe("parseImportArgs", () => {
  it("parses --file with --db and --dry-run", () => {
    const o = parseImportArgs(["--file", "note.md", "--db", "abc123", "--dry-run"]);
    expect(o.file).toBe("note.md");
    expect(o.db).toBe("abc123");
    expect(o.dryRun).toBe(true);
    expect(o.dir).toBeUndefined();
    expect(o.map).toEqual({});
  });

  it("parses --dir, defaulting dryRun to false", () => {
    const o = parseImportArgs(["--dir", "./out/MyDB"]);
    expect(o.dir).toBe("./out/MyDB");
    expect(o.file).toBeUndefined();
    expect(o.dryRun).toBe(false);
  });

  it("parses --map into a record (comma list, repeatable + merged)", () => {
    const o = parseImportArgs([
      "--file", "n.md",
      "--map", "title=Name,tags=Topics",
      "--map", "type=Kind",
    ]);
    expect(o.map).toEqual({ title: "Name", tags: "Topics", type: "Kind" });
  });

  it("requires exactly one of --file / --dir", () => {
    expect(() => parseImportArgs([])).toThrow(/--file|--dir/);
    expect(() => parseImportArgs(["--file", "a.md", "--dir", "d"])).toThrow(/both/i);
  });

  it("throws when a value-flag is missing its value", () => {
    expect(() => parseImportArgs(["--file"])).toThrow(/--file/);
    expect(() => parseImportArgs(["--file", "a.md", "--db"])).toThrow(/--db/);
  });

  it("throws on an unknown flag", () => {
    expect(() => parseImportArgs(["--file", "a.md", "--bogus"])).toThrow(/bogus/i);
  });

  it("rejects a bad --map entry (no '=')", () => {
    expect(() => parseImportArgs(["--file", "a.md", "--map", "titleName"])).toThrow(/map/i);
  });
});
