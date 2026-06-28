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

| Method · Path | Body | Returns | Purpose |
|---|---|---|---|
| `GET /` | — | `text/html` | The single embedded `index.html` (no separate file, no build). |
| `GET /config` | — | JSON (token masked) | Current `config.json` to pre-fill the form. Token returned **masked** (e.g. `secret_…last4`); the page never needs the raw token to display. |
| `POST /databases` | `{ token }` | `[{ id, name }]` | List databases the integration can see, for the picker. Uses `notion.ts` (the single throttle queue) — no second `Client`. |
| `POST /run` | `{ token, databaseIds, outBase, props?, mode, dryRun, since } / import fields` | `{ ok }` then SSE | Persist settings to `config.json`, then run the chosen direction. |
| `GET /log` (SSE) | — | `text/event-stream` | Live engine log lines; the `log` callback writes `data: <line>\n\n`. A terminal `event: done` carries the run summary. |

### Run flow

1. `npm run gui` → server starts → opens `http://localhost:4517`.
2. Page loads `GET /config` → fields pre-filled from last run (token shown masked).
3. User adjusts; **Connect** calls `POST /databases` to populate the database dropdown.
4. **Run** → `POST /run`:
   a. Validate (token + at least one database).
   b. Write `config.json` (persist for next launch and for the CLI).
   c. Open the SSE channel; call `runExport` / `runImport` with a `log` that fans out to SSE.
   d. On finish, emit `event: done` with the `RunSummary`.

## Page layout (single page)

```
┌─ notion-md-archive ───────────────────────────┐
│ Token    [•••• prefilled]      [ Connect ]     │
│ Database ▼ [ last selected ]                   │
│ Output   [ ~/NotionArchive (last) ]            │
│ ───────────────────────────────────────────── │
│ (•) Export   ( ) Import                        │
│ [x] Dry run   [x] Since last sync              │
│              [ ▶ Run ]                          │
│ ───────────────────────────────────────────── │
│ Log:                                           │
│   # My Notes DB -> ~/NotionArchive             │
│   ✓ 2026-06-27-foo.md                          │
│   — summary — 12 notes (10 written, 2 skipped) │
└────────────────────────────────────────────────┘
```

- **Export mode:** flags `--dry-run`, `--since`.
- **Import mode:** swaps to file/dir source + target `--db` + optional `--map`; `--dry-run` shown.
- Mode toggle shows/hides the relevant option group; everything else is shared.

## Out of scope / deferred

- Folder picker is a plain text field (no native file dialog) — browsers cannot open a real
  directory picker from a local page without extra machinery. Type/paste the path.
- No auth on the local server (binds to `localhost` only). Acceptable for a single-user local
  tool; do not bind to `0.0.0.0`.
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
```