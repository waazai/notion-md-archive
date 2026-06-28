import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { spawn } from "node:child_process";
import { peekConfig, writeConfigJson } from "./config.js";
import { Notion } from "./notion.js";
import { runExport, type RunSummary, type Logger } from "./engine.js";
import { runImport, type ImportResult } from "./import/engine.js";
import type { ImportOptions } from "./import/options.js";
import type { AppConfig } from "./config.js";
import type { PropNames } from "./frontmatter.js";

/** Raw persisted settings the GUI reads (token unmasked, internal only). */
export interface RawConfig {
  token: string;
  databaseIds: string[];
  outBase: string;
  props?: PropNames;
}

/** Injectable backend dependencies. Defaults wire to the real implementations;
 *  tests pass fakes so the server is exercised offline without a Notion token. */
export interface ServerDeps {
  readConfig?: () => RawConfig;
  listDatabases?: (token: string) => Promise<{ id: string; name: string }[]>;
  writeConfig?: (cfg: RawConfig) => void;
  run?: (config: AppConfig, log: Logger, opts: { dryRun?: boolean; since?: boolean }) => Promise<RunSummary>;
  runImport?: (config: AppConfig, opts: ImportOptions, log: Logger) => Promise<ImportResult[]>;
}

/** Source path -> import options. A directory becomes `--dir`, a file `--file`;
 *  resolved by stat when the path exists, else by the `.md` extension. */
function buildImportOpts(source: string, dryRun: boolean, map: Record<string, string>): ImportOptions {
  let isDir = !source.toLowerCase().endsWith(".md");
  try {
    isDir = statSync(source).isDirectory();
  } catch {
    // path not present (e.g. under test) — keep the extension heuristic
  }
  return { ...(isDir ? { dir: source } : { file: source }), map, dryRun };
}

/** Collapse import results into a summary for the SSE `done` event. */
function summarizeImport(results: ImportResult[]): { import: { files: number; created: number; updated: number; failed: number } } {
  const created = results.filter((r) => r.action === "created" || r.action === "would-create").length;
  const updated = results.filter((r) => r.action === "updated" || r.action === "would-update").length;
  const failed = results.filter((r) => r.action === "failed").length;
  return { import: { files: results.length, created, updated, failed } };
}

/** Mask a token for display: keep a 4-char tail hint, hide the rest. */
export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 4) return "•".repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

// Backend shell for the local GUI (Phase 5, task T1).
// It is a thin peer of the CLI: it only serves the static frontend and (later
// tasks) bridges the engine to the page over JSON + SSE. No business logic
// lives here — see build_doc/SPEC-gui.md.

const GUI_DIR = join(dirname(fileURLToPath(import.meta.url)), "gui");
const DEFAULT_PORT = 4517;

// Whitelisted static routes. The frontend is plain files under src/gui/ — to
// restyle, edit src/gui/styles.css only; this server never needs to change.
const ROUTES: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/** Fan-out of engine log lines to all connected SSE clients. */
interface SseHub {
  add(res: ServerResponse): void;
  broadcastLine(line: string): void;
  broadcastEvent(event: string, data: unknown): void;
}

function createSseHub(): SseHub {
  const clients = new Set<ServerResponse>();
  return {
    add(res) {
      clients.add(res);
      res.on("close", () => clients.delete(res));
    },
    broadcastLine(line) {
      // A `\n` inside one log line becomes multiple SSE `data:` lines.
      const payload = "data: " + line.split("\n").join("\ndata: ") + "\n\n";
      for (const c of clients) c.write(payload);
    },
    broadcastEvent(event, data) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const c of clients) c.write(payload);
    },
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: Required<ServerDeps>, hub: SseHub): Promise<void> {
  const url = (req.url ?? "/").split("?")[0]!;

  // GET /log — Server-Sent Events: engine log lines stream here while a run is
  // active, ending with `event: done` (summary) or `event: error`.
  if (req.method === "GET" && url === "/log") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    hub.add(res);
    return; // stays open
  }

  // POST /run — validate, persist config.json, then run; the log streams to /log.
  if (req.method === "POST" && url === "/run") {
    const body = await readJsonBody(req);
    const saved = deps.readConfig();
    const token = body.token || saved.token;
    const databaseIds: string[] = body.databaseIds?.length ? body.databaseIds : saved.databaseIds;
    const outBase = body.outBase || saved.outBase;
    const props = body.props ?? saved.props;
    if (!token || !databaseIds?.length) {
      sendJson(res, 400, { error: "Token and at least one database are required." });
      return;
    }
    const mode = body.mode === "import" ? "import" : "export";
    if (mode === "import" && !body.source) {
      sendJson(res, 400, { error: "A source file or folder is required for import." });
      return;
    }
    const config: AppConfig = { token, databaseIds, outBase, props };
    deps.writeConfig({ token, databaseIds, outBase, props });
    sendJson(res, 202, { ok: true }); // ack; the run streams asynchronously
    const log: Logger = (line) => hub.broadcastLine(line);
    const job =
      mode === "import"
        ? deps
            .runImport(config, buildImportOpts(body.source, !!body.dryRun, (props as Record<string, string>) ?? {}), log)
            .then(summarizeImport)
        : deps.run(config, log, { dryRun: !!body.dryRun, since: !!body.since });
    job
      .then((summary) => hub.broadcastEvent("done", summary))
      .catch((err) => hub.broadcastEvent("error", { message: (err as Error).message }));
    return;
  }

  // GET /config — persisted settings to pre-fill the form (token masked).
  if (req.method === "GET" && url === "/config") {
    const cfg = deps.readConfig();
    sendJson(res, 200, {
      tokenSet: !!cfg.token,
      tokenHint: maskToken(cfg.token),
      databaseIds: cfg.databaseIds,
      outBase: cfg.outBase,
      props: cfg.props,
    });
    return;
  }

  // POST /databases {token} — list the databases the integration can see.
  // A blank token reuses the saved one (the page only ever holds a masked hint).
  if (req.method === "POST" && url === "/databases") {
    const body = await readJsonBody(req);
    const token = body.token || deps.readConfig().token;
    if (!token) {
      sendJson(res, 400, { error: "Token is required." });
      return;
    }
    try {
      const databases = await deps.listDatabases(token);
      sendJson(res, 200, { databases });
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
    return;
  }

  const file = ROUTES[url];
  if (req.method === "GET" && file) {
    try {
      // Read fresh each request — no caching — so a styles.css edit shows on
      // reload without restarting the server (supports the restyle workflow).
      const body = await readFile(join(GUI_DIR, file));
      res.writeHead(200, { "content-type": contentTypeFor(file) });
      res.end(body);
      return;
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Failed to read " + file);
      return;
    }
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

/** Build the HTTP server without binding a port (testable).
 *  `deps` defaults to the real implementations; tests inject fakes. */
export function createServer(deps: ServerDeps = {}): Server {
  const resolved: Required<ServerDeps> = {
    readConfig: deps.readConfig ?? peekConfig,
    // A fresh short-lived client per interactive call — not concurrent with an
    // export/import run, so it doesn't violate the single-throttle-queue rule.
    listDatabases: deps.listDatabases ?? ((token: string) => new Notion(token).listDatabases()),
    writeConfig: deps.writeConfig ?? writeConfigJson,
    run: deps.run ?? runExport,
    runImport: deps.runImport ?? runImport,
  };
  const hub = createSseHub();
  return createHttpServer((req, res) => {
    handle(req, res, resolved, hub).catch((err) => {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(err));
    });
  });
}

/** Start listening and best-effort open the browser. */
export function start(port = Number(process.env.GUI_PORT) || DEFAULT_PORT): Server {
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.log(`notion-md-archive GUI → ${url}`);
    openBrowser(url);
  });
  return server;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    // Missing opener (e.g. no xdg-open in a container) surfaces as an async
    // 'error' event, not a throw — swallow it so the server stays up.
    child.on("error", () => {});
    child.unref();
  } catch {
    // Headless / no browser — the URL is printed above.
  }
}

// `npm run gui` → tsx src/server.ts runs this module directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start();
}
