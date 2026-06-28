# SPEC — Local GUI (Phase 5)

Status: **approved, not yet built** · Owner: notion-md-archive · Date: 2026-06-27

A small local web GUI over the existing `runExport` / `runImport` core. The GUI is a third
thin shell beside the CLI — it does not own any logic; it reads/writes the shared
`config.json` and streams the engine's log to a browser page.

## Goals

1. **Remember settings.** Re-opening the GUI pre-fills the last token, database, output
   folder, and run flags from `config.json` (local, persistent).
2. **Easy to operate.** One page: connect → pick database → choose output → Run, with a
   live log.
3. **Keep the CLI port.** GUI and CLI share one `config.json` and one engine. A future AI
   tool/skill wraps the same `runExport` and reads the same `config.json` — no fork of the
   core.

## Non-goals

- No new framework, no bundler, no build step (project is tsx-only).
- Not a packaged desktop app (no Electron). It is a `local web page`, per the README roadmap.
- The GUI adds **zero** runtime dependencies (Node built-in `http` only).
- No change to the export/import engine, `convert.ts`, or any pure module.

## Decisions (locked)

| Topic | Decision | Rationale |
|---|---|---|
| Runtime | **Pure Node `http` server + browser page** | GUI = symmetric thin peer of the CLI; zero deps, zero build, matches tsx-only ethos. |
| Log streaming | **Server-Sent Events (SSE)** | One-way server→browser; native `EventSource` / `res.write`; the engine `log` callback maps to it directly; no `ws` dependency. |
| Settings store | **Shared `config.json`** | `config.ts` already resolves `config.json → env` and is documented as "written by the GUI". One source of truth for GUI, CLI, and future AI tool. |
| Token at rest | **Plaintext in `config.json`** | Same risk profile as the existing `.env`. `config.json` is already gitignored and untracked. Simplest; no native keychain dependency. |
| Export vs Import | **Two tabs** (not a radio) | Each direction owns its path field + flags; Token + Database stay shared above the tabs. (revised 2026-06-28) |
| Source picker | **Server-side `/browse` modal** | Native dialogs can't return a real path and `webkitdirectory` only uploads files; a local server has fs access, so it lists folders itself and returns the picked file/folder path. |
| Map default | **DB-aware (`/schema` + `resolvePropName`)** | Shows what each key actually resolves to in the selected DB (e.g. `tags→Categories`), reusing existing resolution logic. Field empty = use defaults. |

### Security note (token)

The token is stored **plaintext** in `config.json`. This is acceptable only because
`config.json` is in `.gitignore` and is not tracked by git (verified 2026-06-27). The build
**must not** remove `config.json` from `.gitignore`, and the GUI **must not** echo the token
back into the page in a way that ends up in logs. Treat the token like the existing `.env`.

## Architecture

```
            engine.ts   runExport / runImport   (unchanged core)
          ↗      ↑       ↖
   main.ts    config.json   server.ts
   (CLI)     (persisted)    (GUI: reads + writes)
                 ↑
         future AI tool/skill reads the same file
```

`server.ts` is the only new module. It is a thin shell — it parses requests, calls
`loadConfig` / writes `config.json`, calls `notion` (for the DB list) and `runExport` /
`runImport`, and pipes the `log` callback to SSE clients. No business logic lives here.

## HTTP surface

Single process started by `npm run gui` (`tsx src/server.ts`), listening on a fixed local
port (default `4517`, override `GUI_PORT`). On start it prints the URL and opens the browser.

Frontend is **separate static files** under `src/gui/` (`index.html`, `styles.css`, `app.js`),
served verbatim — to restyle, edit `styles.css` only; the server never depends on its contents.

| Method · Path | Body | Returns | Purpose |
|---|---|---|---|
| `GET /` `/styles.css` `/app.js` | — | static | The frontend files from `src/gui/` (read fresh per request, no build). |
| `GET /config` | — | JSON (token masked) | Current settings to pre-fill the form. Token returned **masked** (`tokenHint` + `tokenSet`); the raw token never reaches the page. |
| `POST /databases` | `{ token }` | `{ databases: [{ id, name }] }` | List databases the integration can see, for the picker. Blank token reuses the saved one. |
| `GET /schema` | `?db=&token=` | `{ map: { type, tags, created, lastSynced } }` | DB-aware default mapping: runs `resolvePropName` against the chosen DB's schema so the Map field can show what each key actually resolves to (e.g. `tags→Categories`). |
| `GET /browse` | `?path=` | `{ path, parent, entries: [{ name, dir }] }` | Server-side filesystem listing for the Import **Source** picker (read-only; local only). Used by a small in-page modal to pick a file or folder. |
| `POST /run` | `{ token, databaseIds, outBase, props?, mode, dryRun, since, source }` | `202 { ok }` then SSE | Persist settings to `config.json`, then run the chosen direction. |
| `GET /log` (SSE) | — | `text/event-stream` | Live engine log lines; the `log` callback writes `data: <line>\n\n`. A terminal `event: done` carries the run summary, `event: error` a failure. |

### Run flow

1. `npm run gui` → server starts → opens `http://localhost:4517`.
2. Page loads `GET /config` → fields pre-filled from last run (token shown masked).
3. User adjusts; **Connect** calls `POST /databases` to populate the database dropdown.
4. **Run** → `POST /run`:
   a. Validate (token + at least one database).
   b. Write `config.json` (persist for next launch and for the CLI).
   c. Open the SSE channel; call `runExport` / `runImport` with a `log` that fans out to SSE.
   d. On finish, emit `event: done` with the `RunSummary`.

## Page layout (revised 2026-06-28)

**Section 1 (shared):** Token + Database only.
**Section 2:** two **tabs** — Export and Import — each with its own path field, flags, Map, and Run.

```
┌─ notion-md-archive ───────────────────────────┐
│ Token    [•••• saved]          [ Connect ]     │  Section 1
│ Database ▼ [ Notes ]                           │
│ ───────────────────────────────────────────── │
│ ┌ Export ┬ Import ┐                            │  Section 2 (tabs)
│ │ EXPORT                                       │
│ │   Output [ ~/NotionArchive ]                 │
│ │   [x] Dry run   [x] Since last sync          │
│ │   Map    [ ____________ ] type→Type ·        │
│ │                            tags→Categories…  │  ← DB-aware hint
│ │            [ ▶ Run Export ]                  │
│ │ IMPORT                                       │
│ │   Source [ ./out/Notes ]      [ Browse… ]    │  ← server-side picker
│ │   [x] Dry run                                │
│ │   Map    [ ____________ ] type→Type · …      │
│ │            [ ▶ Run Import ]                  │
│ ───────────────────────────────────────────── │
│ Log:                                           │
│   # Notes -> ~/NotionArchive                   │
│   ✓ 2026-06-27-foo.md                          │
│   — summary — 12 notes (10 written, 2 skipped) │
└────────────────────────────────────────────────┘
```

- **Tabs** (not a radio toggle) switch the active option group; Token + Database stay shared.
- **Export tab:** Output folder, `--dry-run`, `--since`, Map.
- **Import tab:** Source (file **or** folder, via the `/browse` modal), `--dry-run`, Map.
- **Map** field is empty by default = use defaults; the **DB-aware default** (from `/schema`)
  is shown beside it as a greyed hint so the user sees what each key resolves to before typing
  any override.

## Out of scope / deferred

- **`/browse` is read-only filesystem listing**, localhost-only, single-user — it lists the
  user's own machine like a native dialog would. It never writes; the server still binds
  `127.0.0.1` only (never `0.0.0.0`).
- No auth on the local server. Acceptable for a single-user local tool.
- Multi-run history / scheduling — not in this phase.

## Acceptance criteria

1. `npm run gui` starts a server, opens the page, and serves it with **no new dependency** in
   `package.json` and **no build step**.
2. Re-opening the GUI pre-fills token (masked), database, and output folder from the prior run.
3. **Connect** lists the databases the integration can access.
4. **Run (export)** writes the archive, streams each `✓ <file>` line live via SSE, and shows
   the final summary — matching CLI output for the same config.
5. After a run, `config.json` holds the chosen settings and a later `npm run export` (CLI)
   uses them with no extra flags.
6. `config.json` stays gitignored and untracked; the token never appears in git.
7. `npm test` and `npm run typecheck` stay green (the engine and pure modules are untouched).
8. Export and Import are **tabs**; switching tabs keeps Token + Database; Output lives in the
   Export tab, Source in the Import tab.
9. **Import (`Run Import`)** runs `runImport` over the chosen Source, streaming the log the same
   way as export.
10. The Import **Source** field has a **Browse…** picker (`/browse`) that selects a file or a
    folder and fills the path.
11. Both tabs show the **DB-aware default mapping** (`/schema`) as a hint; an empty Map field
    means "use defaults".
```