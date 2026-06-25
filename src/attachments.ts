import { createHash } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { NotionBlock, MediaMap } from "./types.js";
import { extractMediaUrl } from "./convert.js";

const MEDIA_TYPES = new Set(["image", "file", "pdf", "video", "audio"]);

/** Walk the tree and collect every downloadable media URL (deduped). */
export function collectMediaUrls(blocks: NotionBlock[]): string[] {
  const urls = new Set<string>();
  const walk = (bs: NotionBlock[]) => {
    for (const b of bs) {
      if (MEDIA_TYPES.has(b.type)) {
        const data = (b[b.type] ?? {}) as Record<string, unknown>;
        const url = extractMediaUrl(data);
        if (url) urls.add(url);
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return [...urls];
}

/** Stable local filename from a (signed) Notion URL. Keyed on the path, not the
 *  query string, so the signature rotating between exports doesn't change it. */
export function localNameForUrl(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* keep raw */
  }
  const hash = createHash("sha1").update(pathname).digest("hex").slice(0, 8);
  const base = basename(pathname) || "file";
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const safeStem = stem.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40) || "file";
  return `${hash}-${safeStem}${ext}`;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
};

/** Download all URLs into `attachmentsDir`, skipping any already present.
 *  Returns originalUrl -> "attachments/<name>" for the converter. */
export async function downloadAll(
  urls: string[],
  attachmentsDir: string,
  log: (msg: string) => void = () => {}
): Promise<MediaMap> {
  const map: MediaMap = new Map();
  for (const url of urls) {
    let name = localNameForUrl(url);
    const target = join(attachmentsDir, name);
    if (await exists(target)) {
      map.set(url, "attachments/" + name);
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!extname(name)) {
        const ext = EXT_BY_MIME[res.headers.get("content-type")?.split(";")[0] ?? ""] ?? "";
        if (ext) name += ext;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(join(attachmentsDir, name), buf);
      map.set(url, "attachments/" + name);
      log(`  ↓ ${name}`);
    } catch (err) {
      log(`  ! attachment failed (${(err as Error).message}); keeping remote url`);
      // leave unmapped -> converter keeps the original url
    }
  }
  return map;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
