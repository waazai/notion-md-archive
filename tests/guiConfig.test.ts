import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer, maskToken } from "../src/server.js";

// T2: GET /config returns the persisted settings to pre-fill the form, with the
// token masked (never sent raw to the page).

async function boot(server: Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe("maskToken", () => {
  it("returns empty for no token", () => {
    expect(maskToken("")).toBe("");
  });
  it("keeps a tail hint but hides the middle", () => {
    const m = maskToken("secret_abcdEFGH1234");
    expect(m).toContain("1234");
    expect(m).not.toContain("abcdEFGH");
  });
  it("fully masks a short token", () => {
    expect(maskToken("abc")).not.toContain("abc");
  });
});

describe("GET /config (T2)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer({
      readConfig: () => ({
        token: "secret_xxxxxxxx7890",
        databaseIds: ["db1", "db2"],
        outBase: "~/Arch",
      }),
    });
    base = await boot(server);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("returns the prefill view as JSON with a masked token", async () => {
    const res = await fetch(`${base}/config`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body: any = await res.json();
    expect(body.tokenSet).toBe(true);
    expect(body.tokenHint).toContain("7890");
    expect(body.tokenHint).not.toContain("xxxxxxxx");
    expect(body.databaseIds).toEqual(["db1", "db2"]);
    expect(body.outBase).toBe("~/Arch");
  });
});

describe("GET /config — no token set", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer({
      readConfig: () => ({ token: "", databaseIds: [], outBase: "./out" }),
    });
    base = await boot(server);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("reports tokenSet false and never throws", async () => {
    const res = await fetch(`${base}/config`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.tokenSet).toBe(false);
    expect(body.tokenHint).toBe("");
    expect(body.outBase).toBe("./out");
  });
});
