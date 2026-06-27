import { describe, it, expect } from "vitest";
import { uploadAll, collectLocalMedia, applyUploads } from "../src/import/uploadFiles.js";

describe("uploadAll (E.1)", () => {
  it("uploads each unique path exactly once (content-keyed cache)", async () => {
    const calls: string[] = [];
    const map = await uploadAll(["a.png", "b.png", "a.png"], async (p) => {
      calls.push(p);
      return "id-" + p;
    });
    expect(map.get("a.png")).toBe("id-a.png");
    expect(map.get("b.png")).toBe("id-b.png");
    expect(calls).toEqual(["a.png", "b.png"]); // a.png not uploaded twice
  });

  it("returns an empty map for no paths", async () => {
    const map = await uploadAll([], async () => "x");
    expect(map.size).toBe(0);
  });
});

describe("collectLocalMedia / applyUploads (E.2)", () => {
  const blocks = [
    { type: "paragraph", paragraph: { rich_text: [] } },
    { type: "image", image: { _local: "attachments/a.png", caption: [] } },
    { type: "image", image: { type: "external", external: { url: "http://x/p.png" }, caption: [] } },
  ];

  it("collects local media paths (deduped)", () => {
    expect(collectLocalMedia(blocks)).toEqual(["attachments/a.png"]);
  });

  it("replaces _local with a file_upload reference via the id map", () => {
    const out = applyUploads(blocks, new Map([["attachments/a.png", "up123"]]));
    expect(out[1]).toEqual({
      type: "image",
      image: { type: "file_upload", file_upload: { id: "up123" }, caption: [] },
    });
  });

  it("drops an image whose upload is missing, keeps the rest", () => {
    const out = applyUploads(blocks, new Map());
    expect(out.map((b) => b.type)).toEqual(["paragraph", "image"]); // local dropped, external kept
  });
});
