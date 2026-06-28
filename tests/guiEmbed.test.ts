import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EMBEDDED } from "../src/gui/embedded.generated.js";

// R1: the GUI static files are embedded into a generated module so a single-file
// executable (no src/gui on disk) can still serve them from memory. This test is
// the drift guard: the embedded copy must byte-match the on-disk source, so an
// edit to src/gui/* without re-running `npm run embed:gui` fails CI.

const GUI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "gui");
const FILES = ["index.html", "styles.css", "app.js"];

describe("gui embed (R1)", () => {
  it("embeds every served static file", () => {
    for (const f of FILES) expect(EMBEDDED[f]).toBeTypeOf("string");
  });

  it("embedded content matches src/gui on disk (drift guard)", () => {
    for (const f of FILES) {
      const onDisk = readFileSync(join(GUI_DIR, f), "utf8");
      expect(EMBEDDED[f]).toBe(onDisk);
    }
  });
});
