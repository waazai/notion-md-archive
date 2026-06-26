# PLAN — Import module (local Markdown → Notion)

Derived from [SPEC-import.md](../SPEC-import.md). Read that first for the *what/why*; this is
the *how/in-what-order*. Scope: a new `src/import/` tree + `import` CLI subcommand. **Additive
only — does not touch the export path.**

Convention inherited from the export effort: `[x]` only when acceptance **and** verify pass;
**▢ = human checkpoint — stop and wait for the user to test before continuing.** Build/test
the pure modules offline (no token); only checkpoints need `NOTION_TOKEN`.

---

## Dependency graph

```
                 parseFile.ts ─┐  (pure)
   (pure) properties.ts ───────┼─► engine.runImport ─► importNotion.ts (network)
   (pure) mdToBlocks.ts ───────┘            │              ▲
                                            ├─ tagsWrite.ts (network, relation tags)
                                            └─ uploadFiles.ts (network, attachments)
   main.ts (import subcommand) ─► engine.runImport
```

- **Pure leaves** (`parseFile`, `properties`, `mdToBlocks`) have no dependencies on each other
  and no network — they are unit-tested offline and all feed the engine.
- **Network modules** (`importNotion`, `tagsWrite`, `uploadFiles`) reuse `notion.ts`'s
  throttle/pagination patterns; only they hit the API.
- **`engine.runImport`** orchestrates; **`main.ts`** is a thin CLI shell over it (so the future
  GUI/AI can call the same engine — see SPEC §1).

## Slicing strategy — vertical, not horizontal

Phase A builds **one complete end-to-end path** (parse → minimal properties → minimal body →
create a page) to prove the whole wiring against a real DB early. Every later phase **deepens
one dimension** of that working path (full body, upsert, relation tags, attachments, batch),
so there is always a runnable, verifiable tool — never a pile of half-modules waiting to
integrate.

---

## Phase A — Scaffold + minimal create (vertical MVP)
**Goal:** `npm run import -- --file note.md --db <id>` creates a Notion page whose title comes
from YAML and whose body is a converted paragraph. Proves config + CLI + engine + network.

- A.1 **CLI + options.** Add `import` subcommand dispatch in `main.ts`; reuse `loadConfig`
  (flag → config.json → env). Parse `--file`/`--dir`/`--db`/`--map`/`--dry-run` into an
  `ImportOptions`. Token resolves via config, **never required as a flag**; never logged.
- A.2 **`parseFile.ts` (pure).** `.md` text → `{ frontmatter: Record<string,unknown>, body:
  string }` (split the leading `---` YAML fence, `yaml`-parse it; rest = body). Reverse of
  `buildFrontmatter`.
- A.3 **`properties.ts` (pure, minimal).** `title` → Notion title payload; `identityKey(meta)`
  = `YYYY-MM-DD-${slug(title)}` reusing `paths.slug`. (Other prop types land in Phase C.)
- A.4 **`mdToBlocks.ts` (pure, minimal).** paragraph + `#/##/###` headings + inline
  bold/italic/code/strike/link → `rich_text`. (Rest of the subset in Phase B.)
- A.5 **`importNotion.ts` (network).** `createPage(dbId, properties)` + `appendChildren(pageId,
  blocks)` (chunk to Notion's 100-children limit); serialized ~3 req/s via the `notion.ts`
  schedule pattern. Reuse the existing `Notion` class where possible.
- A.6 **`engine.runImport` (single-file, create-only).** parse → properties → blocks → create
  → append; return a per-file summary. CLI prints it.
- [ ] ▢ **CP-A** — run vs a real DB with one minimal file: a page appears, title + paragraph
  body correct. (token required)

## Phase B — Full body conversion (deepen `mdToBlocks`, pure)
**Goal:** round-trip parity with the GFM subset `convert.ts` emits.

- B.1 lists: bulleted/numbered (nested, 2-space indent) + `- [ ]`/`- [x]` → `to_do`.
- B.2 `> quote` → `quote`; `> [!NOTE]` callout → `callout` (+ emoji from flavor map, inverse
  of `calloutFlavor`); ` ```lang ` → `code` (+ language); `---` → `divider`; `$$` → `equation`.
- B.3 GFM table → `table` + `table_row` (inverse of `renderTable`).
- B.4 round-trip tests: feed the *expected Markdown* of `convert.test.ts` fixtures back through
  `mdToBlocks`; assert structural equivalence to the source block tree (modulo the documented
  flatten/skip losses).
- [ ] ▢ **CP-B** — `npm test` + `npm run typecheck` green (offline); spot-check one converted
  page's body in Notion. (mostly automated)

## Phase C — Full properties + upsert
**Goal:** all scalar props mapped; re-running updates in place instead of duplicating.

- C.1 `properties.ts`: `type`→select, `created`→date, generic `rich_text`, `multi_select` tags
  (write names). Schema-driven type detection via `retrieveDatabase`; honor `--map`/`props`
  overrides; unmapped YAML keys → logged notice.
- C.2 upsert: query the target DB, match by `identityKey` (title prop + `Created` date), then
  `updatePage` vs `createPage`. No `notion_id` stored in files (invariant).
- [ ] ▢ **CP-C** — import a file, then re-import: page updates in place, **no duplicate**;
  properties correct. (token required)

## Phase D — Relation tags + auto-create
**Goal:** tag/category that *is a page* (relation) resolves and self-populates.

- D.1 `tagsWrite.ts`: detect the tag prop type from schema; for `relation`, read
  `relation.database_id`, query that DB for name→id, cache; **auto-create** a tag page (title =
  name) when absent, then link by id. Inverse of `tags.ts`/`resolveTags`.
- D.2 wire the three tag paths in the engine: `multi_select`/`select` → names (Notion
  auto-creates options); `relation` → D.1; **prop absent → skip tags + notice** (no crash).
- [ ] ▢ **CP-D** — import a note with a brand-new tag name: tag page created in the related DB
  and linked on the note. (token required)

## Phase E — Attachments upload
**Goal:** local `attachments/*` land in Notion as real files.
**⚠️ Risk:** `@notionhq/client@^2.2.15` predates the File Upload API. First step is to confirm
the SDK exposes file uploads (`client.fileUploads.*`); if not, **bump the SDK** or call the
REST upload endpoint directly. Resolve this before building E.2.

- E.1 `uploadFiles.ts`: upload a local file via the Notion file-upload flow → file id;
  content-keyed cache so a file referenced twice uploads once. External `http(s)` refs are
  kept as external, not re-uploaded.
- E.2 `mdToBlocks` emits `image`/`file` blocks carrying a local-path placeholder; the engine
  resolves placeholders → uploaded file ids before `appendChildren`.
- [ ] ▢ **CP-E** — import a note with an image: the image renders on the Notion page; missing
  local file → block skipped with a notice, no crash. (token required)

## Phase F — Batch + dry-run + docs
**Goal:** folder imports, a truthful dry-run, and updated docs.

- F.1 `--dir`: import every `*.md`; per-file summary `created / updated / skipped / failed`.
- F.2 `--dry-run`: resolve everything and print the plan (properties + block count +
  create-vs-update + tags-to-create + files-to-upload); **zero** writes/creates/uploads/
  tag-page creation. Token never printed.
- F.3 docs: `import` script in `package.json`; README import section; update
  `CLAUDE.md`/`PLAN.md`/`TODO.md` to note import is built and add the import checkpoints.
- [ ] ▢ **CP-F** — dry-run report matches a real run; batch-import a folder cleanly. (token req.)

---

## Verification (every phase, before its checkpoint)
- `npm test` **and** `npm run typecheck` from `notion-md-archive/` (root vitest pulls in
  sibling projects — don't).
- Pure modules (`parseFile`/`properties`/`mdToBlocks`) covered by offline fixtures, **no token**.
- Network behaviour only at the ▢ checkpoints, against a scratch DB first.

## Risks / watch list
- **File Upload API vs SDK version** (Phase E) — see above; may force a dependency bump.
- **Upsert matching cost** — matching by title+date may need a filtered `databases.query`;
  confirm the filter works for the title property and date precision (date vs datetime).
- **Round-trip losses are one-way** (toggle/column flattened by export) — import reproduces the
  flattened form by design; tests assert *that*, not pixel-fidelity.
- **`@notionhq/client` strictness** — block/property payload shapes are exact; lean on
  typecheck and small live smoke tests per phase.
