# notion-md-archive

Notion is great in multi-device layout and sync, but files in notion are hard to access from outside, and the exporting formats are limited.  
This project syncs Notion database directly to local Markdown files, combining Notion's accessibility with the flexibility of Markdown. 

- **Export** — Notion database → one `.md` per page (YAML frontmatter + converted body) +
  `attachments/` + `INDEX.md`, then writes `Last synced = now` back to each note.
- **Import** — a local `.md` file (or folder) → Notion: frontmatter maps to properties, the body
  converts to blocks. Re-runs are idempotent (matched by identity key, updated not duplicated).

> For internals, the full Markdown ⇄ Notion conversion table, and contributing notes, see
> [CLAUDE.md](CLAUDE.md). Release/packaging plan: [build_doc/PLAN-release.md](build_doc/PLAN-release.md).

## Quick Start (Windows)

1. Download `notion-md-archive.exe` from the
   [latest release](https://github.com/waazai/notion-md-archive/releases).
2. Double-click it. Your browser opens at `http://localhost:4517`.
3. A `config.json` appears after first use (stores your token so you don't re-enter it every time).

On first launch Windows SmartScreen may warn about an unknown publisher (the binary is unsigned)
— choose **More info → Run anyway**. macOS/Linux executables aren't published yet — run from
source (`npm run gui`) there for now.

### Output layout

```
${OUT_BASE}/${databaseName}/
├── YYYY-MM-DD-<slug>.md     # one per note; filename is the identity key
├── attachments/             # downloaded images/files (content-stable names)
└── INDEX.md                 # regenerated each run; table of notes + ## Orphans
```

## Database requirements (flexible)

**Primary key: title + date.** No exact schema is required. Every named property is matched
**case-insensitively** against a default candidate list, overridable in `config.json` (`props`)
or via `--map`:

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

## Run from source

### Setup

```bash
npm install
cp .env.example .env     # fill NOTION_TOKEN + NOTES_DB_ID
```

- The Notion integration must be **shared** to the target database (Notion → database → `•••` →
  Connections).
- `NOTES_DB_ID` accepts a comma-separated list for multiple DBs.
- Token and ids may also live in a gitignored `config.json` (precedence: CLI flag → `config.json`
  → env). **Token is never a CLI flag**, so it can't leak into shell history.

### GUI

```bash
npm run gui      # serves http://localhost:4517 (override GUI_PORT)
```

A local web page over the same engine: Connect lists the databases the integration sees;
Export/Import tabs stream a live log and persist settings to `config.json`.

### CLI

```bash
# Export — Notion → Markdown
npm run export                # full export → ${OUT_BASE}/${dbName}/ + INDEX.md + write-back
npm run export -- --since     # only notes changed since last sync (Last edited > Last synced)

# Import — Markdown → Notion
npm run import -- --file note.md --db <id>            # one file
npm run import -- --dir ./out/MyDB --db <id>          # every *.md in a folder (skips INDEX.md)
npm run import -- --file note.md --db <id> --map tags=Topics,type=Kind
```

## Known limitations

- **Non-image file attachments are not uploaded on import.** Only local images
  (`![](attachments/…)`) upload; a `[report](attachments/x.pdf)` link is left as-is.
- **Intra-batch duplicate identity keys.** A `--dir` run snapshots existing pages once before the
  loop. If two files in the *same* batch resolve to the same key `YYYY-MM-DD-{slug(title)}`, both
  are created instead of the second updating the first. Cross-run and single `--file` are unaffected.
