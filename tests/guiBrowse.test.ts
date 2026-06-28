import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createServer } from "../src/server.js";

// T7: GET /browse?path= lists a directory (read-only) for the Source picker —
// folders first, with a `dir` flag, plus the parent path for "up" navigation.

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "browse-"));
  mkdirSync(join(dir, "subfolder"));
  writeFileSync(join(dir, "note.md"), "x");

  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("GET /browse (T7)", () => {
  it("lists a directory, folders first, with a parent path", async () => {
    const res = await fetch(`${base}/browse?path=${encodeURIComponent(dir)}`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.path).toBe(dir);
    expect(body.parent).toBe(dirname(dir));
    expect(body.entries).toContainEqual({ name: "subfolder", dir: true });
    expect(body.entries).toContainEqual({ name: "note.md", dir: false });
    // Folders are sorted before files.
    expect(body.entries[0].dir).toBe(true);
  });

  it("400s on a path that cannot be read", async () => {
    const res = await fetch(`${base}/browse?path=${encodeURIComponent(join(dir, "does-not-exist"))}`);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBeTruthy();
  });
});
