import { writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Notion } from "./notion.js";
import { buildTagMap } from "./tags.js";
import { mapPageToMeta, buildFrontmatter, filenameFor, resolvePropName, NAME_CANDIDATES } from "./frontmatter.js";
import { blocksToGFM } from "./convert.js";
import { collectMediaUrls, downloadAll } from "./attachments.js";
import { expandPath, sanitizeFolder, ensureDir } from "./paths.js";
import { shouldExport } from "./incremental.js";
import { buildIndexMarkdown, type IndexRow } from "./indexfile.js";
import type { AppConfig } from "./config.js";

export interface RunOptions {
  dryRun?: boolean;
  since?: boolean; // only export notes changed since last sync
}

export interface RunSummary {
  databases: { name: string; notes: number; written: number; skipped: number; attachments: number; orphans: number }[];
}

export type Logger = (msg: string) => void;

/** End-to-end export of every configured database (Phases 0–4). */
export async function runExport(
  config: AppConfig,
  log: Logger = console.log,
  opts: RunOptions = {}
): Promise<RunSummary> {
  const notion = new Notion(config.token);
  const base = expandPath(config.outBase);
  const now = new Date();
  const summary: RunSummary = { databases: [] };

  const props = config.props ?? {};

  for (const dbId of config.databaseIds) {
    const { name: dbName, properties: schema } = await notion.retrieveDatabase(dbId);
    const outDir = join(base, sanitizeFolder(dbName));
    const attachmentsDir = join(outDir, "attachments");
    log(`\n# ${dbName}  ->  ${outDir}`);

    // Write-back needs a date property; resolve its name (case-insensitive /
    // configurable) and degrade gracefully if it is absent.
    const syncName = resolvePropName(schema, props.lastSynced, NAME_CANDIDATES.lastSynced);
    const canWriteBack = !!syncName && schema[syncName]?.type === "date";
    if (!canWriteBack && !opts.dryRun) {
      log(`  (no "${props.lastSynced ?? "Last synced"}" date property — skipping write-back)`);
    }

    const pages = await notion.queryDatabase(dbId);
    const tagMap = await buildTagMap(notion, pages, props.tags);
    const metas = pages.map((p) => mapPageToMeta(p, tagMap, props));
    log(`  ${pages.length} notes`);

    if (!opts.dryRun) {
      await ensureDir(outDir);
      await ensureDir(attachmentsDir);
    }

    const indexRows: IndexRow[] = [];
    let written = 0;
    let skipped = 0;
    let attachmentCount = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]!;
      const meta = metas[i]!;
      const filename = filenameFor(meta);
      indexRows.push({
        filename,
        title: meta.title,
        created: meta.created,
        tags: meta.tags,
        lastSynced: opts.dryRun ? meta.lastSynced : now.toISOString(),
      });

      if (!shouldExport(meta, !!opts.since)) {
        skipped++;
        continue;
      }

      const tree = await notion.fetchBlockTree(page.id);
      const mediaUrls = collectMediaUrls(tree);
      const mediaMap = opts.dryRun
        ? new Map<string, string>()
        : await downloadAll(mediaUrls, attachmentsDir, log);
      attachmentCount += mediaMap.size;

      const content = buildFrontmatter(meta) + "\n" + blocksToGFM(tree, { mediaMap });

      if (opts.dryRun) {
        log(`  · ${filename} (${mediaUrls.length} media)`);
      } else {
        await writeFile(join(outDir, filename), content);
        if (canWriteBack) await notion.setDate(page.id, syncName!, now); // write-back
        written++;
        log(`  ✓ ${filename}`);
      }
    }

    // INDEX + orphan detection (full DB state, including skipped/unchanged notes)
    const expected = new Set(metas.map(filenameFor));
    const orphans = opts.dryRun ? [] : await findOrphans(outDir, expected);
    if (!opts.dryRun) {
      const index = buildIndexMarkdown(dbName, indexRows, orphans, now);
      await writeFile(join(outDir, "INDEX.md"), index);
    }

    summary.databases.push({
      name: dbName,
      notes: pages.length,
      written,
      skipped,
      attachments: attachmentCount,
      orphans: orphans.length,
    });
  }

  return summary;
}

/** Markdown files on disk (excluding INDEX.md) not in the expected set. */
async function findOrphans(outDir: string, expected: Set<string>): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(outDir);
  } catch {
    return [];
  }
  return files.filter((f) => f.endsWith(".md") && f !== "INDEX.md" && !expected.has(f));
}
