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
- [x] E.0 ✅ resolved: installed SDK is 2.3.0 with **no** file-upload API. Decision: **direct REST** (`fetch` to /v1/file_uploads), NO SDK bump — isolated in uploadFiles.ts, no risk to export.
- [x] E.1 `import/uploadFiles.ts`: REST two-step upload (`notionUploadFile`) → file_upload id; pure `uploadAll` dedup cache. External URLs handled in E.2 (kept as external image)
- [x] E.2 `mdToBlocks` standalone `![](…)` → image block (http=external, local=`_local`); engine uploads (resolved vs the .md dir) + applyUploads → file_upload before append; missing upload → block dropped. (Non-image file links deferred — images were the ask.)
- [ ] ▢ **CP-E** — ⚠️ BUG TO REVISIT: live test hit `HTTP 400` on the upload *send* step (create step OK). Prime suspect: `new Blob([buf])` has no MIME type → multipart part goes as `application/octet-stream`, Notion rejects. First fix = log `await sent.text()` to see Notion's message, then likely set Blob `type` from extension. Image render in Notion still unverified.

## Phase F — Batch + dry-run + docs
- [x] F.1 `--dir`: import all `*.md` (excl. INDEX.md, sorted); shared schema/pages fetched once; per-file try/catch → `failed`; summary `created/updated/failed`. (Note: intra-batch dup keys not re-matched — pages queried once.)
- [x] F.2 `--dry-run`: prints plan via pure `describePlan` (props + block count + relation tags) + would-upload/would-resolve notes + create-vs-update; zero writes/creates/uploads; token never printed
- [ ] F.3 `import` script in `package.json`; README import section; update `CLAUDE.md`/`PLAN.md`/`TODO.md`
- [ ] ▢ **CP-F** — dry-run matches a real run; batch-import a folder cleanly

## Verify (each phase, before its ▢)
- [ ] `npm test` **and** `npm run typecheck` from `notion-md-archive/` (not workspace root)
- [ ] pure modules covered by offline fixtures, no token
