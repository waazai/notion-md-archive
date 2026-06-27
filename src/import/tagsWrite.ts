import type { NotionPage } from "../notion.js";

// Resolve relation-typed tag names to page ids in the related database, creating
// any that don't exist yet (title = tag name). The reverse of tags.ts `resolveTags`
// (which goes id -> name). Network access is via the injected TagWriter so this is
// unit-testable with a fake; the real Notion class satisfies the interface and
// routes every call through its single throttle queue.

export interface TagWriter {
  retrieveDatabase(id: string): Promise<{ name: string; properties: Record<string, any> }>;
  queryDatabase(id: string): Promise<NotionPage[]>;
  createPage(databaseId: string, properties: Record<string, unknown>): Promise<string>;
}

/** Resolve `names` to a Notion relation value, auto-creating missing tag pages. */
export async function resolveRelationTags(
  notion: TagWriter,
  databaseId: string,
  names: string[],
  log: (m: string) => void = () => {}
): Promise<{ relation: { id: string }[] }> {
  const { properties: schema } = await notion.retrieveDatabase(databaseId);
  const titleProp = Object.keys(schema).find((k) => schema[k]?.type === "title");
  if (!titleProp) throw new Error(`Related DB ${databaseId} has no title property for tags.`);

  // Build a case-insensitive title -> id index of existing tag pages.
  const index = new Map<string, string>();
  for (const page of await notion.queryDatabase(databaseId)) {
    const title = plainTitle((page.properties as any)[titleProp]);
    if (title) index.set(title.toLowerCase(), page.id);
  }

  const relation: { id: string }[] = [];
  for (const name of names) {
    let id = index.get(name.toLowerCase());
    if (!id) {
      id = await notion.createPage(databaseId, {
        [titleProp]: { title: [{ type: "text", text: { content: name } }] },
      });
      index.set(name.toLowerCase(), id);
      log(`    + created tag "${name}" in the related DB`);
    }
    relation.push({ id });
  }
  return { relation };
}

function plainTitle(prop: any): string {
  return (prop?.title ?? []).map((t: any) => t.plain_text).join("").trim();
}
