# PLAN — Notion → GFM Markdown Archive (export tool)

Status: draft for review · Date: 2026-06-25 · Scope: **export only** (匯出)

> NOTE: root `tasks/plan.md` + `tasks/todo.md` belong to the unrelated
> obsidian-gdrive-folder-sync project. Kept here to avoid clobbering them.

## Goal

A small tool that reads a Notion **database** via the API and writes a local
GitHub-Flavored-Markdown (GFM) archive, then writes `Last synced = now` back to each
exported note so the Notion-side `Sync` formula flips. Runs manually via a **small
local GUI window** (configure token / database / output folder, then Run), with a
CLI underneath.

Out of scope (later): the import script (old-data → Notion); the Notion `Sync`
formula config (a Notion UI property, not script work).

## Identity & structure (locked)

- **Primary key = filename = `YYYY-MM-DD-{slug(title)}.md`** where date = the note's
  `Created` date. Same key ⇒ same record ⇒ **overwrite**. No `notion_id` stored.
- Same-day + same-title ⇒ later overwrites earlier (accepted).
- **Known tradeoff:** renaming a title in Notion changes the key ⇒ new file + the old
  one becomes an **orphan** (the tool can't know they're the same note). The INDEX
  surfaces orphans so they can be cleaned manually. Fine as long as titles are stable.

Output layout (base path `OUT_BASE`, set in config/.env, e.g. `~/NotionArchive`):
```
${OUT_BASE}/${databaseName}/
├── 2026-06-24-personal-goals-2026.md
├── 2026-06-24-quick-scratchpad-1.md
├── attachments/
│   └── <hash>.png
└── INDEX.md
```
- `databaseName` = the database's own title (sanitized for filesystem).
- `INDEX.md` = regenerated each run; GFM table of every note + an `## Orphans`
  section (files on disk not produced this run).

## Frontmatter
```yaml
---
title: Personal goals 2026
type:
tags: [Personal]
created: 2026-06-24T16:20
---
```
- `title`←Name, `type`←Type, `tags`←Category relation resolved to names, `created`←Created.
- `Created` is a **manual Date property** (has time, e.g. 4:20 PM). If empty, **fall back
  to Notion's `created_time`**. Filename date = the date part of whichever is used.

## Workflow
Build stops at **every checkpoint** for the user to test. The user verifies; only on
their OK does the next phase begin. No phase runs ahead of an approved checkpoint.

## Body conversion → GFM
| Notion block | Output |
|---|---|
| heading 1/2/3 | `#` / `##` / `###` |
| bulleted / numbered list | `-` / `1.` (2-space nested indent, never tab) |
| to-do | `- [ ]` / `- [x]` |
| quote | `>` |
| code | fenced ``` + language |
| callout | GFM alert `> [!NOTE]` |
| toggle | flatten: `**title**` + children rendered flat (no indent) |
| column / column_list | flatten, sequential |
| table | GFM `\| \|` |
| divider | `---` |
| equation | `$$ … $$` |
| bookmark / embed / link preview | `[title](url)` |
| TOC / breadcrumb / child page/db | skip |
| image / file | download to `attachments/`, rewrite to relative path |

Newlines: block boundary → `\n\n`; consecutive list items → `\n`; soft break → `\n`.

## Critical gotchas
1. **Signed attachment URLs expire (~1h)** → must download + rewrite paths.
2. **Nested children need recursion** (`has_children` → `blocks.children.list`, paginated).
3. **Write-back is itself an edit** bumping `Last edited`; the `Sync` formula uses a
   `dateBetween(...,"minutes") <= 1` tolerance. Tool only sets `Last synced`.
4. **Relation → tags** needs a Categories name lookup (cache once).
5. **Rate limit ~3 req/s** + pagination everywhere → throttle.

## Tech
- **Node 20 + TypeScript**, official `@notionhq/client`, `tsx` to run.
- **vitest** on the block→GFM converter (pure function, fixture-driven; riskiest unit).
- **GUI = local web window**: a tiny Node server serves one HTML page (token field →
  "list databases" via Notion search → pick DB → output folder → Run → live log).
  Opens `localhost:PORT` in the browser. Lightweight, no Electron. Config persisted to
  `config.json` (gitignored). CLI (`npm run export`) shares the same engine.
- Config precedence: `config.json` (written by GUI) → env vars → CLI flags.

## Dependency graph
```
config (config.json / .env)
      │
      ▼
notion client ──► query DB (paginated) ──► propMapper → frontmatter
      │                                        │ (Categories cache → tags)
      ▼                                        │
fetchBlockTree (recursive) ──► block→GFM converter ◄┘
                                   │ (+ attachment downloader)
                                   ▼
                         file writer  ─►  INDEX builder  ─►  write-back Last synced
                                   ▲
        CLI (npm run export) ──────┤
        GUI (local web window) ────┘   (both drive the same engine)
```
The block→GFM converter is the critical path — isolated as a pure function over a
fetched tree so it is unit-testable without the network. GUI/CLI are thin shells over
one shared `runExport(config)` engine.

## Phases (vertical slices — each ends runnable & verifiable)

### Phase 0 — Scaffold + config + auth + frontmatter (CLI)
Thinnest full path: read config → resolve DB name → query DB → write
`${OUT_BASE}/${dbName}/<key>.md` with **frontmatter only**. Proves token, pagination,
relation→tags, path/key scheme.

### Phase 1 — Core text body
paragraph, headings, nested lists, to-do, quote, code, divider + newline engine +
recursive children. The template is entirely these → real archives.

### Phase 2 — Rich blocks
toggle flatten, callout alert, column flatten, table, equation, bookmark.

### Phase 3 — Attachments
download image/file/pdf signed URLs → `attachments/` (content-hash names, idempotent),
rewrite paths.

### Phase 4 — INDEX + incremental + write-back
generate `INDEX.md` (+ orphan detection); set `Last synced = now` per exported note;
`--since` to only export notes where `Last edited > Last synced`; `--dry-run`.

### Phase 5 — GUI window
local web server + one-page UI: enter token → list accessible databases (Notion search)
→ pick DB → set output folder → Run → stream log + show result. Persist to `config.json`.

## Checkpoints
- **CP0** Phase 0: frontmatter files match Notion rows; tags resolved; path = `OUT_BASE/dbName/`.
- **CP1** Phase 1: converter output diffs clean vs hand-written expected `.md` (vitest).
- **CP2** Phase 2: a note with toggle+callout+table renders right on GitHub.
- **CP3** Phase 3: archived images open offline; rerun downloads nothing new.
- **CP4** Phase 4: edit one note → `--since` rerun exports only it → `Sync` flips; INDEX lists orphan after a rename.
- **CP5** Phase 5: open window, paste token, pick DB + folder, click Run → archive appears.

## Blocked on (before coding)
- Notion **integration token** + the **database shared to it** (for CP0+).
- Confirm `Created` is Notion `created_time` vs a manual date prop (affects mapping).
