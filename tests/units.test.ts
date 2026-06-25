import { describe, it, expect } from "vitest";
import { slug, sanitizeFolder, expandPath } from "../src/paths.js";
import { mapPageToMeta, buildFrontmatter, filenameFor, resolveTags } from "../src/frontmatter.js";
import { collectMediaUrls, localNameForUrl } from "../src/attachments.js";
import type { NotionPage } from "../src/notion.js";
import type { NotionBlock } from "../src/types.js";

describe("slug / folder", () => {
  it("slugifies titles", () => {
    expect(slug("Personal goals 2026")).toBe("personal-goals-2026");
    expect(slug("  Reading list – business ")).toBe("reading-list-–-business");
    expect(slug("a/b:c?")).toBe("abc");
    expect(slug("")).toBe("untitled");
  });
  it("keeps unicode titles", () => {
    expect(slug("我的筆記")).toBe("我的筆記");
  });
  it("sanitizes folder names", () => {
    expect(sanitizeFolder("My Notes")).toBe("My Notes");
    expect(sanitizeFolder("a/b")).toBe("ab");
  });
  it("expands ~", () => {
    expect(expandPath("~")).not.toContain("~");
    expect(expandPath("/abs")).toBe("/abs");
  });
});

function page(props: Record<string, any>, created = "2026-06-24T16:20:00.000+08:00"): NotionPage {
  return {
    id: "page-1",
    created_time: "2026-06-24T08:20:00.000Z",
    last_edited_time: "2026-06-24T09:42:00.000Z",
    properties: {
      Name: { type: "title", title: [{ plain_text: "Personal goals 2026" }] },
      Type: { type: "select", select: null },
      Category: { type: "relation", relation: [{ id: "cat-personal" }] },
      Created: { type: "date", date: { start: created } },
      ...props,
    },
  };
}

describe("mapPageToMeta + frontmatter", () => {
  const catMap = new Map([["cat-personal", "Personal"]]);

  it("maps title/tags/created and filename", () => {
    const meta = mapPageToMeta(page({}), catMap);
    expect(meta.title).toBe("Personal goals 2026");
    expect(meta.tags).toEqual(["Personal"]);
    expect(meta.created).toBe("2026-06-24T16:20");
    expect(meta.fileDate).toBe("2026-06-24");
    expect(filenameFor(meta)).toBe("2026-06-24-personal-goals-2026.md");
  });

  it("falls back to created_time when Created date is missing", () => {
    const p = page({ Created: { type: "date", date: null } });
    const meta = mapPageToMeta(p, catMap);
    expect(meta.fileDate).toBe("2026-06-24");
    expect(meta.created).toBe("2026-06-24T08:20");
  });

  it("builds YAML frontmatter with inline tags", () => {
    const meta = mapPageToMeta(page({}), catMap);
    expect(buildFrontmatter(meta)).toBe(
      "---\ntitle: Personal goals 2026\ntype:\ntags: [Personal]\ncreated: 2026-06-24T16:20\n---\n"
    );
  });

  it("quotes scalars that need it", () => {
    const p = page({ Name: { type: "title", title: [{ plain_text: "Title: with colon" }] } });
    const meta = mapPageToMeta(p, new Map());
    expect(buildFrontmatter(meta)).toContain('title: "Title: with colon"');
  });

  it("resolves type select and multiple tags", () => {
    const p = page({
      Type: { type: "select", select: { name: "Idea" } },
      Category: { type: "relation", relation: [{ id: "a" }, { id: "b" }] },
    });
    const meta = mapPageToMeta(p, new Map([["a", "Work"], ["b", "Reading"]]));
    expect(meta.type).toBe("Idea");
    expect(buildFrontmatter(meta)).toContain("tags: [Work, Reading]");
  });
});

describe("flexible tags", () => {
  it("resolves relation via category map", () => {
    expect(resolveTags({ type: "relation", relation: [{ id: "a" }] }, new Map([["a", "Work"]]))).toEqual(["Work"]);
  });
  it("resolves multi_select directly", () => {
    expect(resolveTags({ type: "multi_select", multi_select: [{ name: "x" }, { name: "y" }] }, new Map())).toEqual(["x", "y"]);
  });
  it("resolves single select", () => {
    expect(resolveTags({ type: "select", select: { name: "z" } }, new Map())).toEqual(["z"]);
  });
  it("missing prop -> empty", () => {
    expect(resolveTags(undefined, new Map())).toEqual([]);
  });

  it("auto-detects the tag property when the name is absent", () => {
    const p: NotionPage = {
      id: "p", created_time: "2026-06-24T08:20:00.000Z", last_edited_time: "2026-06-24T09:00:00.000Z",
      properties: {
        Name: { type: "title", title: [{ plain_text: "N" }] },
        // no "Tags"; a relation named "Category" should be picked up automatically
        Category: { type: "relation", relation: [{ id: "a" }] },
      },
    };
    const meta = mapPageToMeta(p, new Map([["a", "Work"]]));
    expect(meta.tags).toEqual(["Work"]);
  });

  it("honors a renamed tag property via PropNames", () => {
    const p: NotionPage = {
      id: "p",
      created_time: "2026-06-24T08:20:00.000Z",
      last_edited_time: "2026-06-24T09:00:00.000Z",
      properties: {
        Name: { type: "title", title: [{ plain_text: "N" }] },
        tag: { type: "multi_select", multi_select: [{ name: "alpha" }, { name: "beta" }] },
      },
    };
    const meta = mapPageToMeta(p, new Map(), { tags: "tag" });
    expect(meta.tags).toEqual(["alpha", "beta"]);
  });
});

describe("media collection", () => {
  function blk(type: string, payload: Record<string, unknown>, children?: NotionBlock[]): NotionBlock {
    return { id: "x", type, [type]: payload, children };
  }

  it("collects nested media urls, deduped", () => {
    const tree: NotionBlock[] = [
      blk("image", { type: "file", file: { url: "https://s3/a.png?sig=1" } }),
      blk("toggle", { rich_text: [] }, [
        blk("file", { type: "file", file: { url: "https://s3/b.pdf?sig=2" } }),
        blk("image", { type: "file", file: { url: "https://s3/a.png?sig=1" } }),
      ]),
    ];
    expect(collectMediaUrls(tree).sort()).toEqual([
      "https://s3/a.png?sig=1",
      "https://s3/b.pdf?sig=2",
    ]);
  });

  it("local name is stable across signature changes", () => {
    const a = localNameForUrl("https://s3.aws.com/space/uuid/pic.png?X-Amz-Sig=AAA");
    const b = localNameForUrl("https://s3.aws.com/space/uuid/pic.png?X-Amz-Sig=ZZZ");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-pic\.png$/);
  });
});
