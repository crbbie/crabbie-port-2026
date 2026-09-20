# Admin Draft Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live admin hydration authoritative and prevent unsaved draft loss or writes before safe hydration.

**Architecture:** Add pure helpers for hydration results, auth-event decisions, and dirty-navigation decisions. Keep the existing Vanilla HTML UI, consume helpers through one load-state gate and one route guard, and preserve the Supabase adapter as the database boundary.

**Tech Stack:** Vanilla browser JavaScript, ES modules, Supabase JS, Node `assert`, Playwright router smoke test.

**Spec:** `docs/superpowers/specs/2026-09-19-admin-draft-safety-design.md`

## Global Constraints

- Implement Prompt 1/5 only; no Batch 2–5 work.
- Preserve the current visual design, layout, animation, and unrelated behavior.
- Prototype `buildAdminData()` values are never authenticated CMS data.
- A mutation may reach Supabase only while `ADMIN_UI.loadState === 'ready'`.
- Write every regression test first and observe it fail before production code.

## Review Focus

- Successful `null` response data behaves as an empty collection.
- One failed query leaves `ADMIN_DATA` and `ADMIN_DRAFT` untouched.
- Initial session plus `SIGNED_IN` produces one hydration.
- Cancelled browser back/forward restores the current hash without a loop.
- Absent pages/settings do not dereference prototype values.

---

### Task 1: Authoritative hydration mapper

**Files:**

- Create: `src/admin-hydration-core.js`
- Create: `src/admin-hydration-core.test.mjs`
- Modify: `src/admin-crud.js`
- Modify: `package.json`

**Interfaces:**

- Produces `mapAdminHydrationResults(results, getPublicUrl)`, which throws for any Supabase error and returns every collection key with empty arrays/objects for successful empty responses.

- [ ] **Step 1: Write the failing mapper test.** Assert that all ten empty query results produce `portfolio`, `assets`, both category lists, `commissions`, `forms`, `navigation`, `requests`, and `media` as `[]`, and `pages`/`settings` as `{}`. Assert a portfolio query error throws `/Portfolio load failed/`.
- [ ] **Step 2: Run `node src/admin-hydration-core.test.mjs`; verify it fails because the mapper is absent.**
- [ ] **Step 3: Implement the pure mapper with `Array.isArray(response.data) ? response.data.map(...) : []`, preserving existing row mappings.** Map categories from an empty shared category list into two empty lists and map empty pages/settings into empty objects.
- [ ] **Step 4: Make `loadAllAdminDataFromSupabase()` throw on unavailable Supabase and query errors, collect its ten responses by key, and delegate to the mapper. Remove its `null`-returning catch.**
- [ ] **Step 5: Add the test to `npm test`; run `node src/admin-hydration-core.test.mjs && npm test` and verify green.**
- [ ] **Step 6: Commit `src/admin-hydration-core.js`, its test, `src/admin-crud.js`, and `package.json` with `fix: make admin hydration authoritative`.**

### Task 2: Auth event ownership

**Files:**

- Create: `src/admin-auth-events-core.js`
- Create: `src/admin-auth-events-core.test.mjs`
- Modify: `src/admin-auth.js`
- Modify: `crabbie-port26.html`
- Modify: `package.json`

**Interfaces:**

- Produces `decideAdminAuthEvent({ event, hasAdminUser, hasHydrated, hydrationInFlight, dirty })` with `{ clearAdmin, hydrate, updateUserOnly }`.
- Changes browser callback to `window.CrabbieAdminAuth.notify({ event, adminUser, hydrate })`.

- [ ] **Step 1: Write failing policy tests.** Verify `TOKEN_REFRESHED` and dirty `USER_UPDATED` never hydrate; `SIGNED_OUT` clears; first authenticated `INITIAL_SESSION` hydrates; a later `SIGNED_IN` after hydration does not.
- [ ] **Step 2: Run `node src/admin-auth-events-core.test.mjs`; verify it fails because the policy module is absent.**
- [ ] **Step 3: Implement the policy and use it in `admin-auth.js`.** Remove login's direct UI notification and the duplicate post-boot notification. Use an in-flight/completed marker so initial session plus sign-in does one load.
- [ ] **Step 4: Update the HTML notification owner.** It sets `loading`, awaits one loader call, swaps fresh `ADMIN_DATA`/`ADMIN_DRAFT` atomically only on success, then sets `ready`. Failure leaves both objects unchanged, sets `error`, hides editor controls, and exposes Retry. Signed-out state hides the real shell and sets `idle`; any automatic event preserves dirty drafts.
- [ ] **Step 5: Add the test to `npm test`; run `node src/admin-auth-events-core.test.mjs && npm test` and verify green.**
- [ ] **Step 6: Commit relevant source/tests with `fix: preserve admin drafts across auth events`.**

### Task 3: Mutation barrier and dirty navigation

**Files:**

- Create: `src/admin-draft-guard-core.js`
- Create: `src/admin-draft-guard-core.test.mjs`
- Modify: `crabbie-port26.html`
- Modify: `scripts/router-smoke.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces `canMutateAdmin(loadState)`, `shouldBlockAdminExit({ dirty, fromAdmin, toAdmin })`, and `shouldSetBeforeUnload({ dirty, inAdmin })`.
- HTML supplies one `requireAdminReady()` and one `guardAdminNavigation(targetRoute, continueNavigation)`.

- [ ] **Step 1: Write failing core tests.** Assert only `ready` may mutate; a dirty route leaving admin is blocked; a clean route is not; a dirty active admin sets a beforeunload warning.
- [ ] **Step 2: Run `node src/admin-draft-guard-core.test.mjs`; verify it fails because the guard module is absent.**
- [ ] **Step 3: Add `loadState: 'idle'` and gate every admin mutation before it reaches Supabase.** Cover `doSaveCommit`, record deletion, media upload/delete/pick, and direct action handlers. Normal modules render only in `ready`; loading/error shell disables or omits save controls.
- [ ] **Step 4: Route sidebar, record/subtab selection, `navigate`, hash/back/forward, sign-out, and leaving `/admin` through one dirty guard.** Restore the old hash before showing the existing discard dialog for history changes; replay exactly once after discard. Add `beforeunload` with non-empty `returnValue` only for dirty admin state.
- [ ] **Step 5: Extend the router fixture.** Assert forced loader error hides save/no writes; all-empty fixture removes prototype records; token refresh preserves an edited draft; cancelled sidebar/hash transitions preserve route and draft; a synthetic beforeunload event is prevented.
- [ ] **Step 6: Add the test to `npm test`; run `node src/admin-draft-guard-core.test.mjs && npm test && npm run check:foundation && npm run test:router`.**
- [ ] **Step 7: Commit relevant source/tests with `fix: guard admin drafts and unsafe writes`.**

### Task 4: Final safety review

**Files:**

- Modify: only review corrections required by the tests.

- [ ] **Step 1: Inspect `git diff main...HEAD` for scope.** Confirm failed hydration propagates, no code merges fallback state, all mutation paths have ready checks, and Batch 2–5 behavior is untouched.
- [ ] **Step 2: Run `npm test && npm run check:foundation && npm run test:router`.** Preserve exact pass output for the report.
- [ ] **Step 3: Commit any review-only fix with `test: verify admin draft safety`.**
