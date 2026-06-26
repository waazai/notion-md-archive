// CLI option parsing for the `import` subcommand. Pure & synchronous so it is
// unit-testable with no process/argv coupling.
//
// Routing/source (file, dir, db, map) come from flags; the Notion *token* is
// deliberately NOT accepted here — it resolves via loadConfig (config.json / env)
// so it never lands in shell history or `ps` output.

export interface ImportOptions {
  /** Single Markdown file to import (mutually exclusive with `dir`). */
  file?: string;
  /** Folder of `*.md` files to import (mutually exclusive with `file`). */
  dir?: string;
  /** Target database id; falls back to config / env when omitted. */
  db?: string;
  /** YAML-key → Notion-property-name overrides (e.g. { title: "Name" }). */
  map: Record<string, string>;
  /** Resolve + report only; no writes/creates/uploads. */
  dryRun: boolean;
}

/** Parse the args that follow the `import` subcommand into ImportOptions. */
export function parseImportArgs(argv: string[]): ImportOptions {
  const opts: ImportOptions = { map: {}, dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--file":
        opts.file = takeValue(argv, ++i, arg);
        break;
      case "--dir":
        opts.dir = takeValue(argv, ++i, arg);
        break;
      case "--db":
        opts.db = takeValue(argv, ++i, arg);
        break;
      case "--map":
        Object.assign(opts.map, parseMap(takeValue(argv, ++i, arg)));
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        throw new Error(`Unknown import flag: ${arg}`);
    }
  }

  if (opts.file && opts.dir) {
    throw new Error("Specify --file or --dir, not both.");
  }
  if (!opts.file && !opts.dir) {
    throw new Error("Specify a source: --file <path> or --dir <path>.");
  }

  return opts;
}

/** Read the value following a value-flag, erroring if it's missing. */
function takeValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return v;
}

/** "k=Prop,k2=Prop2" → { k: "Prop", k2: "Prop2" }. */
function parseMap(spec: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of spec.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Bad --map entry "${pair}" (expected key=Property).`);
    }
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}
