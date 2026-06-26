import { loadConfig } from "./config.js";
import { runExport } from "./engine.js";
import { importMain } from "./import/cli.js";

// CLI: `npm run export [-- --dry-run]` / `npm run import -- --file … --db …`
async function main() {
  const args = process.argv.slice(2);

  // Subcommand dispatch: `import` routes to the import module; default = export.
  if (args[0] === "import") {
    await importMain(args.slice(1));
    return;
  }

  const dryRun = args.includes("--dry-run");
  const since = args.includes("--since");

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error("Config error:", (err as Error).message);
    console.error("Set NOTION_TOKEN + NOTES_DB_ID in .env, or run the GUI (npm run gui).");
    process.exit(1);
    return;
  }

  const summary = await runExport(config, console.log, { dryRun, since });

  console.log("\n— summary —");
  for (const d of summary.databases) {
    console.log(
      `  ${d.name}: ${d.notes} notes (${d.written} written, ${d.skipped} skipped), ` +
        `${d.attachments} attachments, ${d.orphans} orphans`
    );
  }
  if (dryRun) console.log("(dry run — nothing written)");
}

main().catch((err) => {
  console.error("\nExport failed:", err);
  process.exit(1);
});
