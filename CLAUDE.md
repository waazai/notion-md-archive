# CLAUDE.md — notion-md-archive

Guidance for AI coding agents working in this subproject. For user-facing setup/usage
see [README.md](README.md); for the plan and task status see [PLAN.md](PLAN.md) and
[TODO.md](TODO.md).

## What this is

A CLI tool that exports a Notion **database** to a local GitHub-Flavored-Markdown (GFM)
archive — one `.md` per note (YAML frontmatter + converted body), `attachments/`,
`INDEX.md` — then writes `Last synced = now` back to each note so the Notion-side
`Sync` formula flips. A local GUI window is planned (Phase 5, paused).

The reverse direction — **import** (local Markdown → Notion) — is now built as a separate
module under `src/import/` (subcommand `npm run import`). It is **additive**: it must not
change the export path. See [SPEC-import.md](SPEC-import.md) and [tasks/](tasks/) for its
spec/plan/status. Phases A–F.2 done; known gap: image-upload send hits `HTTP 400` (CP-E).

## Commands

```bash
npm install
npm run export                # full export to ${OUT_BASE}/${dbName}/
npm run export -- --since     # only notes changed since last sync
npm run export -- --dry-run   # no writes / downloads / write-back
npm run import -- --file note.md --db <id>     # import one Markdown file → Notion
npm run import -- --dir ./out/MyDB --db <id>   # import a folder of *.md (skips INDEX.md)
npm run import -- --file note.md --db <id> --dry-run --map tags=Topics
npm test                      # vitest (run mode)
npm run typecheck             # tsc --noEmit
npx tsx scripts/demo.ts       # offline: emit a sample archive, no network
```

Always run `npm test` **and** `npm run typecheck` from this directory before declaring a
change done (running vitest from the workspace root picks up unrelated sibling projects).

## Architecture

```
config.ts ─► notion.ts (throttle ~3 req/s, pagination, recursion, write-back)
                │
   tags.ts ─► frontmatter.ts ──────┐
                                    ├─► engine.ts (runExport) ─► out/*.md + INDEX.md
   notion.fetchBlockTree ─► convert.ts (PURE → GFM) ─┤
                            attachments.ts ──────────┘
   incremental.ts (--since)   indexfile.ts (INDEX + orphans)
   main.ts (CLI)              [server.ts — Phase 5 GUI, not built]
```

Module responsibilities:
- **`convert.ts`** — the critical path: block tree → GFM. **Pure & synchronous.** It never
  hits the network; media is resolved through a `mediaMap` (url → local path) passed in.
  All branching lives here; keep it that way so it stays unit-testable.
- **`notion.ts`** — the only network module. Requests are serialized + spaced (~3 req/s).
  Pagination and child recursion live here.
- **`frontmatter.ts`** — page properties → `NoteMeta` + YAML; filename = identity key.
  `pickTagProp` / `resolveTags` make the tag source flexible (see below).
- **`attachments.ts`** — collect media urls, download (signed urls expire ~1h), stable
  content-keyed names, idempotent; converter rewrites to relative paths.
- **`engine.ts`** — orchestration; CLI and the future GUI are thin shells over `runExport`.

### Import module (`src/import/`, additive — mirrors the export modules)

```
parseFile.ts (frontmatter/body)  ┐
properties.ts (frontmatter→props,│ all PURE, offline-tested
  identity key, relation request)├─► engine.ts (planImport PURE; runImport)
mdToBlocks.ts (GFM→blocks, PURE) ┘        │  ─► createPage/updateChildren
tagsWrite.ts (relation name→id, auto-create)   (network via notion.ts)
uploadFiles.ts (REST file upload + collect/apply, PURE helpers)
options.ts (CLI flags→ImportOptions, PURE)   cli.ts (thin shell)
```

- **Network stays in `notion.ts`** (the single throttle queue). Import write primitives
  (`createPage`/`appendChildren`/`updateProps`/`deleteChildren`) are methods there;
  `tagsWrite`/`uploadFiles` are orchestrators that call them (or REST for file upload, which
  the SDK 2.3.0 lacks). **Don't** spin up a second Notion `Client` — it breaks the rate limit.
- **Identity matches the export filename stem** (`findExisting` reuses `mapPageToMeta`/
  `filenameFor`), so import upsert and export identity can never drift apart.
- `mdToBlocks` / `properties` / `parseFile` / `uploadFiles` helpers are **pure** — test them
  offline; the round-trip test (`importRoundTrip.test.ts`) feeds `blocksToGFM` output back
  through `mdToBlocks` to guard the export↔import contract.

## Conventions & invariants (do not break)

- **No token needed to develop.** Build and test everything except live network paths
  offline with hand-built block-JSON fixtures (see `tests/`). Only verification against a
  real database needs `NOTION_TOKEN`.
- **Identity = filename = `YYYY-MM-DD-{slug(title)}.md`** (date = note's `Created`). Same
  key ⇒ overwrite. No `notion_id` is stored. Renaming a title orphans the old file —
  `INDEX.md` surfaces orphans. Don't reintroduce id-based identity without discussion.
- **Property resolution is by name, case-insensitive, config-overridable.**
  `resolvePropName(properties, configName, NAME_CANDIDATES.x)` is the single helper for
  `type` / `tags` / `created` / `lastSynced`. Defaults: type=`Type`; tags=`Tags`/`Tag`/
  `Category`/`Categories`; created=`Created`; lastSynced=`Last synced`. **Do not** reintroduce
  "grab the first relation/multi_select" guessing — it can mistake an unrelated relation
  (e.g. `Parent`) for tags. `title` is the one exception: matched by property **type**
  (any title-typed prop), name-agnostic.
- **Frontmatter key is `tags`** (a list). The source property may be a relation,
  multi_select, or select. Keep "tags" as the internal/output term — earlier "category"
  naming was removed for consistency.
- **Graceful degradation:** missing `Created` → `created_time`; missing tag prop → empty;
  missing `Type` → empty; no `Last synced` **date** property → write-back skipped (no
  crash) and `--since` exports everything.
- **`Sync` is a Notion formula**, not something this tool writes. The tool only sets
  `Last synced`; the formula self-flips with a minute tolerance that absorbs the
  write-back's own edit. Don't try to set a `Sync` checkbox from code.
- **Newline rules** (in `convert.ts`): block boundary `\n\n`; consecutive list items `\n`;
  soft break inside a block preserved as single `\n`. toggle/column flatten; callout →
  `> [!NOTE]`.
- ESM + NodeNext: import sibling modules with the **`.js`** extension in TS source.

## Development notes / gotchas

### Export is not pure read-only — the write-back self-edit
Reading (query + block fetch) is read-only, but the per-note **write-back**
(`pages.update` setting `Last synced = now`) is a real Notion edit. Consequences to keep
in mind:

- **It bumps `last_edited_time`.** Every export touches `last_edited` on each exported
  note. This is the unavoidable cost of having the sync indicator live *in Notion* (the
  `Sync` formula). If a future task wants a truly read-only export, the sync state must
  move to a local store (e.g. file mtime / a `.sync.json`) and write-back dropped.
- **It breaks naive `--since`.** Because `Last synced = now` is computed *before* the
  update, Notion stamps `last_edited` a moment *after* it. A strict
  `lastEdited > lastSynced` is then always true → `--since` re-exports everything. Fixed
  in `incremental.ts` with `SYNC_TOLERANCE_MS` (1 min), mirroring the Notion formula's
  `dateBetween(..., "minutes") <= 1`. **Do not** revert `shouldExport` to a strict
  comparison. If you change the tolerance, change it in both places (here and the Notion
  formula) so the script and the in-Notion indicator agree.

### Other
- The write-back uses one `now` per run (not per note) so all notes in a run share a
  consistent `Last synced`.
- Running vitest from the workspace root pulls in sibling projects; always run from this
  directory.

## Status

**Export** P0–P4 complete; CP0–CP4 verified against a real DB. Phase 5 (GUI) paused.

**Import** (`src/import/`) Phases A–F.2 complete, offline-green (136 vitest tests + typecheck).
Built on branch `feat/import-module`. Open items (full list in [tasks/todo.md](tasks/todo.md)):
- ⚠️ **CP-E image upload** — the file-upload *send* step returns `HTTP 400`. Suspect: the
  multipart `Blob` has no MIME type (sent as `application/octet-stream`). First step: log
  `await sent.text()` to read Notion's message, then set the Blob `type` from the extension.
- **Deferred:** non-image file attachments; intra-batch duplicate-key re-matching (`--dir`
  queries existing pages once at the start).
- **Live checkpoints** CP-A/C/D/E need token verification; CP-B manual spot-check deferred.
