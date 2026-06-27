import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
    relationTags: built.relationTags,
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

  // Relation tags: resolve names to page ids (auto-creating missing ones), then
  // merge into the properties. Skipped under --dry-run (it would create pages).
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

  // Local attachments: upload each (resolved relative to the .md file) and rewrite
  // the image blocks to file_upload references. Skipped under --dry-run.
  const localPaths = collectLocalMedia(plan.blocks);
  let blocks = plan.blocks;
  if (localPaths.length && opts.dryRun) {
    log(`    ! would upload ${localPaths.length} attachment(s)`);
  }

  // Upsert: match an existing page by identity key (title + Created date).
  const pages = await notion.queryDatabase(dbId);
  const existingId = findExisting(pages, plan.key, config.props ?? {});

  if (opts.dryRun) {
    const verb = existingId ? "update" : "create";
    log(`  · ${opts.file}: would ${verb} "${plan.title}" in ${dbName} (${plan.blocks.length} blocks)`);
    return [{ file: opts.file, title: plan.title, action: existingId ? "would-update" : "would-create", pageId: existingId ?? "", blocks: plan.blocks.length }];
  }

  if (localPaths.length) {
    const baseDir = dirname(opts.file);
    const idByPath = await uploadAll(localPaths, (p) => notionUploadFile(config.token, resolve(baseDir, p)));
    blocks = applyUploads(plan.blocks, idByPath);
  }

  if (existingId) {
    await notion.updateProps(existingId, plan.properties);
    await notion.deleteChildren(existingId); // replace body so re-runs don't duplicate blocks
    if (blocks.length) await notion.appendChildren(existingId, blocks);
    log(`  ✓ ${opts.file}: updated "${plan.title}" in ${dbName} (${blocks.length} blocks)`);
    return [{ file: opts.file, title: plan.title, action: "updated", pageId: existingId, blocks: blocks.length }];
  }

  const pageId = await notion.createPage(dbId, plan.properties);
  if (blocks.length) await notion.appendChildren(pageId, blocks);
  log(`  ✓ ${opts.file}: created "${plan.title}" in ${dbName} (${blocks.length} blocks)`);
  return [{ file: opts.file, title: plan.title, action: "created", pageId, blocks: blocks.length }];
}
