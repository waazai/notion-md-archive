# CLAUDE.md — notion-md-archive

Guidance for AI coding agents working in this subproject. For user-facing setup/usage
see [README.md](README.md); for the plan and task status see [PLAN.md](PLAN.md) and
[TODO.md](TODO.md).

## What this is

A CLI tool that exports a Notion **database** to a local GitHub-Flavored-Markdown (GFM)
archive — one `.md` per note (YAML frontmatter + converted body), `attachments/`,
`INDEX.md` — then writes `Last synced = now` back to each note so the Notion-side
`Sync` formula flips. A local GUI window is planned (Phase 5, paused).

Scope is **export only**. The import direction (old data → Notion) is a separate, future
effort — do not fold it in here.

## Commands

```bash
npm install
npm run export                # full export to ${OUT_BASE}/${dbName}/
npm run export -- --since     # only notes changed since last sync
npm run export -- --dry-run   # no writes / downloads / write-back
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

## Conventions & invariants (do not break)

- **No token needed to develop.** Build and test everything except live network paths
  offline with hand-built block-JSON fixtures (see `tests/`). Only verification against a
  real database needs `NOTION_TOKEN`.
- **Identity = filename = `YYYY-MM-DD-{slug(title)}.md`** (date = note's `Created`). Same
  key ⇒ overwrite. No `notion_id` is stored. Renaming a title orphans the old file —
  `INDEX.md` surfaces orphans. Don't reintroduce id-based identity without discussion.
- **Frontmatter key is `tags`** (a list). The Notion property it reads can be a relation,
  multi_select, or select, under any name; `pickTagProp` auto-detects when the configured
  name is absent. Keep "tags" as the internal/output term — earlier "category" naming was
  removed for consistency.
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

## Status

P0–P4 complete, offline-green (vitest + typecheck pass). Untested until a token is
available: live DB query (CP0), attachment download (CP3), `Sync` flip after write-back
(CP4). Phase 5 (GUI) is paused. The project is **not yet under git** in this workspace.
