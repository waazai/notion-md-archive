import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T1: the GUI backend serves the static frontend (no data wiring yet).
// We bind an ephemeral port and assert the static-serving contract only.

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("gui server — static serving (T1)", () => {
  it("serves index.html at /", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("notion-md-archive");
    expect(body).toContain("styles.css");
    expect(body).toContain("app.js");
  });

  it("serves styles.css with the css content-type", async () => {
    const res = await fetch(`${base}/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("serves app.js with a javascript content-type", async () => {
    const res = await fetch(`${base}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("404s unknown paths", async () => {
    const res = await fetch(`${base}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
