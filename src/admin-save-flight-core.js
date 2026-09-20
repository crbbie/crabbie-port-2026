/**
 * One owner for the full asynchronous Admin save lifecycle.  Duplicate user
 * actions are ignored; destructive draft replacement is allowed only once the
 * active transaction settles.
 */
export function createAdminSaveSingleFlight() {
  let active = false;

  return {
    get active() {
      return active;
    },
    canReplaceDraft() {
      return !active;
    },
    async run(transaction) {
      if (active) return { started: false };
      active = true;
      try {
        return { started: true, value: await transaction() };
      } finally {
        active = false;
      }
    }
  };
}