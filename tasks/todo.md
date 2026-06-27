# TODO — Import module (local Markdown → Notion)

Plan: [plan.md](plan.md) · Spec: [../SPEC-import.md](../SPEC-import.md).
`[x]` when acceptance + verify pass. ▢ = human checkpoint — **stop and wait for the user**.
Pure modules build/test offline (no token); only ▢ checkpoints need `NOTION_TOKEN`.
Scope: **import only**, additive — never modify the export path.

## Phase A — Scaffold + minimal create (vertical MVP)
- [x] A.1 `main.ts` `import` subcommand; reuse `loadConfig`; parse `--file/--dir/--db/--map/--dry-run` → `ImportOptions`; token from config only, never logged
- [x] A.2 `import/parseFile.ts` (pure): `.md` → `{ frontmatter, body }` (YAML fence split + parse)
- [x] A.3 `import/properties.ts` (pure, minimal): `title` payload + `identityKey` = `YYYY-MM-DD-slug(title)`
- [x] A.4 `import/mdToBlocks.ts` (pure, minimal): paragraph + h1/2/3 + inline bold/italic/code/strike/link
- [x] A.5 `createPage` + `appendChildren` (≤100/chunk) added to the `Notion` class — kept in notion.ts (the sole network module, single throttle) rather than a separate import/importNotion.ts
- [x] A.6 `import/engine.ts` `runImport` single-file create-only + summary; CLI prints it (pure `planImport` extracted + tested)
- [x] ▢ **CP-A** — ✅ tested: real DB, minimal file → page created, title + body correct (tag/type not yet mapped — expected, lands C.1/D)

## Phase B — Full body conversion (pure)
- [x] B.1 lists: bulleted/numbered nested (2-space) + `to_do` (mdToBlocks rewritten line-based)
- [x] B.2 quote, callout (`> [!NOTE]`→callout+emoji), code(+lang), divider, equation
- [x] B.3 GFM table → `table`/`table_row`
- [x] B.4 round-trip tests vs `convert.test.ts` fixtures (modulo flatten/skip losses); added `***bold+italic***` inline support
- [~] ▢ **CP-B** — ✅ `npm test` (109) + `npm run typecheck` green; ⬜ manual Notion spot-check DEFERRED (no suitable file yet) — revisit when one is available

## Phase C — Full properties + upsert
- [x] C.1 `properties.ts`: type→select/status, created→date, multi_select/select tags (names); schema-driven types; `--map` overrides; relation deferred to D; unmapped → notice
- [x] C.2 upsert: query DB, match by `identityKey` (title + Created date) → update vs create; body replaced (deleteChildren) so no dup blocks; no `notion_id` in files
- [x] ▢ **CP-C** — ✅ user OK'd ("good"); upsert + property mapping accepted (manual Notion re-check optional)

## Phase D — Relation tags + auto-create
- [x] D.1 `import/tagsWrite.ts`: relation type → `relation.database_id` → name→id (cached, case-insensitive); auto-create missing tag page; inverse of `tags.ts`. buildProperties captures the RelationTagRequest
- [x] D.2 wire tag paths in engine: multi_select/select → names (C.1); relation → resolveRelationTags + merge; prop absent → skip + notice; dry-run notes only (no page creation)
- [ ] ▢ **CP-D** — note with a new tag name: tag page auto-created in related DB + linked  ← **YOU ARE HERE (needs token)**

## Phase E — Attachments upload
- [ ] E.0 ⚠️ confirm `@notionhq/client` (currently ^2.2.15) supports file uploads; else bump SDK or use REST upload endpoint
- [ ] E.1 `import/uploadFiles.ts`: upload local file → file id; content-keyed cache; external URLs kept as external
- [ ] E.2 `mdToBlocks` image/file blocks carry local-path placeholder; engine resolves → file id before append
- [ ] ▢ **CP-E** — note with an image renders in Notion; missing local file → skip + notice

## Phase F — Batch + dry-run + docs
- [ ] F.1 `--dir`: import all `*.md`; per-file summary `created/updated/skipped/failed`
- [ ] F.2 `--dry-run`: print plan (props + block count + create/update + tags-to-create + files-to-upload); zero writes/creates/uploads; token never printed
- [ ] F.3 `import` script in `package.json`; README import section; update `CLAUDE.md`/`PLAN.md`/`TODO.md`
- [ ] ▢ **CP-F** — dry-run matches a real run; batch-import a folder cleanly

## Verify (each phase, before its ▢)
- [ ] `npm test` **and** `npm run typecheck` from `notion-md-archive/` (not workspace root)
- [ ] pure modules covered by offline fixtures, no token
