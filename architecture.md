# architecture.md

## Stack

- Vanilla HTML/CSS/JavaScript SPA
- Browser ES modules
- Supabase JS 2.57.4
- Supabase Auth
- Supabase Postgres/Data API
- Supabase Storage
- Vercel hosting and a small Vercel API function
- Playwright for router/browser regression checks
- Node-based unit/static checks

There is no React, Next.js, Vite, Server Components, or Server Actions architecture in the current repository.

## Main entrypoint

`crabbie-port26.html` is the main application shell and contains:

- public views;
- admin shell and editor UI;
- CSS/design tokens/responsive rules;
- hash router;
- public rendering glue;
- admin rendering/wiring;
- loading, toast, modal, and transition behavior.

Vercel rewrites `/`, `/admin`, and `/admin/:path*` to this SPA file.

## Routing

Routing is hash/path-aware and implemented in the SPA.

Important route forms include:

```text
#home
#portfolio
#project/<slug>
#free-assets
#asset/<slug>
#commissions
#about
#terms
#contact
#admin/<module>
```

Unknown public routes render the 404 view. Unknown admin modules fall back to the admin dashboard.

When adding a public route, update all relevant route parsing, title handling, navigation state, rendering, and tests together.

## Module boundaries

### Public CMS adapters

Examples:

- `src/portfolio-cms.js`
- `src/free-assets-cms.js`
- `src/commissions-cms.js`
- `src/site-content-cms.js`

These query published public data and bridge it into the SPA.

### Admin browser services

Examples:

- `src/admin-auth.js`
- `src/admin-crud.js`
- `src/admin-media.js`
- `src/admin-media-upload.js`
- `src/commission-requests.js`

These own Supabase/browser-side persistence and service integration.

### Pure core modules

Files named `*-core.js` contain testable rules without DOM/network ownership. Keep new pure rules here when they extend an existing domain.

Examples include:

- admin record write planning;
- hydration mapping;
- save single-flight rules;
- draft guards;
- upload strategy/retry rules;
- media safety/deletion logic;
- form normalization;
- request validation.

## Admin state model

The SPA maintains plain-JavaScript state such as:

- `ADMIN_DATA`: last confirmed persisted snapshot;
- `ADMIN_DRAFT`: editable working copy;
- `ADMIN_UI`: editor/load/selection/dirty UI state;
- `PROJECTS`, `ASSETS`: public runtime content maps;
- `currentRoute`: current SPA route.

Do not introduce a second competing state model for the same data unless a deliberate architecture migration is part of the task.

## Admin persistence contract

This is a hard architecture invariant.

- Existing records are updated by database UUID.
- New records are inserted.
- Slug is content/URL identity, not database write identity.
- Updates use the hydrated `updated_at` baseline for optimistic concurrency.
- Zero-row guarded updates are treated as stale/conflict, not success.
- Local persisted baselines advance only after confirmed database success.
- Settings use per-key baselines.
- A single-flight owner prevents overlapping admin save transactions.
- Auth refresh/background events must not rehydrate over unsaved work.
- Mutation stays disabled until one complete authoritative hydration succeeds.
- Failed deletes must leave the local record intact.

Do not replace this with broad `upsert(..., onConflict: 'slug')` behavior.

## Public data flow example

```text
Supabase public table
  → public CMS module
  → mapping/core logic
  → SPA runtime data
  → view render
  → route/detail UI
```

## Admin save flow example

```text
Admin input
  → ADMIN_DRAFT
  → dirty target bookkeeping
  → single-flight save
  → write-plan core
  → Supabase CRUD
  → confirmed DB row
  → reconcile dbId / updated_at baseline
  → refresh public CMS when applicable
```

## API

`api/public-config.js` exposes only the public Supabase URL and publishable key to the browser. It must never expose service-role or private credentials.

Do not create server endpoints merely to mirror browser-safe public Supabase queries. Add server-side APIs when privileged credentials, secret integrations, or trusted server execution are actually required.

## External runtime dependencies

- Google Fonts
- jsDelivr ESM build of Supabase
- jsDelivr dynamic `tus-js-client` for resumable uploads

A strict Content Security Policy is not currently enabled because inline scripts/styles and runtime CDN imports would need to be migrated first.

## Known architectural debt that should not be opportunistically refactored

- Large single SPA HTML file.
- Inline CSS/JavaScript in the main document.
- Public prototype/fallback content alongside live CMS data.
- Global `window.Crabbie*` bridges.

These may be improved in a dedicated refactor with regression coverage, but do not reshape them while fixing an unrelated bug.
