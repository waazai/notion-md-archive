import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { Notion, type NotionPage } from "../notion.js";
import type { AppConfig } from "../config.js";
import { mapPageToMeta, filenameFor, type PropNames } from "../frontmatter.js";
import { parseMarkdown } from "./parseFile.js";
import { readImportMeta, identityKey, buildProperties, type RelationTagRequest } from "./properties.js";
import { mdToBlocks, type BlockInput } from "./mdToBlocks.js";
import { resolveRelationTags } from "./tagsWrite.js";
import { collectLocalMedia, applyUploads, uploadAll, notionUploadFile } from "./uploadFiles.js";
import type { ImportOptions } from "./options.js";

export interface ImportPlan {
  title: string;
  key: string; // identity key (YYYY-MM-DD-slug), used for upsert in C.2
  properties: Record<string, unknown>;
  notes: string[];
  relationTags?: RelationTagRequest;
  blocks: BlockInput[];
}

export interface ImportResult {
  file: string;
  title: string;
  action: "created" | "updated" | "would-create" | "would-update" | "failed";
  pageId: string;
  blocks: number;
}

/** Pure: a one-line summary of what a plan would write (for --dry-run output). */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  const props = Object.keys(plan.properties);
  if (props.length) parts.push(`props: ${props.join(", ")}`);
  parts.push(`${plan.blocks.length} blocks`);
  if (plan.relationTags) parts.push(`relation tags: ${plan.relationTags.names.join(", ")}`);
  return parts.join("; ");
}

/** Pure: pick importable Markdown files from a directory listing — `.md` only
 *  (case-insensitive), excluding the export's `INDEX.md`, sorted. */
export function selectMarkdownFiles(names: string[]): string[] {
  return names
    .filter((n) => n.toLowerCase().endsWith(".md") && n.toLowerCase() !== "index.md")
    .sort((a, b) => a.localeCompare(b));
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
    relationTags: built.relationTags,
    blocks: mdToBlocks(body),
  };
}

/** Resolve the source files: a single `--file`, or every importable `.md` in `--dir`. */
async function resolveFiles(opts: ImportOptions): Promise<string[]> {
  if (opts.file) return [opts.file];
  if (opts.dir) return selectMarkdownFiles(await readdir(opts.dir)).map((n) => join(opts.dir!, n));
  throw new Error("No source: pass --file <note.md> or --dir <folder>.");
}

/** Shared per-run context, fetched once so a batch doesn't re-scan the DB per file. */
interface ImportContext {
  notion: Notion;
  dbId: string;
  dbName: string;
  schema: Record<string, any>;
  pages: NotionPage[];
}

/** Import a folder (`--dir`) or single file (`--file`) into the target database.
 *  Each file is independent: a failure is recorded and the batch continues. */
export async function runImport(
  config: AppConfig,
  opts: ImportOptions,
  log: (m: string) => void = console.log
): Promise<ImportResult[]> {
  const notion = new Notion(config.token);
  const dbId = config.databaseIds[0]!;
  const { name: dbName, properties: schema } = await notion.retrieveDatabase(dbId);
  const pages = await notion.queryDatabase(dbId); // for upsert matching (queried once)
  const ctx: ImportContext = { notion, dbId, dbName, schema, pages };

  const files = await resolveFiles(opts);
  const results: ImportResult[] = [];
  for (const file of files) {
    try {
      results.push(await importFile(ctx, config, opts, file, log));
    } catch (err) {
      log(`  ✗ ${file}: ${(err as Error).message}`);
      results.push({ file, title: "", action: "failed", pageId: "", blocks: 0 });
    }
  }
  return results;
}

/** Import one file using the shared context. */
async function importFile(
  ctx: ImportContext,
  config: AppConfig,
  opts: ImportOptions,
  file: string,
  log: (m: string) => void
): Promise<ImportResult> {
  const { notion, dbId, dbName, schema, pages } = ctx;

  const text = await readFile(file, "utf8");
  const plan = planImport(text, schema, opts.map);
  for (const note of plan.notes) log(`    ! ${note}`);

  // Relation tags: resolve names to page ids (auto-creating missing ones).
  if (plan.relationTags) {
    if (opts.dryRun) {
      log(`    ! would resolve ${plan.relationTags.names.length} relation tag(s) on "${plan.relationTags.prop}" (may create pages)`);
    } else {
      plan.properties[plan.relationTags.prop] = await resolveRelationTags(
        notion,
        plan.relationTags.databaseId,
        plan.relationTags.names,
        log
      );
    }
  }

  const localPaths = collectLocalMedia(plan.blocks);
  let blocks = plan.blocks;
  if (localPaths.length && opts.dryRun) log(`    ! would upload ${localPaths.length} attachment(s)`);

  // Upsert: match an existing page by identity key (title + Created date).
  const existingId = findExisting(pages, plan.key, config.props ?? {});

  if (opts.dryRun) {
    const verb = existingId ? "update" : "create";
    log(`  · ${file}: would ${verb} "${plan.title}" in ${dbName} — ${describePlan(plan)}`);
    return { file, title: plan.title, action: existingId ? "would-update" : "would-create", pageId: existingId ?? "", blocks: plan.blocks.length };
  }

  if (localPaths.length) {
    const baseDir = dirname(file);
    const idByPath = await uploadAll(localPaths, (p) => notionUploadFile(config.token, resolve(baseDir, p)));
    blocks = applyUploads(plan.blocks, idByPath);
  }

  if (existingId) {
    await notion.updateProps(existingId, plan.properties);
    await notion.deleteChildren(existingId); // replace body so re-runs don't duplicate blocks
    if (blocks.length) await notion.appendChildren(existingId, blocks);
    log(`  ✓ ${file}: updated "${plan.title}" in ${dbName} (${blocks.length} blocks)`);
    return { file, title: plan.title, action: "updated", pageId: existingId, blocks: blocks.length };
  }

  const pageId = await notion.createPage(dbId, plan.properties);
  if (blocks.length) await notion.appendChildren(pageId, blocks);
  log(`  ✓ ${file}: created "${plan.title}" in ${dbName} (${blocks.length} blocks)`);
  return { file, title: plan.title, action: "created", pageId, blocks: blocks.length };
}
