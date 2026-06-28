import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { spawn } from "node:child_process";
import { peekConfig } from "./config.js";
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

async function handle(req: IncomingMessage, res: ServerResponse, deps: Required<ServerDeps>): Promise<void> {
  const url = (req.url ?? "/").split("?")[0]!;

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
  };
  return createHttpServer((req, res) => {
    handle(req, res, resolved).catch((err) => {
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
