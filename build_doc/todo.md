# TODO — Local GUI (Phase 5)

Plan: [plan.md](plan.md) · Spec: [SPEC-gui.md](SPEC-gui.md). Order = dependency order.
Each task is one vertical slice (page → server → result).

---

## T1 — Backend skeleton + static frontend  ✅
**Unblocks everything.** Backend serves the static page; no live data yet.

- [x] `src/server.ts`: Node `http` server on port (`GUI_PORT` || 4517), prints URL, opens browser.
- [x] `GET /` → serve `src/gui/index.html`; serve `src/gui/styles.css` + `app.js` static (correct content-types).
- [x] `src/gui/index.html` + `styles.css` + `app.js`: form shell (token, db dropdown, output, mode toggle, flags, Run) + empty log pane. No data wiring yet.

**Verify:** `npm run gui` → browser shows the form. `npm test` (140) + `npm run typecheck` green. ✅
**AC:** page loads, no new dep in `package.json`, no build step. ✅ · commit `d3e9410`

### ▶ CP-1 — confirm FE/BE split: a `styles.css`-only edit restyles the page with zero `server.ts` change.

---

## T2 — Config load + prefill  ✅
Persistence read: reopening pre-fills last settings.

- [x] `GET /config` → return persisted settings (`peekConfig`, never throws), **token masked**.
- [x] `app.js`: on load, fetch `/config`, populate outBase + token hint; stash databaseIds for T3.

**Verify:** live `/config` returns masked token (`ntn_…EckF`) + db id + outBase from `.env`. ✅
**AC:** spec criterion 2. ✅ · seam: `createServer(deps)` for offline tests.

---

## T3 — Connect → database picker  ✅
The one extra network read.

- [x] `POST /databases` `{token}` → `Notion.listDatabases()` (search). Blank token reuses saved.
- [x] `app.js`: Connect → POST → fill dropdown, re-select remembered db; readable error on failure.

**Verify:** live `/databases` listed real DBs (Tags, Notes); bad token → 400 error. ✅
**AC:** spec criterion 3. ✅

---

## T4 — Run export + live log + persist  ✅  ← core value
Full end-to-end export path through the GUI.

- [x] `POST /run`: validate (token + ≥1 db) → `writeConfigJson` → 202 ack → async run.
- [x] SSE `GET /log`: engine `log` callback → `data: <line>`; final `event: done` (`RunSummary`); `event: error` on throw.
- [x] `app.js`: Run → open `EventSource('/log')` → POST → append lines → render summary.

**Verify:** live dry-run through the GUI streamed real lines + `event: done` summary
(Notes: 17 notes); `config.json` written by `/run` for CLI reuse. ✅
**AC:** spec criteria 4, 5, 6. Live **non-dry-run** export = manual CP-2 step (mutates Notion write-back).

### ▶ CP-2 — full export path works via GUI and matches CLI output. Product usable here.  ◀ STOP

---

## T5 — Layout: Export / Import tabs  ✅   (redesign 2026-06-28)
Frontend-only refactor of the existing shell — reuses all current endpoints.

- [x] `index.html` + `styles.css`: radio → **tabs**; Output in Export tab; Source + Browse in
      Import tab; **Map** field in both; separate **Run Export** / **Run Import** buttons.
- [x] `app.js`: tab switching keeps Token + Database shared; export Run path + Map parsing wired;
      import Run is a placeholder until T6.

**Verify:** layout test (HTML structure) green; full suite 151 green; export path intact. ✅
**AC:** spec criterion 8.

## T6 — Import run  ▢
Wire the Import tab to the engine; additive `/run` branch.

- [ ] `POST /run` import branch → `runImport` (parse Source = file/dir, db, map, dryRun); same SSE log path.
- [ ] `app.js`: Run Import sends Source + dryRun + map; renders the import summary.

**Verify:** Run Import over a `./out/<db>` folder streams the log + result (dry-run first).
**AC:** spec criterion 9.

## T7 — Source Browse (file/folder picker)  ▢
Server-side filesystem picker for the Import Source.

- [ ] `GET /browse?path=` → `{ path, parent, entries:[{name,dir}] }` (read-only listing, localhost).
- [ ] `app.js` + `styles.css`: a small modal to navigate folders and pick a file **or** folder → fills Source.

**Verify:** Browse… opens, navigates, picking fills the Source path; `/browse` never writes.
**AC:** spec criterion 10.

## T8 — DB-aware Map hint  ▢
Show what each frontmatter key resolves to in the selected DB.

- [ ] `GET /schema?db=&token=` → `{ map:{ type, tags, created, lastSynced } }` via `resolvePropName`.
- [ ] `app.js`: on database select, fetch `/schema`, render the resolved mapping as a greyed hint by both Map fields.

**Verify:** selecting Notes shows e.g. `tags→Categories`; empty Map field = defaults.
**AC:** spec criterion 11.

### ▶ CP-3 — feature complete; run the spec's full acceptance list. `npm test` + `npm run typecheck` green.
