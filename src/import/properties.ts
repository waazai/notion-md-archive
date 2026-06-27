import { slug } from "../paths.js";
import { resolvePropName, NAME_CANDIDATES } from "../frontmatter.js";

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

export interface RelationTagRequest {
  prop: string;
  databaseId: string;
  names: string[];
}

export interface BuiltProps {
  properties: Record<string, unknown>;
  /** Human-readable notices (ignored keys, skipped fields, …). */
  notes: string[];
  /** Set when tags map to a relation property — resolved to ids by tagsWrite (Phase D). */
  relationTags?: RelationTagRequest;
}

const HANDLED_KEYS = new Set(["title", "type", "tags", "created"]);

/** Build the `properties` object for pages.create/update from parsed frontmatter
 *  and the target DB schema. Property types are read from the schema (mirrors the
 *  export's `pickTagProp`/`resolvePropName`); `map` overrides the property name per
 *  field. Relation-typed tags are deferred to Phase D. */
export function buildProperties(
  frontmatter: Record<string, unknown>,
  schema: Record<string, any>,
  map: Record<string, string> = {}
): BuiltProps {
  const properties: Record<string, unknown> = {};
  const notes: string[] = [];
  let relationTags: RelationTagRequest | undefined;

  // title — the DB's title-typed property (or the --map override).
  const titleProp =
    (map.title && schema[map.title] ? map.title : undefined) ??
    Object.keys(schema).find((k) => schema[k]?.type === "title");
  const title = readImportMeta(frontmatter).title;
  if (titleProp) properties[titleProp] = titleValue(title);

  // type — select / status / multi_select / rich_text.
  if (typeof frontmatter.type === "string" && frontmatter.type) {
    const prop = resolvePropName(schema, map.type, NAME_CANDIDATES.type);
    const value = prop ? scalarValue(schema[prop].type, frontmatter.type) : null;
    if (prop && value) properties[prop] = value;
    else notes.push(`type: no writable target property (skipped)`);
  }

  // created — a date property.
  if (typeof frontmatter.created === "string" && frontmatter.created) {
    const prop = resolvePropName(schema, map.created, NAME_CANDIDATES.created);
    if (prop && schema[prop].type === "date") {
      properties[prop] = { date: { start: frontmatter.created } };
    }
  }

  // tags — multi_select / select directly; relation deferred to Phase D.
  const tags = toStringArray(frontmatter.tags);
  if (tags.length) {
    const prop = resolvePropName(schema, map.tags, NAME_CANDIDATES.tags);
    const kind = prop ? schema[prop].type : undefined;
    if (prop && kind === "multi_select") {
      properties[prop] = { multi_select: tags.map((name) => ({ name })) };
    } else if (prop && kind === "select") {
      properties[prop] = { select: { name: tags[0] } };
    } else if (prop && kind === "relation") {
      const databaseId = schema[prop].relation?.database_id;
      if (databaseId) {
        relationTags = { prop, databaseId, names: tags };
        notes.push(`tags: "${prop}" is a relation — resolving names to pages (auto-create if missing)`);
      } else {
        notes.push(`tags: "${prop}" is a relation but exposes no database_id (skipped)`);
      }
    } else {
      notes.push(`tags: no writable target property (skipped)`);
    }
  }

  // Notice any frontmatter key we didn't handle and isn't a name override target.
  for (const key of Object.keys(frontmatter)) {
    if (!HANDLED_KEYS.has(key)) notes.push(`ignored frontmatter key: ${key}`);
  }

  return { properties, notes, relationTags };
}

/** Coerce a Notion scalar property value from a string, by target prop type. */
function scalarValue(propType: string, value: string): unknown {
  switch (propType) {
    case "select":
      return { select: { name: value } };
    case "status":
      return { status: { name: value } };
    case "multi_select":
      return { multi_select: [{ name: value }] };
    case "rich_text":
      return { rich_text: [{ type: "text", text: { content: value } }] };
    default:
      return null;
  }
}

/** Normalize a frontmatter tags value (array, string, or absent) to string[]. */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
