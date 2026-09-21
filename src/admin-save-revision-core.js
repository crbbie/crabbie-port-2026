/**
 * admin-save-revision-core.js
 * Revision tokens so an edit that lands after a save begins is never silently
 * marked as saved. Every draft mutation bumps the revision; a save captures
 * the revision at start and may only clear dirty state / advance the saved
 * baseline when the revision is unchanged at completion. A failed save never
 * finalizes. No DOM, no Supabase access.
 */

export function createDraftRevision() {
  let revision = 0;
  return {
    get current() {
      return revision;
    },
    bump() {
      revision += 1;
      return revision;
    }
  };
}

/**
 * Only an untouched-since-save-start draft may be marked clean. Any newer
 * revision means version N+1 edits are still unpersisted even though the
 * version N write succeeded.
 */
export function shouldFinalizeSave(startRevision, currentRevision) {
  return startRevision === currentRevision;
}
