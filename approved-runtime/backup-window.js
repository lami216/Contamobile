/** Local snapshot scheduling only; never a clock or authority for a license. */
export const BACKUP_WINDOWS = Object.freeze([1500, 15000, 60000, 300000]);
export function snapshotWindowMs(settings) {
  const value = Number(settings?.snapshotWindowMs ?? 1500);
  return BACKUP_WINDOWS.includes(value) ? value : 1500;
}
export function pendingRevisionCount(revision, backedUpRevision) {
  if(revision === null || revision === undefined) return null;
  const current = Number(revision), saved = Number(backedUpRevision ?? 0);
  return Number.isSafeInteger(current) && current >= 0 && Number.isSafeInteger(saved) && saved >= 0
    ? Math.max(0, current - saved) : null;
}
export function snapshotDelay(firstDirtyAt, now, settings) {
  return Math.max(0, firstDirtyAt + snapshotWindowMs(settings) - now);
}
