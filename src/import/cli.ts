import { loadConfig } from "../config.js";
import { parseImportArgs } from "./options.js";

// Thin CLI shell for the `import` subcommand. Resolves options + config, then
// hands off to the engine. (runImport is wired in task A.6; until then this
// validates input and reports what would run.)
export async function importMain(argv: string[]): Promise<void> {
  let opts;
  try {
    opts = parseImportArgs(argv);
  } catch (err) {
    console.error("Argument error:", (err as Error).message);
    console.error("Usage: npm run import -- --file <note.md> | --dir <folder> [--db <id>] [--map k=Prop,…] [--dry-run]");
    process.exit(1);
    return;
  }

  let config;
  try {
    config = loadConfig({ databaseIds: opts.db ? [opts.db] : undefined });
  } catch (err) {
    console.error("Config error:", (err as Error).message);
    console.error("Set NOTION_TOKEN (+ a target db via --db / NOTES_DB_ID / config.json).");
    process.exit(1);
    return;
  }

  // Token is resolved but never printed.
  const source = opts.file ?? opts.dir;
  console.log(
    `import: ${source} → db ${config.databaseIds[0]}` + (opts.dryRun ? " (dry-run)" : "")
  );
  // TODO(A.6): const summary = await runImport(config, opts, console.log);
  console.log("(import engine not yet wired — task A.6)");
}
