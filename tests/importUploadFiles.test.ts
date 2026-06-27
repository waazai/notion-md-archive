import { describe, it, expect } from "vitest";
import { uploadAll } from "../src/import/uploadFiles.js";

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
