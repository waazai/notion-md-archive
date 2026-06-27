import { readFile } from "node:fs/promises";
import { Notion, type NotionPage } from "../notion.js";
import type { AppConfig } from "../config.js";
import { mapPageToMeta, filenameFor, type PropNames } from "../frontmatter.js";
import { parseMarkdown } from "./parseFile.js";
import { readImportMeta, identityKey, buildProperties } from "./properties.js";
import { mdToBlocks, type BlockInput } from "./mdToBlocks.js";
import type { ImportOptions } from "./options.js";

export interface ImportPlan {
  title: string;
  key: string; // identity key (YYYY-MM-DD-slug), used for upsert in C.2
  properties: Record<string, unknown>;
  notes: string[];
  blocks: BlockInput[];
}

export interface ImportResult {
  file: string;
  title: string;
  action: "created" | "updated" | "would-create" | "would-update";
  pageId: string;
  blocks: number;
}

/** Find an existing page whose identity key matches `key`, reusing the export's
 *  page->meta mapping so import/export identity stay consistent. Pure. */
export function findExisting(pages: NotionPage[], key: string, names: PropNames = {}): string | null {
  for (const page of pages) {
    const meta = mapPageToMeta(page, new Map(), names);
    if (filenameFor(meta).replace(/\.md$/, "") === key) return page.id;
  }
  return null;
}

/** Pure: a Markdown file's text + the target DB schema -> what to write.
 *  No network — composes parseMarkdown / properties / mdToBlocks. */
export function planImport(
  text: string,
  schema: Record<string, any>,
  map: Record<string, string> = {}
): ImportPlan {
  const { frontmatter, body } = parseMarkdown(text);
  const meta = readImportMeta(frontmatter);
  const built = buildProperties(frontmatter, schema, map);
  return {
    title: meta.title,
    key: identityKey(meta),
    properties: built.properties,
    notes: built.notes,
    blocks: mdToBlocks(body),
  };
}

/** Import a single Markdown file into the target database (create-only — A.6).
 *  Upsert (C.2), relation tags (D), attachments (E), and --dir (F.1) build on this. */
export async function runImport(
  config: AppConfig,
  opts: ImportOptions,
  log: (m: string) => void = console.log
): Promise<ImportResult[]> {
  if (!opts.file) {
    throw new Error("runImport currently handles a single --file (folder import lands in F.1).");
  }

  const notion = new Notion(config.token);
  const dbId = config.databaseIds[0]!;
  const { name: dbName, properties: schema } = await notion.retrieveDatabase(dbId);

  const text = await readFile(opts.file, "utf8");
  const plan = planImport(text, schema, opts.map);
  for (const note of plan.notes) log(`    ! ${note}`);

  // Upsert: match an existing page by identity key (title + Created date).
  const pages = await notion.queryDatabase(dbId);
  const existingId = findExisting(pages, plan.key, config.props ?? {});

  if (opts.dryRun) {
    const verb = existingId ? "update" : "create";
    log(`  · ${opts.file}: would ${verb} "${plan.title}" in ${dbName} (${plan.blocks.length} blocks)`);
    return [{ file: opts.file, title: plan.title, action: existingId ? "would-update" : "would-create", pageId: existingId ?? "", blocks: plan.blocks.length }];
  }

  if (existingId) {
    await notion.updateProps(existingId, plan.properties);
    await notion.deleteChildren(existingId); // replace body so re-runs don't duplicate blocks
    if (plan.blocks.length) await notion.appendChildren(existingId, plan.blocks);
    log(`  ✓ ${opts.file}: updated "${plan.title}" in ${dbName} (${plan.blocks.length} blocks)`);
    return [{ file: opts.file, title: plan.title, action: "updated", pageId: existingId, blocks: plan.blocks.length }];
  }

  const pageId = await notion.createPage(dbId, plan.properties);
  if (plan.blocks.length) await notion.appendChildren(pageId, plan.blocks);
  log(`  ✓ ${opts.file}: created "${plan.title}" in ${dbName} (${plan.blocks.length} blocks)`);
  return [{ file: opts.file, title: plan.title, action: "created", pageId, blocks: plan.blocks.length }];
}
