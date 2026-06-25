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

const DEFAULTS: Required<Omit<PropNames, "title">> = {
  type: "Type",
  tags: "Tags",
  created: "Created",
  lastSynced: "Last synced",
};

/** Map a Notion page to the metadata we archive. `tagMap` resolves relation
 *  page ids -> tag names (unused for multi_select/select tag sources). */
export function mapPageToMeta(
  page: NotionPage,
  tagMap: Map<string, string>,
  names: PropNames = {}
): NoteMeta {
  const props = page.properties ?? {};
  const n = { ...DEFAULTS, ...names };

  const title = readTitle(props, names.title);
  const type = props[n.type]?.select?.name ?? "";
  const tags = resolveTags(props[pickTagProp(props, n.tags)], tagMap);

  // `Created` is a manual date prop; fall back to the page's created_time.
  const rawCreated = props[n.created]?.date?.start ?? page.created_time;
  const lastSynced = props[n.lastSynced]?.date?.start ?? null;

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

/** Pick which property holds the tags: the preferred name if present, else the
 *  first multi_select, else the first relation. Lets the tool work whether the
 *  property is called Tags / Category / tag and is a relation or multi_select. */
export function pickTagProp(properties: Record<string, any>, preferred: string): string {
  if (properties[preferred]) return preferred;
  const byType = (t: string) => Object.keys(properties).find((k) => properties[k]?.type === t);
  return byType("multi_select") ?? byType("relation") ?? preferred;
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
