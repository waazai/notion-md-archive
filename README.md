# notion-md-archive

Export a Notion **database** to a local GitHub-Flavored-Markdown (GFM) archive — one
`.md` per note with YAML frontmatter and a converted body — then write `Last synced =
now` back to each note so the Notion-side `Sync` formula flips.

Manual run today (CLI). A small local GUI window is planned (Phase 5, paused).

## Status (2026-06-25)

| Phase | What | State |
|---|---|---|
| P0 | scaffold · config · auth · frontmatter · paths | ✅ done, CLI-verified |
| P1 | core body (headings, lists, to-do, quote, code, newlines, recursion) | ✅ done, CLI-verified |
| P2 | rich blocks (toggle flatten, callout alert, column, table, equation, bookmark) | ✅ done, CLI-verified |
| P3 | attachments (download + rewrite + idempotent) | ⚠️ code done, **download not yet tested** |
| P4 | INDEX + orphan detection + write-back + `--since` incremental | ✅ done; ⚠️ `Sync`-formula flip not yet eyeballed |
| P5 | GUI window | ⏸️ paused / not started |

45 vitest tests + `tsc --noEmit` pass. CLI runs clean against a real database; the only
unexercised path is **attachment download** (notes with images/files).

## Setup

```bash
npm install
cp .env.example .env     # fill NOTION_TOKEN + NOTES_DB_ID
```

The Notion integration must be **shared** to the target database (Notion → database →
`•••` → Connections). `NOTES_DB_ID` accepts a comma-separated list for multiple DBs.

## Usage

```bash
npm run export                # full export → ${OUT_BASE}/${dbName}/, + INDEX.md, + write-back
npm run export -- --since     # only notes changed since last sync (Last edited > Last synced)
npm run export -- --dry-run   # list what would happen; no writes, no downloads, no write-back
npm test                      # unit tests
npm run typecheck
npx tsx scripts/demo.ts       # offline: emit a sample archive file (no network)
```

Output layout:

```
${OUT_BASE}/${databaseName}/
├── YYYY-MM-DD-<slug>.md     # one per note; filename is the identity key
├── attachments/             # downloaded images/files (content-stable names)
└── INDEX.md                 # regenerated each run; table of notes + ## Orphans
```

## Database requirements (flexible)

The tool does **not** require an exact schema. What it needs:

Every named property is matched **case-insensitively** against a default candidate list,
which a `config.json` override replaces:

| Frontmatter | Notion source | Default name candidates | If absent |
|---|---|---|---|
| `title` | any `title`-typed property (matched by **type**, name-agnostic) | — | every DB has one |
| `created` | a `date` property | `Created` | falls back to `created_time` |
| `tags` | a `relation`, `multi_select`, or `select` property | `Tags`, `Tag`, `Category`, `Categories` | tags empty (no error) |
| `type` | `select` / `status` / `multi_select` / `rich_text` | `Type` | type empty (no error) |
| (write-back / `--since`) | a `date` property | `Last synced` | write-back **skipped gracefully**; `--since` exports everything |

Tag matching is by **name**, not by guessing the first relation — so an unrelated relation
like `Parent` is never mistaken for tags. `title` is the only field matched by property
type rather than name.

The frontmatter key is always `tags` (a list — a note can have many). Override names in
`config.json` if your properties are named differently:

```json
{
  "token": "secret_…",
  "databaseId": "…",
  "outBase": "~/NotionArchive",
  "props": { "type": "Type", "tags": "Tags", "created": "Created", "lastSynced": "Last synced" }
}
```

`tags` may point at a relation **or** a native multi-select/select property.

## Design decisions (locked)

- **Identity = filename = `YYYY-MM-DD-{slug(title)}.md`** (date = note's `Created`).
  Same key ⇒ overwrite. No `notion_id` stored. Renaming a title in Notion makes the old
  file an **orphan** — INDEX surfaces it for manual cleanup. (Acceptable while titles
  are stable.)
- **Frontmatter:** `title` ← title prop, `type` ← Type, `tags` ← the tag property
  (relation resolved to names, or multi_select/select read directly), `created` ←
  Created (falls back to `created_time` when empty).
- **Body → GFM:** toggle flattens to a bold title + flat children; callout → `> [!NOTE]`
  (emoji maps flavor); columns flatten; tables → GFM; signed media URLs are downloaded
  locally (they expire ~1h). Newlines: block boundary `\n\n`, list items `\n`, soft break `\n`.
- **`Sync` is a Notion formula** (`dateBetween(Last edited, Last synced, "minutes") <= 1`),
  not a checkbox. The tool only sets `Last synced`; the formula self-flips. The minute
  tolerance absorbs the fact that the write-back is itself an edit.

## Architecture

```
config.ts ─► notion.ts (throttle, pagination, recursion, write-back)
                │
   tags.ts ─► frontmatter.ts ───────┐
                                     ├─► engine.ts ─► out/*.md + INDEX.md
   blocks (fetchBlockTree) ─► convert.ts (pure, GFM) ─┤
                              attachments.ts ─────────┘
   incremental.ts (--since)   indexfile.ts (INDEX + orphans)
   main.ts (CLI)              [server.ts — Phase 5, GUI, TODO]
```

`convert.ts` (block tree → GFM) is the critical path and is a pure function — fully
unit-tested without network. CLI/GUI are thin shells over `runExport(config)`.

## Not done yet

- **Attachment download** path is written but untested — run an export on a note with an
  image and confirm files land in `attachments/` and links resolve offline.
- **`Sync` formula flip** — confirm visually in Notion after a write-back.
- **Phase 5 GUI** — local web window to configure token / pick database / set output folder.
- Import script (old-data → Notion) is a separate, future effort.
