// Incremental (`--since`) decision: re-export a note only when it changed in
// Notion since we last archived it. Pure & testable.
//
// Note: the write-back (setting Last synced = now) is itself an edit that bumps
// `last_edited_time`. Because we set Last synced AFTER exporting, on the next run
// last_edited (the export-time value) <= last_synced (now) -> skipped. The Notion
// `Sync` formula absorbs the self-edit with its minute tolerance.

export interface SyncTimes {
  lastEdited: string; // ISO
  lastSynced: string | null; // ISO or null = never synced
}

export function shouldExport(t: SyncTimes, since: boolean): boolean {
  if (!since) return true;
  if (!t.lastSynced) return true;
  return new Date(t.lastEdited).getTime() > new Date(t.lastSynced).getTime();
}
