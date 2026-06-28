import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T6: POST /run with mode "import" runs runImport over the chosen Source and
// streams the log, ending with an import summary. runImport is injected.

async function boot(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

async function readSse(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  const dec = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: false }>((r) => setTimeout(() => r({ value: undefined, done: false }), 150)),
    ]);
    if (next.done) break;
    if (next.value) text += dec.decode(next.value, { stream: true });
    if (text.includes(marker)) break;
  }
  return text;
}

describe("POST /run mode=import (T6)", () => {
  let server: Server;
  let base: string;
  let importOpts: any = null;

  beforeAll(async () => {
    server = createServer({
      readConfig: () => ({ token: "", databaseIds: [], outBase: "./out" }),
      writeConfig: () => {},
      runImport: async (config, opts, log) => {
        importOpts = opts;
        log("· note-1.md: would create \"Note 1\"");
        return [{ file: "note-1.md", title: "Note 1", action: "would-create", pageId: "", blocks: 3 }];
      },
    });
    base = await boot(server);
  });
  afterAll(() => {
    (server as any).closeAllConnections?.();
    return new Promise<void>((r) => server.close(() => r()));
  });

  it("400s when the source is missing", async () => {
    const res = await fetch(`${base}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "import", token: "secret_x", databaseIds: ["db-1"] }),
    });
    expect(res.status).toBe(400);
  });

  it("runs the import and streams an import summary", async () => {
    const logRes = await fetch(`${base}/log`);
    const reader = logRes.body!.getReader();

    const runRes = await fetch(`${base}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "import",
        token: "secret_x",
        databaseIds: ["db-1"],
        source: "./out/Notes",
        dryRun: true,
        props: { tags: "Topics" },
      }),
    });
    expect(runRes.status).toBe(202);

    // Source resolved to a dir (no .md extension); map passed through.
    expect(importOpts.dir).toBe("./out/Notes");
    expect(importOpts.dryRun).toBe(true);
    expect(importOpts.map).toMatchObject({ tags: "Topics" });

    const stream = await readSse(reader, "event: done");
    expect(stream).toContain("note-1.md");
    expect(stream).toContain("event: done");
    expect(stream).toContain('"created":1');
    await reader.cancel();
  });
});
