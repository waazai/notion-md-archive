// Incremental (`--since`) decision: re-export a note only when it changed in
// Notion since we last archived it. Pure & testable.
//
// ⚠️ Write-back self-edit (see DEVELOPMENT NOTES in CLAUDE.md): setting
// `Last synced = now` is itself a `pages.update`, which Notion records as an edit
// and bumps `last_edited_time` to a moment slightly AFTER our `now` value. A naive
// `lastEdited > lastSynced` is therefore ALWAYS true → `--since` would re-export
// everything every run. We absorb the self-edit with a tolerance, mirroring the
// Notion `Sync` formula's `dateBetween(..., "minutes") <= 1`.

/** Tolerance (ms) for the write-back self-edit. Matches the Notion Sync formula's
 *  1-minute window. A note counts as "changed" only if edited MORE than this after
 *  the last sync. */
export const SYNC_TOLERANCE_MS = 60_000;

export interface SyncTimes {
  lastEdited: string; // ISO
  lastSynced: string | null; // ISO or null = never synced
}

export function shouldExport(
  t: SyncTimes,
  since: boolean,
  toleranceMs: number = SYNC_TOLERANCE_MS
): boolean {
  if (!since) return true;
  if (!t.lastSynced) return true;
  const drift = new Date(t.lastEdited).getTime() - new Date(t.lastSynced).getTime();
  return drift > toleranceMs;
}
