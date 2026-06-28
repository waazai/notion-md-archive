import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T4: POST /run validates + persists config.json + runs; the engine log streams
// over the GET /log SSE channel, ending with an `event: done` summary. The run
// is injected so the path is exercised offline (no token / network).

async function boot(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

/** Read the SSE stream until `marker` appears (or a short timeout). */
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

describe("POST /run + SSE /log (T4)", () => {
  let server: Server;
  let base: string;
  let written: any = null;

  beforeAll(async () => {
    server = createServer({
      readConfig: () => ({ token: "", databaseIds: [], outBase: "./out" }),
      writeConfig: (cfg) => {
        written = cfg;
      },
      run: async (config, log) => {
        log("# Export start");
        log("✓ note-1.md");
        return {
          databases: [{ name: "DB", notes: 1, written: 1, skipped: 0, attachments: 0, orphans: 0 }],
        };
      },
    });
    base = await boot(server);
  });

  afterAll(() => {
    (server as any).closeAllConnections?.();
    return new Promise<void>((r) => server.close(() => r()));
  });

  it("400s when no token + no database is available", async () => {
    const res = await fetch(`${base}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "export" }),
    });
    expect(res.status).toBe(400);
  });

  it("persists config and streams the log to /log ending with done", async () => {
    // Subscribe to the log first, then start the run.
    const logRes = await fetch(`${base}/log`);
    const reader = logRes.body!.getReader();

    const runRes = await fetch(`${base}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "secret_live",
        databaseIds: ["db-1"],
        outBase: "~/Arch",
        mode: "export",
        dryRun: false,
      }),
    });
    expect(runRes.status).toBe(202);
    const ack: any = await runRes.json();
    expect(ack.ok).toBe(true);

    // config.json was written with the submitted settings.
    expect(written).toMatchObject({ token: "secret_live", databaseIds: ["db-1"], outBase: "~/Arch" });

    const stream = await readSse(reader, "event: done");
    expect(stream).toContain("Export start");
    expect(stream).toContain("note-1.md");
    expect(stream).toContain("event: done");
    expect(stream).toContain('"written":1');
    await reader.cancel();
  });
});
