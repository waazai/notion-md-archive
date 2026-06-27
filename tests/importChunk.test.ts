import { describe, it, expect } from "vitest";
import { chunk } from "../src/notion.js";

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one batch when under the limit", () => {
    expect(chunk([1, 2, 3], 100)).toEqual([[1, 2, 3]]);
  });

  it("returns [] for an empty array", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("batches exactly at the boundary (Notion's 100-child limit)", () => {
    const arr = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunk(arr, 100);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });
});
