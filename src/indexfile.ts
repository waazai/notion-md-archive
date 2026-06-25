// Build INDEX.md: a GFM table of every note in the database plus an Orphans
// section (files on disk the latest export did not produce — likely renamed or
// deleted in Notion). Pure: takes data, returns the markdown string.

export interface IndexRow {
  filename: string;
  title: string;
  created: string;
  tags: string[];
  lastSynced: string | null;
}

export function buildIndexMarkdown(
  dbName: string,
  rows: IndexRow[],
  orphans: string[],
  generatedAt = new Date()
): string {
  const sorted = [...rows].sort((a, b) => (a.filename < b.filename ? 1 : -1)); // newest first
  const date = generatedAt.toISOString().slice(0, 10);

  const lines: string[] = [
    `# ${dbName} — archive index`,
    "",
    `_${rows.length} notes · generated ${date}_`,
    "",
    "| File | Title | Created | Tags | Last synced |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const r of sorted) {
    lines.push(
      `| [${r.filename}](${encodeURI(r.filename)}) | ${esc(r.title)} | ${r.created} | ${esc(
        r.tags.join(", ")
      )} | ${r.lastSynced ? r.lastSynced.slice(0, 16) : "—"} |`
    );
  }

  if (orphans.length) {
    lines.push(
      "",
      "## Orphans",
      "_On disk but not in the latest export — renamed or deleted in Notion. Remove manually._",
      ""
    );
    for (const o of [...orphans].sort()) {
      lines.push(`- [${o}](${encodeURI(o)})`);
    }
  }

  return lines.join("\n") + "\n";
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
