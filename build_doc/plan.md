# PLAN — Local GUI (Phase 5)

Companion to [SPEC-gui.md](SPEC-gui.md). Status: **for review, not started.**
Task checklist in [todo.md](todo.md).

## Guiding constraint (from review)

**Clean frontend/backend split.** The frontend is a set of static files the backend serves
verbatim; the backend exposes only a JSON + SSE contract. Restyling later means editing
`src/gui/styles.css` (and `index.html` markup) only — never `server.ts`. This **supersedes**
the spec's "embed index.html as a string" note.

### The boundary contract (frozen first, so both sides can move independently)

Backend → frontend speaks exactly this. Nothing else crosses the line.

| Channel | Shape |
|---|---|
| `GET /config` | `{ tokenSet, tokenHint, databaseIds: string[], outBase: string, props?: {...} }` (token masked) |
| `POST /databases` `{token}` | `{ databases: [{ id, name }] }` or `{ error }` |
| `GET /schema` `?db=&token=` | `{ map: { type, tags, created, lastSynced } }` — DB-aware default mapping (T8) |
| `GET /browse` `?path=` | `{ path, parent, entries: [{ name, dir }] }` — read-only fs listing for the Source picker (T7) |
| `POST /run` `{token, databaseIds, outBase, props?, mode, dryRun, since, source}` | `202 {ok:true}` then stream on `/log` |
| `GET /log` (SSE) | `data: <log line>\n\n` per line; final `event: done\ndata: <RunSummary JSON>\n\n`; on failure `event: error\ndata: <message>` |

Once this table is implemented, the frontend can be rewritten/restyled freely against it.

## File map (new files only; engine + pure modules untouched)

```
src/server.ts        NEW  backend shell: http, routes, static serving, SSE fan-out
src/gui/index.html   NEW  markup (form + log pane)
src/gui/styles.css   NEW  all styling — the only file a restyle touches
src/gui/app.js       NEW  fetch + EventSource glue against the contract above
```

`package.json` already has `"gui": "tsx src/server.ts"` — no dependency added.

## Dependency graph

```
T1 backend skeleton + static serving ──┬─► T2 /config load + prefill
                                        ├─► T3 Connect → DB picker
                                        └─► T4 Run export + SSE + persist   [done; CP-2]
                                                  │
   (redesign 2026-06-28, post-CP-2)               ▼
   T5 Export/Import tabs (FE refactor) ─► T6 Import run ─► T7 Source Browse
                                        └─────────────────► T8 DB-aware Map hint
```

- **T1–T4 done** (CP-2). The redesign re-slices the remaining frontend + two small endpoints.
- T5 is a frontend-only refactor (tabs, move Output into Export tab); it reuses every existing
  endpoint and must keep the export path green.
- T6 adds the `/run` import branch (reuses T4's SSE + persist machinery).
- T7 (`/browse` picker) and T8 (`/schema` Map hint) are independent enhancements, both need T5's
  tab layout; T7 also makes T6's Source easier to fill but isn't required for T6.

## Vertical slicing (each task = one complete path, page → server → result)

Not horizontal ("all endpoints", then "all frontend"). Each task wires its own thin slice
through both sides so it is demoable on its own.

- **T1** — `npm run gui` opens a static page (form renders, no live data). Proves the FE/BE
  split and the no-build static-serve path.
- **T2** — reopen → fields pre-filled from `config.json` (token masked). Proves persistence read.
- **T3** — Connect → dropdown lists real databases. Proves the only extra network read.
- **T4** — Run (export) → archive written, log streams live, summary shown, `config.json`
  persisted, CLI reuses it. The end-to-end core.
- **T5** — Import mode toggle → `runImport` over file/dir with live log. Feature complete.

## Checkpoints (stop for human verification)

- **CP-1 after T1** — Confirm the FE/BE boundary: editing only `styles.css` changes the look
  with zero `server.ts` edits. This is the explicit review goal; verify before building on it.
- **CP-2 after T4** — Full export path works through the GUI and matches CLI output for the
  same config. The product is usable here even if T5 slips.
- **CP-3 after T5** — Feature complete; run the full acceptance list from the spec.

## Cross-cutting invariants (every task)

- No new entry in `package.json` dependencies; no build step.
- `npm test` + `npm run typecheck` stay green — engine, `convert.ts`, pure modules untouched.
- Network only via `notion.ts` (single throttle queue); no second Notion `Client`.
- `config.json` stays gitignored; token never echoed raw to the page or logs.
- Server binds `localhost` only.

## Open questions for review (from spec, still open)

1. Output folder = plain text field (no native directory dialog). OK?
2. `localhost`-only, no auth. OK for single-user local tool?
