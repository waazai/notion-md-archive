import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PropNames } from "./frontmatter.js";

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

const CONFIG_JSON = resolve(process.cwd(), "config.json");
const ENV_FILE = resolve(process.cwd(), ".env");

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
