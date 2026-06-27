# notion-md-archive

Two-way bridge between a Notion **database** and a local GitHub-Flavored-Markdown (GFM) archive.

- **Export** — Notion database → one `.md` per note (YAML frontmatter + converted body) +
  `attachments/` + `INDEX.md`, then write `Last synced = now` back to each note so the
  Notion-side `Sync` formula flips.
- **Import** — a local `.md` file (or folder) → Notion: frontmatter maps to properties, the
  body converts to blocks. Re-runs are idempotent (matched by identity key, updated not duplicated).

CLI today. A small local GUI window is planned but paused (see [Roadmap](#roadmap)).
For internals / contributing, see [CLAUDE.md](CLAUDE.md).

## Status (2026-06-27)

Export **P0–P4** and Import **A–F** are complete and verified against a real database —
`tsc --noEmit` + the full vitest suite (136 tests) pass offline. Only the **GUI** is unstarted.

## Setup

```bash
npm install
cp .env.example .env     # fill NOTION_TOKEN + NOTES_DB_ID
```

The Notion integration must be **shared** to the target database (Notion → database → `•••` →
Connections). `NOTES_DB_ID` accepts a comma-separated list for multiple DBs. Token and ids may
also live in a gitignored `config.json` (precedence: CLI flag → `config.json` → env).

## Usage

```bash
# Export — Notion → Markdown
npm run export                # full export → ${OUT_BASE}/${dbName}/ + INDEX.md + write-back
npm run export -- --since     # only notes changed since last sync (Last edited > Last synced)
npm run export -- --dry-run   # list what would happen; no writes, downloads, or write-back

# Import — Markdown → Notion
npm run import -- --file note.md --db <id>            # one file
npm run import -- --dir ./out/MyDB --db <id>          # every *.md in a folder (skips INDEX.md)
npm run import -- --file note.md --db <id> --dry-run  # show the plan; no writes/uploads/creates
npm run import -- --file note.md --db <id> --map tags=Topics,type=Kind

# Dev
npm test                      # vitest
npm run typecheck             # tsc --noEmit
npx tsx scripts/demo.ts       # offline: emit a sample archive file (no network)
```

- `--file` / `--dir` (import, one required) — source. `--db` — target DB (falls back to config / `NOTES_DB_ID`).
- `--map k=Prop,…` — override the YAML-key → Notion-property name.
- **Token is never a CLI flag** — it comes from `.env` / `config.json` only, so it can't leak into shell history.

## Output layout

```
${OUT_BASE}/${databaseName}/
├── YYYY-MM-DD-<slug>.md     # one per note; filename is the identity key
├── attachments/             # downloaded images/files (content-stable names)
└── INDEX.md                 # regenerated each run; table of notes + ## Orphans
```

## Database requirements (flexible)

No exact schema is required. Every named property is matched **case-insensitively** against a
default candidate list, overridable in `config.json` (`props`) or via `--map`:

| Frontmatter | Notion source | Default name candidates | If absent |
|---|---|---|---|
| `title` | any `title`-typed property (matched by **type**, name-agnostic) | — | every DB has one |
| `created` | a `date` property | `Created` | falls back to `created_time` |
| `tags` | a `relation`, `multi_select`, or `select` property | `Tags`, `Tag`, `Category`, `Categories` | empty (no error) |
| `type` | `select` / `status` / `multi_select` / `rich_text` | `Type` | empty (no error) |
| (write-back / `--since`) | a `date` property | `Last synced` | write-back skipped gracefully; `--since` exports all |

Tag matching is by **name**, not "first relation found", so an unrelated relation like `Parent`
is never mistaken for tags. The frontmatter key is always `tags` (a list). On import, a
`multi_select`/`select` tag writes names directly; a `relation` tag resolves names → page ids in
the related DB, **auto-creating** a tag page when the name is new.

```json
{
  "token": "secret_…",
  "databaseId": "…",
  "outBase": "~/NotionArchive",
  "props": { "type": "Type", "tags": "Tags", "created": "Created", "lastSynced": "Last synced" }
}
```

## Markdown ⇄ Notion conversion

Export (`blocksToGFM`) and import (`mdToBlocks`) are mirror functions over the **same GFM subset** —
the goal is an archive-faithful round-trip, not a general Markdown engine.

| Notion block | GFM | Round-trip |
|---|---|---|
| heading 1/2/3 | `#` / `##` / `###` | ↔ |
| bulleted / numbered list (nested, 2-space) | `-` / `1.` | ↔ |
| to-do | `- [ ]` / `- [x]` | ↔ |
| quote | `>` | ↔ |
| code (+ language) | ` ```lang ` fence | ↔ |
| callout | `> [!NOTE]` (emoji ↔ flavor) | ↔ |
| table | GFM table | ↔ |
| divider | `---` | ↔ |
| equation | `$$ … $$` | ↔ |
| image / file | `![](attachments/…)` / `[file](attachments/…)` | ↔ export **downloads** (signed URLs expire ~1h), import **uploads** |
| inline bold / italic / code / strike / link | `**b**` `*i*` `` `c` `` `~~s~~` `[t](url)` | ↔ |
| toggle | `**title**` + flattened children | → one-way (not reconstructed on import) |
| column / column_list | flattened sequentially | → one-way |
| bookmark / embed / link preview | `[title](url)` | → one-way |
| TOC / breadcrumb / child page/db | skipped | → dropped |

Newlines: block boundary `\n\n`; consecutive list items `\n`; soft break inside a block `\n`.
External `http(s)` images stay external (not downloaded on export, not re-uploaded on import).

## Known limitations

- **Non-image file attachments are not uploaded on import.** Only local images
  (`![](attachments/…)`) upload; a `[report](attachments/x.pdf)` link is left as-is.
- **Intra-batch duplicate identity keys.** A `--dir` run snapshots existing pages once before the
  loop. If two files in the *same* batch resolve to the same key `YYYY-MM-DD-{slug(title)}`, both
  are created instead of the second updating the first. Cross-run and single `--file` are unaffected.

## Roadmap

- **GUI window** (paused) — a local web page to enter a token, list/pick a database, choose an
  output folder, and Run with a live log. The engine (`runExport` / `runImport`) is already a thin
  core a GUI can call directly.
- **Deferred import enhancements** (not blocking) — non-image file attachment upload;
  intra-batch duplicate-key de-duplication.
