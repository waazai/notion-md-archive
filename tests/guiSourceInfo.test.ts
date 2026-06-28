import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";

// Import Source is a plain path field; POST /source-info {path} previews how many
// importable markdown files the path holds (same filter the import uses).

async function boot(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

function postJson(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "src-info-"));
  writeFileSync(join(dir, "a.md"), "x");
  writeFileSync(join(dir, "b.md"), "x");
  writeFileSync(join(dir, "INDEX.md"), "x"); // excluded by the import filter
  mkdirSync(join(dir, "sub"));

  server = createServer();
  base = await boot(server);
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("POST /source-info", () => {
  it("counts importable markdown files in a folder (excludes INDEX.md)", async () => {
    const res = await postJson(base, "/source-info", { path: dir });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.kind).toBe("dir");
    expect(body.count).toBe(2);
  });

  it("reports a single file", async () => {
    const res = await postJson(base, "/source-info", { path: join(dir, "a.md") });
    const body: any = await res.json();
    expect(body.kind).toBe("file");
    expect(body.count).toBe(1);
  });

  it("reports a missing path without erroring", async () => {
    const res = await postJson(base, "/source-info", { path: join(dir, "nope") });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.kind).toBe("missing");
    expect(body.count).toBe(0);
  });
});
