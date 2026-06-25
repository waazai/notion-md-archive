# TODO — Notion → GFM Markdown Archive (export tool)

Plan: [PLAN.md](PLAN.md) · `[x]` when acceptance + verify pass. ▢ = human checkpoint.
Scope: **export only**. Import script = separate future plan.
**Workflow: stop at every ▢ checkpoint for the user to test; continue only on their OK.**
`created` empty → fall back to Notion `created_time`.

> **Status 2026-06-25:** P0–P4 complete. 45 vitest tests + typecheck green. CLI runs clean
> against a real database (P0/P1/P2/P4 paths confirmed by the user). **Untested:**
> attachment download (CP3) and the `Sync` formula flip in Notion. **P5 (GUI) paused.**

## Phase 0 — Scaffold + config + auth + frontmatter (CLI)
- [x] 0.1 Scaffold: package.json, tsconfig(strict), vitest, @notionhq/client, tsx, .gitignore
- [x] 0.2 `config.ts`: config.json → env → flags; token / databaseId(s) / outBase; loads .env
- [x] 0.3 `notion.ts`: client + ~3 req/s throttle + paginated `queryDatabase` + `databaseName`
- [x] 0.4 `tags.ts`: resolve tag relation ids → names (deduped, cached); auto-detect tag prop
- [x] 0.5 `frontmatter.ts`: row → YAML (title/type/tags/created); `YYYY-MM-DD-slug` filename
- [x] 0.6 `paths.ts`: slug / sanitize folder / expand `~` / ensureDir
- [x] 0.7 `engine.ts` `runExport` + `main.ts` CLI
- [x] ▢ **CP0** — CLI run vs real DB: rows → files at right path; frontmatter + tags correct

## Phase 1 — Core text body
- [x] 1.1 `notion.ts` `fetchBlockTree` — recursive children + pagination
- [x] 1.2 `convert.ts` pure `blocksToGFM` + newline engine (block `\n\n`, list `\n`, soft `\n`)
- [x] 1.3 paragraph, heading 1/2/3, divider, quote, code(+lang)
- [x] 1.4 bulleted/numbered + nested (2-space), to_do
- [x] 1.5 rich_text → inline md (bold/italic/code/strike/link), soft-break preserved
- [x] 1.6 body wired into engine
- [x] ▢ **CP1** — converter diffs clean vs expected (27 vitest fixtures) + CLI output confirmed

## Phase 2 — Rich blocks
- [x] 2.1 toggle → `**title**` + flat children
- [x] 2.2 callout → `> [!NOTE]` (emoji maps flavor)
- [x] 2.3 column_list/column + synced_block → flatten
- [x] 2.4 table → GFM table
- [x] 2.5 equation `$$`, bookmark/embed/link_preview → link, TOC/breadcrumb/child → skip
- [x] ▢ **CP2** — covered by fixtures + CLI output confirmed

## Phase 3 — Attachments
- [x] 3.1 `attachments.ts`: detect image/file/pdf/video/audio, download signed URL → `attachments/`
- [x] 3.2 content/path-stable filenames, skip if present (idempotent)
- [x] 3.3 rewrite to relative `![](attachments/…)` / `[file](attachments/…)`
- [ ] ▢ **CP3** — ⚠️ NOT YET TESTED: run on a note with an image; confirm files land + links resolve offline

## Phase 4 — INDEX + incremental + write-back
- [x] 4.1 `indexfile.ts`: regenerate `INDEX.md` (table, newest-first) each run
- [x] 4.2 orphan detection → `## Orphans` section
- [x] 4.3 write-back: `pages.update` set `Last synced = now` per exported note
- [x] 4.4 `--since` (skip where `Last edited <= Last synced`) + `--dry-run` + summary
- [x] ▢ **CP4** — CLI ran clean; ⚠️ still eyeball the `Sync` formula flip in Notion after write-back

## Phase 5 — GUI window  ⏸️ PAUSED
- [ ] 5.1 `server.ts`: tiny http server serving one page + JSON endpoints, opens `localhost:PORT`
- [ ] 5.2 UI: token → "List databases" (Notion search) → pick DB → output folder
- [ ] 5.3 "Run export" → `runExport` → stream live log → summary
- [ ] 5.4 persist `config.json`, prefill on reopen
- [ ] 5.5 `npm run gui` script
- [ ] ▢ **CP5**

## Remaining before "done"
- [ ] CP3: verify attachment download on a real note with images
- [ ] CP4: confirm `Sync` formula flips in Notion after a write-back
- [ ] P5 GUI (when resumed)
