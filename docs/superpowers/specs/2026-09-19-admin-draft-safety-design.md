# Admin Draft Safety Design

## Goal

Prevent authenticated administrators from viewing prototype data as CMS data, writing before live hydration succeeds, or losing unsaved drafts through auth and navigation events.

## Scope

This design implements Prompt 1/5 only. It does not change CRUD granularity or concurrency, media lifecycle, pagination, uploads, visual design, or application framework.

## Current Failure Modes

The admin starts from `buildAdminData()` prototype values. `loadAllAdminDataFromSupabase()` returns `null` when a query fails, and the HTML notification handler leaves those prototype values in place while opening the authenticated shell. Auth callbacks also trigger repeated hydration, including token refreshes, which can replace `ADMIN_DRAFT`. Hash routing and tab exit have no single guard for dirty drafts.

## Authoritative State Model

`ADMIN_UI` gains `loadState`, with exactly these values:

- `idle`: no authenticated live hydration is in progress.
- `loading`: an authenticated entry is fetching the complete CMS snapshot; editor actions are unavailable.
- `ready`: one complete live snapshot was loaded successfully. Mutations are permitted.
- `error`: live hydration failed. Editors and every mutation are unavailable; a retry action is shown.

Prototype state remains available only for unauthenticated presentation bootstrapping. Once a real administrator attempts CMS entry, it is never presented as authoritative admin data. Successful hydration builds a fresh snapshot and swaps it into `ADMIN_DATA` and `ADMIN_DRAFT` atomically. Failed hydration never modifies either object.

## Hydration Contract

`loadAllAdminDataFromSupabase()` throws for unavailable Supabase or any failed query. A successful query maps collection data with `Array.isArray(data) ? data.map(...) : []`; empty data is therefore authoritative empty state. Pages and settings return empty objects on a successful empty result and the renderers tolerate absent page records/settings without reintroducing prototype values. A small pure mapping helper accepts query results and is regression-tested independently.

## Auth Event Ownership

The auth service classifies events and emits a structured notification. `INITIAL_SESSION` or the first `SIGNED_IN` for an authenticated user requests one hydration. `login()` updates local authentication only and relies on this single notification path, so it cannot double-hydrate. `TOKEN_REFRESHED` updates the session/user only; it never requests a CMS reload. `USER_UPDATED` similarly preserves the current draft. `SIGNED_OUT` clears authenticated admin UI state and hides the real shell. An in-flight/complete hydration marker prevents duplicate initial loads. Automatic hydration does not replace a dirty draft.

## Mutation and Navigation Guards

All save, delete, media upload/delete/pick mutations, and direct persistence calls require `ADMIN_UI.loadState === 'ready'`; otherwise they fail before calling Supabase and show an actionable status message. The authenticated error/loading view disables or omits save controls and provides a retry action.

One dirty-draft guard mediates admin sidebar changes, record/subtab changes, programmatic navigation, hash changes, browser back/forward, sign-out, and leaving `/admin`. When a route has already changed through browser history, the guard restores the current route until the user chooses Discard; accepting then replays the pending route. `beforeunload` sets `event.returnValue` when an admin draft is dirty. Existing SPA/hash behavior remains intact for routes with no draft.

## Test Strategy

New tests cover failed hydration with no writable state, empty authoritative collections (portfolio, assets, categories, forms, navigation, requests, and media), auth event policy/deduplicated initial hydration, dirty draft preservation on token refresh, and the pure navigation/beforeunload guard behavior. Existing full unit, foundation, and router checks remain mandatory.

## Non-Goals and Remaining Boundaries

This batch deliberately does not implement per-record CRUD, optimistic concurrency, storage changes, pagination, media-manager UX, or a framework migration. The current full-collection persistence mechanism remains until Prompt 2/5, but it is blocked unless successful live hydration completed.
