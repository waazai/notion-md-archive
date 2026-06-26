# SPEC — Import module (local Markdown → Notion)

Status: **draft for approval** · 2026-06-26 · Owner: emma
Companion to the export tool ([CLAUDE.md](CLAUDE.md), [PLAN.md](PLAN.md), [TODO.md](TODO.md)).
This is the **reverse direction** the export docs flagged as "a separate, future effort." It
ships as its own module tree and CLI subcommand; it does **not** alter the export path.

---

## 1. Objective

Push a local GFM Markdown file (or a folder of them) **into** a Notion database, mapping the
file's YAML frontmatter to Notion properties and converting the Markdown body into Notion
blocks. Re-running is idempotent: a file is matched to an existing page by the export
identity key and **updated** rather than duplicated.

**Target user (now):** the maintainer, driving it from the CLI to seed/refresh a Notion DB
from an existing Markdown archive (e.g. the output of this very tool, or hand-written notes
that carry a minimal YAML header).

**Future surface:** the same `runImport` core is meant to be driven later by the paused GUI
(Phase 5) or an AI tool. So all behaviour lives in the engine; the CLI is a thin shell — no
logic in `main.ts` that a GUI couldn't also call.

### Acceptance criteria
- Given `--file note.md` with a YAML header and body, a page is created in the target DB
  with the mapped properties set and the body rendered as Notion blocks.
- Given the **same** file again, the existing page is found by key and updated in place — no
  second page appears.
- Given `--dir ./archive`, every `*.md` is imported; a per-file summary
  (`created / updated / skipped / failed`) is printed. **Source is a single file *or* a
  folder** — `--file` imports one note, `--dir` a batch; either way, into the DB named by
  `--db`.
- A **relation**-typed tag/category resolves by name to the related DB's page id; a tag name
  with no existing page is **auto-created** in that related DB, then linked.
- Local `attachments/*` referenced by the body are **uploaded to Notion** (file upload API)
  and the body's image/file blocks point at the uploaded file.
- `--dry-run` resolves the mapping and prints what *would* be written (properties + block
  count + create-vs-update + tags-to-create + files-to-upload) and performs **zero** network
  writes.
- A file whose minimal header has only `title` still imports (other properties left unset).
- Property/body conversion is unit-tested **offline** with no token (mirrors the export rule).

---

## 2. The import direction — body conversion (the "which way" decision)

The export side is `blocksToGFM` in [src/convert.ts](src/convert.ts) (Notion blocks → GFM,
pure). Import needs its mirror: **`mdToBlocks` (GFM → Notion block objects), also pure.**

There is no Notion endpoint that ingests Markdown — page content must be supplied as block
JSON via `blocks.children.append`. So we parse the Markdown ourselves and emit block objects.

**Decision: support exactly the GFM subset the exporter emits — no more.** The primary input
is this tool's own archive, so a tight round-trip is the goal, not a general Markdown engine.

| Markdown (as emitted by `convert.ts`) | → Notion block |
|---|---|
| paragraph | `paragraph` |
| `#`/`##`/`###` | `heading_1/2/3` |
| `---` | `divider` |
| `> text` | `quote` |
| ` ```lang ` fence | `code` (+ language) |
| `- ` / `1. ` (nested, 2-space) | `bulleted_list_item` / `numbered_list_item` (recursed) |
| `- [ ]` / `- [x]` | `to_do` (checked flag) |
| `> [!NOTE]` callout | `callout` (emoji from flavor) |
| GFM table | `table` + `table_row` |
| `$$…$$` | `equation` |
| `![](attachments/…)` | `image` block → local file **uploaded** to Notion (§4 Attachments) |
| `[file](attachments/…)` | `file` block → local file **uploaded** to Notion |
| `[text](http…)` | inline link in `rich_text` (external URL kept as-is) |
| `**b**` `*i*` `` `c` `` `~~s~~` | `rich_text` annotations |

**Known one-way losses (accepted, documented, not fixed here):** the exporter *flattens*
toggles and columns and *skips* TOC/breadcrumb/child-page. Those constructs are simply not
present in the Markdown, so import reproduces the flattened form — it does **not** try to
reconstruct toggles/columns. Round-trip is "archive-faithful," not "Notion-pixel-faithful."

---

## 3. Commands

```bash
npm run import -- --file note.md --db <id>          # one file → target DB
npm run import -- --dir ./out/MyDB --db <id>        # every *.md in a folder
npm run import -- --file note.md --db <id> --dry-run   # resolve + report, no writes
npm run import -- --dir ./out/MyDB --db <id> --map title=Name,tags=Topics
npm test            # vitest — includes new mdToBlocks + properties units, offline
npm run typecheck   # tsc --noEmit
```

- `--file` / `--dir` (one required) — source Markdown.
- `--db` — target database id (falls back to config / `NOTES_DB_ID`, like export).
- `--map k=Prop,…` — override the YAML-key → Notion-property mapping (repeatable/comma-list).
- `--dry-run` — no `pages.create` / `pages.update` / `children.append`.
- Add the `import` script to `package.json` (`tsx src/main.ts import`).

### Configuration & secrets — layered, by nature of the value

Reuse `loadConfig`'s existing precedence: **CLI flag → `config.json` → env**. Split inputs by
what they are, so the future GUI/AI layer can drive `runImport(opts)` programmatically without
touching env:

| Value | Primary source | Notes |
|---|---|---|
| **token** (secret) | `config.json` (GUI-written) **or** `.env` | Entered **once and persisted**, then reused with no code/.env editing — the GUI/AI writes it to `config.json` (the file `loadConfig`'s comment already earmarks for the GUI); the maintainer uses `.env` today. **Never a required CLI flag** (would leak into shell history and `ps`); an optional `--token` override may exist but defaults to the stored value. Token must never be printed in logs / `--dry-run`. |
| **db id** | `--db` flag → config → `NOTES_DB_ID` | Routing info; varies per run. |
| **source** (`--file` / `--dir`) | CLI flag | Per-run; no env equivalent. |

Mechanically: routing/source arrive as `runImport` **opts** (flags map straight onto them);
the token resolves inside `loadConfig` via the existing **flag → `config.json` → env** chain,
so the "enter once, others reuse without touching code" GUI flow works with no new plumbing.
Export already follows this chain — only its `db`/`out` currently live in `.env` by habit; it
can grow the same flags later, but that is **out of scope for this import module**.

---

## 4. Project structure

New code lives under `src/import/` so it's clearly the separate effort. Reuse — don't fork —
`paths.ts` (`slug`), `config.ts` (token/db resolution, `.env`), and the throttle pattern.

```
src/
  import/
    parseFile.ts     # read .md → { frontmatter: Record<string,unknown>, body: string }
                     #   (YAML fence split + `yaml` parse — reverse of buildFrontmatter)
    mdToBlocks.ts    # PURE GFM → Notion block[] (mirror of convert.ts; no network).
                     #   Emits image/file blocks with a local-path placeholder that
                     #   uploadFiles.ts resolves to an uploaded file id.
    properties.ts    # PURE frontmatter + map → Notion property payloads
                     #   (reverse of frontmatter.ts: title/rich_text/select/
                     #    multi_select/date; identity key from created+title).
                     #   Relation tags emitted as names; tagsWrite.ts resolves to ids.
    tagsWrite.ts     # NETWORK: relation tag NAME → page id in the related DB
                     #   (database_id read from the prop schema). Auto-creates a
                     #   missing tag page (title = name), caches name→id. Reverse of tags.ts.
    uploadFiles.ts   # NETWORK: upload local attachments/* via Notion file-upload API,
                     #   return file ids; idempotent within a run (content-keyed cache).
    importNotion.ts  # NETWORK core: find-by-key, pages.create/update, children.append;
                     #   serialized ~3 req/s (reuse notion.ts throttle).
    engine.ts        # runImport(opts) — orchestration; CLI + future GUI call this
  main.ts            # add `import` subcommand dispatch (thin)
tests/
  import.test.ts     # mdToBlocks fixtures (round-trip vs convert.ts) + properties units
```

All network lives in `tagsWrite.ts` / `uploadFiles.ts` / `importNotion.ts`; `mdToBlocks` and
`properties` stay pure so they unit-test offline with no token.

**Identity / matching.** Reuse the export key: `YYYY-MM-DD-{slug(title)}` where the date is
the note's `created`. On import we resolve a page to update by querying the target DB filtered
on the title property **and** the `Created` date, then confirming the computed slug matches.
No `notion_id` is stored in files — same invariant as export. Title or created-date change ⇒
treated as a new page (consistent with how export orphans a renamed file).

**Property mapping defaults** (overridable via `--map` / config `props`, same shape as the
existing `PropNames`): `title→<title-typed prop>`, `type→Type` (select), `tags→Tags`,
`created→Created` (date). The tag target is written **by its actual Notion type**, **auto-detected** from the DB schema
via `databases.retrieve` — the user never declares the type. Each property carries its `type`
(`relation` / `multi_select` / `select` / …); a `relation` additionally exposes
`relation.database_id`, so the related Tags DB is discovered automatically too. The user may
optionally name *which property* is the tag (`--map tags=Category`), defaulting to `Tags` /
the auto-picked one (mirrors export's `pickTagProp`):
- `multi_select` / `select` → write the tag **names** directly. Notion auto-creates an unseen
  option on write, so there is **no auto-create-page step** for these — and no related DB is
  touched. This is the common default.
- `relation` (the template's category/tag *is a page*) → resolve each name to a page id in
  the related DB via `tagsWrite.ts`; **auto-create** a tag page when the name is new, then
  link by id. This is the reverse of export's `resolveTags` (id→name). Auto-create fires
  **only** in the relation case.
- **tag prop absent** in the target DB → skip tags entirely with a logged notice; all other
  properties still import (graceful degradation, same as export's "missing prop ⇒ empty").

Unmapped YAML keys are ignored with a logged notice.

**Attachments.** Body image/file links (`attachments/…`) are uploaded to Notion via the
file-upload API (`uploadFiles.ts`) and the corresponding block carries the uploaded file id.
External `http(s)` image/links are kept as external references, not re-uploaded. Uploads are
content-keyed and cached within a run so a file referenced twice uploads once.

---

## 5. Code style & invariants (inherit from the project)

- TypeScript strict, ESM + NodeNext: import siblings with the **`.js`** extension.
- **`mdToBlocks` and `properties` are pure & synchronous** — no network, unit-testable with
  no token. All Notion I/O is confined to `importNotion.ts`, serialized + spaced ~3 req/s.
- Graceful degradation, never crash on partial data: missing body → properties-only page;
  missing optional property in the DB → skip that field with a notice; missing title →
  `"Untitled"` (same as export).
- Keep `tags` as the internal/output term; map types via the existing `PropNames` shape so
  export and import share one mental model.
- `main.ts` stays a thin shell over `runImport` so the GUI/AI layer can reuse the engine.

---

## 6. Testing strategy

- **Offline first (no token).** Hand-built Markdown fixtures → assert exact Notion block JSON
  from `mdToBlocks`; frontmatter fixtures → assert property payloads from `properties`.
- **Round-trip tests:** feed `convert.ts` fixtures' *expected Markdown* back through
  `mdToBlocks` and assert structural equivalence to the original block tree (modulo the
  documented flatten/skip losses) — this is the strongest guard on the subset contract.
- Run `npm test` **and** `npm run typecheck` from this directory before "done" (root vitest
  pulls in sibling projects).
- Live verification is a **human checkpoint** (token required): import one file, eyeball the
  page in Notion; re-import, confirm it updates rather than duplicates. Add as `CP-I0` to TODO.

---

## 7. Boundaries

**Always**
- Treat import as additive: never touch the export modules' behaviour.
- Idempotent re-runs (match-by-key, update in place; uploads + tag lookups cached per run).
- Respect `--dry-run` everywhere — zero writes, zero uploads, zero tag-page creation.
- Keep body conversion (`mdToBlocks`) and property mapping (`properties`) pure and
  offline-testable; confine all network to `tagsWrite` / `uploadFiles` / `importNotion`.
- Auto-create a relation tag page only when the name is genuinely absent (after a cached
  case-sensitive name lookup), and log each creation.

**Ask first**
- Widening the Markdown subset beyond what `convert.ts` emits (general-Markdown support).
- Deleting/archiving Notion pages that no longer have a local file (reverse-orphan handling).
- Changing the missing-tag policy away from auto-create (e.g. to skip or error).

**Never**
- Store a `notion_id` in the Markdown files (keep filename = identity).
- Set the `Sync` formula from code — it's Notion-owned (same rule as export).
- Run live network writes inside unit tests, or require a token to build/test the pure path.

---

## 8. Resolved decisions (2026-06-26)
1. **Attachments — upload.** Local `attachments/*` are uploaded to Notion via the file-upload
   API; blocks carry the uploaded file id. External URLs kept as external. *(was: skip-or-link)*
2. **Tags — type-driven, relation supported.** Detect the tag prop's Notion type; write names
   for `multi_select`/`select`, resolve names→ids for `relation`. The template's category/tag
   is a relation (a page), so relation write is **in scope for v1**.
3. **Missing relation tag — auto-create.** A tag name with no page in the related DB gets a
   new page (title = name) created, then linked. Logged per creation.
4. **Source — file or folder.** `--file` (single note) or `--dir` (batch); both import into
   the `--db` target. No implicit default folder.

## 9. Still open (not blocking the plan)
- Should `--dir` *optionally* default to `${OUT_BASE}/${dbName}` as a convenience, or always
  require an explicit path? (Leaning: always explicit; revisit when the GUI lands.)
- File-upload API limits (size/type) and how to surface an oversized attachment — confirm
  during build against the live API.
