import { slug } from "../paths.js";

// Frontmatter -> Notion property payloads (the reverse of frontmatter.ts). Pure
// & synchronous. A.3 covers the minimal path: title + identity key. Type/created/
// tags mapping and `--map` overrides land in C.1.

export interface ImportMeta {
  title: string;
  /** Display value from frontmatter, e.g. 2026-06-24 or 2026-06-24T16:20. */
  created?: string;
}

/** Pull the minimal note metadata out of parsed frontmatter. */
export function readImportMeta(frontmatter: Record<string, unknown>): ImportMeta {
  const rawTitle = frontmatter.title;
  const title =
    typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : "Untitled";
  const created = typeof frontmatter.created === "string" ? frontmatter.created : undefined;
  return { title, created };
}

/** Identity key = the export filename stem, `YYYY-MM-DD-slug(title)`. Used to
 *  match an existing Notion page on re-import (upsert lands in C.2). */
export function identityKey(meta: ImportMeta): string {
  const date = (meta.created ?? "").slice(0, 10);
  return `${date}-${slug(meta.title)}`;
}

/** A Notion title property value: `{ title: [ rich_text ] }`. */
export function titleValue(title: string): { title: unknown[] } {
  return { title: [{ type: "text", text: { content: title } }] };
}

/** Build the `properties` object for pages.create/update from note metadata and
 *  the target DB schema. Minimal for now: just the title, keyed by the DB's
 *  title-typed property. */
export function buildProperties(
  meta: ImportMeta,
  schema: Record<string, any>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const titleProp = Object.keys(schema).find((k) => schema[k]?.type === "title");
  if (titleProp) out[titleProp] = titleValue(meta.title);
  return out;
}
