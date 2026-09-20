import { canMutateAdmin, shouldBlockAdminExit, shouldSetBeforeUnload } from './admin-draft-guard-core.js';

// Thin browser bridge: the safety rules stay pure and unit tested, the inline
// admin script only consumes them.
if (typeof window !== 'undefined') {
  window.CrabbieAdminDraftGuard = { canMutateAdmin, shouldBlockAdminExit, shouldSetBeforeUnload };
}
