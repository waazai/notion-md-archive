import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { PropNames } from "./frontmatter.js";

// Replaced with `true` by `bun build --define IS_PACKAGED=true` when compiling the
// standalone executable; undefined everywhere else (dev / CLI / tests), guarded by
// `typeof` so referencing it never throws at runtime.
declare const IS_PACKAGED: boolean | undefined;
const PACKAGED = typeof IS_PACKAGED !== "undefined" && IS_PACKAGED === true;

/** Where config.json / .env / the default out/ live. A packaged exe uses the
 *  directory of the binary (process.cwd() is unreliable for a double-clicked app
 *  — on macOS it is "/"); dev and the CLI keep cwd-relative behaviour. Pure for
 *  testing. */
export function configBaseDir(packaged: boolean, execPath: string, cwd: string): string {
  return packaged ? dirname(execPath) : cwd;
}

const BASE_DIR = configBaseDir(PACKAGED, process.execPath, process.cwd());

export interface AppConfig {
  token: string;
  databaseIds: string[];
  outBase: string;
  /** Optional override of the Notion property names the tool reads/writes.
   *  Defaults: type=Type, tags=Tags, created=Created, lastSynced="Last synced".
   *  `tags` may point at a relation, multi_select, or select property; if the
   *  name is absent the tool auto-detects the first multi_select/relation. */
  props?: PropNames;
}

const CONFIG_JSON = resolve(BASE_DIR, "config.json");
const ENV_FILE = resolve(BASE_DIR, ".env");

/** Resolution order: config.json (written by the GUI) -> env vars.
 *  A local .env file is loaded into process.env first if present. */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadDotEnv();

  const json = existsSync(CONFIG_JSON)
    ? (JSON.parse(readFileSync(CONFIG_JSON, "utf8")) as Partial<AppConfig> & { databaseId?: string })
    : {};

  const token = overrides.token ?? json.token ?? process.env.NOTION_TOKEN ?? "";
  const rawDb =
    overrides.databaseIds?.join(",") ??
    json.databaseIds?.join(",") ??
    json.databaseId ??
    process.env.NOTES_DB_ID ??
    "";
  const outBase = overrides.outBase ?? json.outBase ?? process.env.OUT_BASE ?? "./out";

  const databaseIds = rawDb
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token) throw new Error("Missing Notion token (NOTION_TOKEN / config.json / flag).");
  if (!databaseIds.length) throw new Error("Missing database id (NOTES_DB_ID / config.json / flag).");

  return { token, databaseIds, outBase, props: overrides.props ?? json.props };
}

/** Current settings without validation — for the GUI prefill (GET /config).
 *  Unlike `loadConfig` it never throws on a missing token / database id; it just
 *  returns whatever is present so the form can show it. Same precedence as
 *  `loadConfig` minus CLI overrides: config.json -> env. */
export function peekConfig(): { token: string; databaseIds: string[]; outBase: string; props?: PropNames } {
  loadDotEnv();
  const json = existsSync(CONFIG_JSON)
    ? (JSON.parse(readFileSync(CONFIG_JSON, "utf8")) as Partial<AppConfig> & { databaseId?: string })
    : {};
  const token = json.token ?? process.env.NOTION_TOKEN ?? "";
  const rawDb = json.databaseIds?.join(",") ?? json.databaseId ?? process.env.NOTES_DB_ID ?? "";
  const outBase = json.outBase ?? process.env.OUT_BASE ?? "./out";
  const databaseIds = rawDb.split(",").map((s) => s.trim()).filter(Boolean);
  return { token, databaseIds, outBase, props: json.props };
}

/** Persist GUI settings to config.json so the next launch — and the CLI — reuse
 *  them. Written pretty so a human can read/edit it. */
export function writeConfigJson(cfg: { token: string; databaseIds: string[]; outBase: string; props?: PropNames }): void {
  const out: Record<string, unknown> = {
    token: cfg.token,
    databaseIds: cfg.databaseIds,
    outBase: cfg.outBase,
  };
  if (cfg.props) out.props = cfg.props;
  writeFileSync(CONFIG_JSON, JSON.stringify(out, null, 2) + "\n");
}

function loadDotEnv(): void {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
