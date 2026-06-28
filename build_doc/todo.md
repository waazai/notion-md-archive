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

## T4 — Run export + live log + persist  ▢  ← core value
Full end-to-end export path through the GUI.

- [ ] `POST /run`: validate (token + ≥1 db) → write `config.json` → start run.
- [ ] SSE `GET /log`: engine `log` callback → `data: <line>\n\n`; final `event: done` carries `RunSummary`; `event: error` on throw.
- [ ] `app.js`: Run → POST → open `EventSource('/log')` → append lines → render summary.

**Verify:** Run (export) writes archive, log streams each `✓ <file>` live, summary matches CLI; `config.json` persisted; subsequent `npm run export` (CLI) uses it with no flags.
**AC:** spec criteria 4, 5, 6.

### ▶ CP-2 — full export path works via GUI and matches CLI output. Product usable here.

---

## T5 — Import mode  ▢
Additive branch reusing T4 machinery.

- [ ] `app.js`: mode toggle shows import fields (file/dir, target db, `--map`); hides export-only flags.
- [ ] `POST /run` import branch → `runImport` with parsed options; same SSE log path.

**Verify:** Import mode runs `runImport` over a file/dir, streams log, shows result.
**AC:** spec criterion 1 (import direction) + full acceptance list.

### ▶ CP-3 — feature complete; run the spec's full acceptance list. `npm test` + `npm run typecheck` green.
