import YAML from "yaml";
import type { NotionPage } from "./notion.js";
import { slug } from "./paths.js";

export interface NoteMeta {
  title: string;
  type: string;
  tags: string[];
  created: string; // display value, e.g. 2026-06-24T16:20 or 2026-06-24
  fileDate: string; // YYYY-MM-DD, used in the filename
  lastEdited: string; // ISO from Notion
  lastSynced: string | null; // ISO or null
  pageId: string;
}

export interface PropNames {
  title?: string; // default: auto-detect the title-typed property
  type?: string;
  tags?: string;
  created?: string;
  lastSynced?: string;
}

// Default property-name candidates per field (matched case-insensitively).
// A config override replaces the candidate list for that field.
export const NAME_CANDIDATES = {
  type: ["Type"],
  tags: ["Tags", "Tag", "Category", "Categories"],
  created: ["Created"],
  lastSynced: ["Last synced"],
};

/** Find the actual property key matching a config name (if given) or the default
 *  candidates, case-insensitively. Returns undefined when none match. */
export function resolvePropName(
  properties: Record<string, any>,
  configName: string | undefined,
  defaults: string[]
): string | undefined {
  const wanted = (configName ? [configName] : defaults).map((s) => s.toLowerCase());
  return Object.keys(properties).find((k) => wanted.includes(k.toLowerCase()));
}

/** Map a Notion page to the metadata we archive. `tagMap` resolves relation
 *  page ids -> tag names (unused for multi_select/select tag sources). */
export function mapPageToMeta(
  page: NotionPage,
  tagMap: Map<string, string>,
  names: PropNames = {}
): NoteMeta {
  const props = page.properties ?? {};

  const title = readTitle(props, names.title);

  const typeName = resolvePropName(props, names.type, NAME_CANDIDATES.type);
  const type = readType(typeName ? props[typeName] : undefined);

  const tagsName = resolvePropName(props, names.tags, NAME_CANDIDATES.tags);
  const tags = resolveTags(tagsName ? props[tagsName] : undefined, tagMap);

  // `Created` is a manual date prop; fall back to the page's created_time.
  const createdName = resolvePropName(props, names.created, NAME_CANDIDATES.created);
  const rawCreated = (createdName ? props[createdName]?.date?.start : undefined) ?? page.created_time;

  const syncName = resolvePropName(props, names.lastSynced, NAME_CANDIDATES.lastSynced);
  const lastSynced = (syncName ? props[syncName]?.date?.start : undefined) ?? null;

  return {
    title,
    type,
    tags,
    created: formatCreated(rawCreated),
    fileDate: rawCreated.slice(0, 10),
    lastEdited: page.last_edited_time,
    lastSynced,
    pageId: page.id,
  };
}

/** Read the `type` property regardless of its Notion kind: select, status,
 *  multi_select (joined), or rich_text. Missing/other -> "". */
export function readType(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "multi_select":
      return (prop.multi_select ?? []).map((o: { name: string }) => o.name).join(", ");
    case "rich_text":
      return (prop.rich_text ?? []).map((t: { plain_text: string }) => t.plain_text).join("");
    default:
      return "";
  }
}

/** Resolve the tag source property to names. Accepts a relation (resolved via
 *  `tagMap`), a multi_select, or a single select. Missing prop -> []. */
export function resolveTags(prop: any, tagMap: Map<string, string>): string[] {
  if (!prop) return [];
  switch (prop.type) {
    case "relation":
      return (prop.relation ?? []).map((r: { id: string }) => tagMap.get(r.id) ?? r.id);
    case "multi_select":
      return (prop.multi_select ?? []).map((o: { name: string }) => o.name);
    case "select":
      return prop.select ? [prop.select.name] : [];
    default:
      return [];
  }
}

function readTitle(props: Record<string, any>, named?: string): string {
  if (named && props[named]?.title) {
    return joinRich(props[named].title);
  }
  for (const key of Object.keys(props)) {
    if (props[key]?.type === "title") return joinRich(props[key].title);
  }
  return "Untitled";
}

function joinRich(rich: any[]): string {
  return (rich ?? []).map((t) => t.plain_text).join("").trim() || "Untitled";
}

/** Trust Notion's wall-clock string; slice rather than re-zone. */
function formatCreated(raw: string): string {
  return raw.length <= 10 ? raw : raw.slice(0, 16);
}

export function filenameFor(meta: NoteMeta): string {
  return `${meta.fileDate}-${slug(meta.title)}.md`;
}

export function buildFrontmatter(meta: NoteMeta): string {
  const lines = [
    "---",
    `title: ${scalar(meta.title)}`,
    `type:${meta.type ? " " + scalar(meta.type) : ""}`,
    `tags: [${meta.tags.map(scalar).join(", ")}]`,
    `created: ${meta.created}`,
    "---",
  ];
  return lines.join("\n") + "\n";
}

/** YAML-safe single scalar (quotes only when needed). */
function scalar(s: string): string {
  return YAML.stringify(s).trimEnd();
}
