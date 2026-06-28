import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T8: POST /schema {token, db} -> the DB-aware default mapping (what each
// frontmatter key resolves to in that database), via resolvePropName. Injected.

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

describe("POST /schema (T8)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer({
      readConfig: () => ({ token: "", databaseIds: [], outBase: "./out" }),
      resolveSchema: async (token, db) => {
        if (token !== "good") throw new Error("API token is invalid");
        expect(db).toBe("db1");
        return { type: "Type", tags: "Categories", created: "Created", lastSynced: "Last synced" };
      },
    });
    base = await boot(server);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("returns the DB-aware resolved mapping", async () => {
    const res = await postJson(base, "/schema", { token: "good", db: "db1" });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.map).toMatchObject({ type: "Type", tags: "Categories", created: "Created" });
  });

  it("400s when db or token is missing", async () => {
    const res = await postJson(base, "/schema", { token: "good" });
    expect(res.status).toBe(400);
  });

  it("400s with the error for a bad token", async () => {
    const res = await postJson(base, "/schema", { token: "bad", db: "db1" });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });
});
