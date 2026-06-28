import { describe, it, expect } from "vitest";
import { configBaseDir } from "../src/config.js";

// R2: a packaged single-file executable resolves config.json / .env / out beside
// the binary (dirname of process.execPath), not process.cwd() — a double-clicked
// exe has an unreliable cwd (on macOS it is "/"). Dev / CLI (not packaged) keep
// cwd-relative behaviour unchanged.

describe("configBaseDir (R2)", () => {
  it("uses cwd when not packaged (dev / CLI)", () => {
    expect(configBaseDir(false, "/usr/bin/node", "/work/proj")).toBe("/work/proj");
  });

  it("uses the executable's directory when packaged", () => {
    expect(configBaseDir(true, "/Apps/notion-md-archive.exe", "/")).toBe("/Apps");
  });
});
