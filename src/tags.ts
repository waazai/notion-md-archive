import type { Notion, NotionPage } from "./notion.js";
import { resolvePropName, NAME_CANDIDATES } from "./frontmatter.js";

// Resolve relation-based tag page-ids -> names. We collect every distinct related
// id across all notes, then resolve each once (cached) — far fewer calls than
// resolving per note. multi_select/select tags need no resolution and are read
// directly by `resolveTags`, so they are skipped here.

export async function buildTagMap(
  notion: Notion,
  pages: NotionPage[],
  configTagName?: string
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const p of pages) {
    const props = p.properties ?? {};
    const name = resolvePropName(props, configTagName, NAME_CANDIDATES.tags);
    const prop = name ? props[name] : undefined;
    if (prop?.type === "relation") {
      for (const r of (prop.relation ?? []) as { id: string }[]) ids.add(r.id);
    }
  }
  const map = new Map<string, string>();
  for (const id of ids) {
    map.set(id, await notion.pageTitle(id));
  }
  return map;
}
