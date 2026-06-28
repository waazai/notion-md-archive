import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

// T5: the page is restructured into Export / Import tabs. Token + Database are
// shared; Output lives in the Export tab, Source in the Import tab. This guards
// the layout contract by inspecting the served HTML.

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("GUI layout — Export/Import tabs (T5)", () => {
  it("serves tabs, with Output in Export and Source in Import", async () => {
    const html = await (await fetch(`${base}/`)).text();

    // Tab controls + panels.
    expect(html).toContain('data-tab="export"');
    expect(html).toContain('data-tab="import"');
    expect(html).toContain('id="tab-export"');
    expect(html).toContain('id="tab-import"');
    expect(html).toContain('id="run-export"');
    expect(html).toContain('id="run-import"');

    // Field placement: Output in the export panel, Source in the import panel.
    const exportPanel = html.split('id="tab-export"')[1]!.split('id="tab-import"')[0]!;
    expect(exportPanel).toContain('id="output"');
    expect(exportPanel).toContain('id="since"');

    const importPanel = html.split('id="tab-import"')[1]!;
    expect(importPanel).toContain('id="source"');
    expect(importPanel).toContain('id="source-info"');

    // The old radio mode-toggle is gone.
    expect(html).not.toContain('name="mode"');
  });
});
