import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { BlockInput } from "./mdToBlocks.js";

// Upload local attachments to Notion via the File Upload REST API. The SDK
// (@notionhq/client 2.3.0) has no file-upload surface, so we call the endpoints
// directly with fetch — consistent with attachments.ts (which fetches downloads)
// and isolated here so the export path is untouched.

const NOTION_VERSION = "2022-06-28";

/** Collect the local-attachment paths (`_local` placeholders) from a block list. */
export function collectLocalMedia(blocks: BlockInput[]): string[] {
  const out: string[] = [];
  const walk = (bs: BlockInput[]) => {
    for (const b of bs) {
      const data = b[b.type] as any;
      if (data?._local) out.push(data._local);
      if (Array.isArray(data?.children)) walk(data.children);
    }
  };
  walk(blocks);
  return [...new Set(out)];
}

/** Replace each `_local` placeholder with a `file_upload` reference using the
 *  path->id map. A block whose upload is missing is dropped. Pure (returns a new
 *  list). */
export function applyUploads(blocks: BlockInput[], idByPath: Map<string, string>): BlockInput[] {
  const out: BlockInput[] = [];
  for (const b of blocks) {
    const data = b[b.type] as any;
    if (data?._local) {
      const id = idByPath.get(data._local);
      if (!id) continue; // upload failed/missing -> drop the block
      const { _local, ...rest } = data;
      out.push({ type: b.type, [b.type]: { type: "file_upload", file_upload: { id }, ...rest } });
      continue;
    }
    if (Array.isArray(data?.children)) {
      out.push({ type: b.type, [b.type]: { ...data, children: applyUploads(data.children, idByPath) } });
      continue;
    }
    out.push(b);
  }
  return out;
}

/** Dedup-and-upload: map each unique path to its uploaded id via `uploadOne`.
 *  Pure orchestration (the network lives in `uploadOne`), so it's unit-testable. */
export async function uploadAll(
  paths: string[],
  uploadOne: (path: string) => Promise<string>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const p of paths) {
    if (!map.has(p)) map.set(p, await uploadOne(p));
  }
  return map;
}

/** Upload a single local file to Notion; returns the `file_upload` id to put in a
 *  block. Two-step: create the upload object, then POST the bytes. Network —
 *  verified at CP-E. */
export async function notionUploadFile(token: string, absPath: string): Promise<string> {
  const auth = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
  };

  // 1. Create the file-upload object.
  const created = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!created.ok) {
    throw new Error(`file_uploads create failed: HTTP ${created.status}`);
  }
  const { id, upload_url } = (await created.json()) as { id: string; upload_url: string };

  // 2. Send the file bytes as multipart/form-data.
  const buf = await readFile(absPath);
  const form = new FormData();
  form.append("file", new Blob([buf]), basename(absPath));
  const sent = await fetch(upload_url, { method: "POST", headers: auth, body: form });
  if (!sent.ok) {
    throw new Error(`file upload send failed (${basename(absPath)}): HTTP ${sent.status}`);
  }

  return id;
}
