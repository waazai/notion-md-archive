import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T3: POST /databases {token} -> the databases the integration can see, for the
// picker. The Notion call is injected so the test runs offline.

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

describe("POST /databases (T3)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer({
      // Empty saved token so the "missing token" path is deterministic offline
      // (no fallback to a real .env token).
      readConfig: () => ({ token: "", databaseIds: [], outBase: "./out" }),
      listDatabases: async (token) => {
        if (token !== "good") throw new Error("API token is invalid");
        return [
          { id: "a", name: "DB A" },
          { id: "b", name: "DB B" },
        ];
      },
    });
    base = await boot(server);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("lists databases for a valid token", async () => {
    const res = await postJson(base, "/databases", { token: "good" });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.databases).toEqual([
      { id: "a", name: "DB A" },
      { id: "b", name: "DB B" },
    ]);
  });

  it("returns a 400 with an error message for a bad token", async () => {
    const res = await postJson(base, "/databases", { token: "bad" });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it("returns a 400 when the token is missing", async () => {
    const res = await postJson(base, "/databases", {});
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBeTruthy();
  });
});
