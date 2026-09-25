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

Route scroll and focus ownership: `navigate()` applies the destination route
synchronously in the same event tick before the asynchronous `hashchange`
event fires (the hash listener treats the subsequent event as an echo and
dedupes it), `instantScrollTo` is the only route-scroll primitive, and scroll
outcome is governed by the unified pure contract (`CrabbieRouteScroll.decideScroll`,
shared between runtime and `src/route-scroll-core.js`):
- `keep`: if `opts.noScroll` is true or `isSame` is true (same-route refresh), the
  current scroll position is preserved without jumping to top.
- `restore`: if `!opts.forceScroll` and `typeof restore === 'number'`, scroll position
  is restored for both explicit detail returns (`project-detail` → `portfolio`,
  `free-asset-detail` → `free-assets`) and browser Back/Forward between ordinary views
  (flagged with `restoredFlag`). Outgoing scroll positions are captured in `popstate`
  (avoiding WebKit scroll-mutation timing issues before `hashchange`).
- `top`: fresh navigations, direct loads without memory, or navigations with
  `opts.forceScroll === true` deterministically scroll to top (0).
Detail refresh re-renders in place without routing, and admin dirty-navigation
guards plus URL/deep-link behavior are unchanged.

## Module boundaries

### Public CMS adapters

Examples:

- `src/portfolio-cms.js`
- `src/people-cms.js`
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
- `src/site-motion.js` (music, falling candy, desktop pet runtime; exposes `window.CrabbieSiteMotion`)

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
- request validation;
- desktop pet/dialogue rules (`src/desktop-pet-core.js`);
- portfolio grid variant planning and deterministic composition (`src/portfolio-grid-core.js`).

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

## Portfolio grid composition and navigation motion

Portfolio grid presentation is deterministic and presentation-only:
- Desktop (>1180px) repeats complete bands `[large,tall], [small,small,small], [wide,wide]` (`pf-l, pf-t, pf-s, pf-s, pf-s, pf-w, pf-w`), with incomplete tails falling back to compact smalls (`pf-s`).
- Compact widths (<=1180px) and tablet/phone columns strictly use `pf-s` (and single-column at <=720px), avoiding legacy multi-row spans.
- The plan is derived purely from visible ordered DOM cards via `planPortfolioVariants()` (`src/portfolio-grid-core.js`, mirrored inline in the SPA) during hydration, reorder, removal/reintroduction, filter, search, reset, and debounced window resize.
- Artwork readiness (`is-art-ready`) dynamically reconciles image availability, errors, and natural dimensions, releasing the 180px minimum fallback height on load without distortion.
- Jelly squash/stretch feedback (`.is-jelly`) and sparkle particle bursts are strictly excluded from navigation controls (`isNavigatingControl`: `[data-goto]`, `[data-project]`, `[data-asset]`, `.work`, `.item`, `#pdPrev`, `#pdNext`, `.back-link`, `[data-admin-jump]`, `[data-admin-module]`); navigation executes immediately and synchronously without animation delays.
- Navigation to `project-detail` and `free-asset-detail` is visually stationary on initial activation (suppressing `animViewIn`, `animFadeUp`, and `animEyebrowPop`, keeping stationary `-2deg` rotation on eyebrow). Returning to list view applies `body.is-restoring` during scroll restoration and leaves `.view.is-restored-activation` on the list view for its entire active lifetime, suppressing `animViewIn` and `animFadeScale` permanently for that activation.

## Asset preview gallery data flow

Ordered additional Free Asset previews travel the same pipeline without a
second viewer or a competing state model:

```text
free_assets.metadata.gallery (+ coverAlt)
  → src/asset-gallery-core.js (normalize/validate/reorder/replace)
  → mapFreeAsset / mapAssetRow / createAssetDraft / formatAssetRow
  → ASSETS runtime records + admin draft
  → asset detail gallery (cover first, 12-per-batch thumbs) + admin editor
  → shared public viewer collection (cover at index 0)
```

The shared viewer (`#publicLightbox`) exposes one narrow collection/index API
(`openViewerCollection`); Portfolio cover and asset adapters stay separate,
content blocks are never auto-collected into slideshows, and the admin media
preview stays independent. Viewer history owns at most one namespaced
same-URL entry per opening: Back dismisses first, Close/Escape consume only
the owned entry, image steps push nothing, and route departure tears down
without restoring obsolete scroll.

## Portfolio grid presentation

`src/portfolio-grid-core.js` owns the pure, presentation-only desktop band
pattern (`[large,tall]`, `[small,small,small]`, `[wide,wide]`) and the compact
fallback (paired smalls). The SPA cannot import ES modules at parse time, so it
mirrors the same pattern inline and recomputes variants for the visible ordered
collection on hydration, reorder, filtering/search and breakpoint resize through
one shared assignment path (`syncPortfolioComposition`). Composition is never
dense auto-placement and never reorders cards. Image-only card geometry and the
shared viewer's remaining-space media stage are CSS/DOM concerns owned by the SPA
shell, not by a second state model.

## People / Clients data flow

Reusable identities live in `people`; project credits are ordered rows in
`portfolio_project_people` (no copied name/avatar/URL). The per-project
credit prefix lives in `portfolio_projects.content.peopleCreditLabel`
(`content.credits` stays the generic production-notes field).

```text
people + portfolio_project_people (published only, paged to completion)
  → src/people-cms.js (window.CrabbiePeople bridge) + portfolio junction attach
  → project credit strip (after #pdDesc) + image-lightbox credits + client thank-you section (Commissions, after Fees & add-ons)
```

- Public adapters filter `published` even when an admin is signed in.
- A failed/partial People fetch hides People presentation; artwork and the
  Portfolio grid keep working.
- Stale-response races are guarded with a generation token; public updates
  happen on hydration/explicit CMS refresh (no Realtime, no polling).

Project relation writes go through the narrow `save_project_with_people`
RPC (project row + ordered junction replacement in one transaction, UUID
identity, `updated_at` baseline, unknown IDs rejected, empty selection
clears). People global reorder uses the transactional `move_person` RPC
(adjacent swap, baseline/neighbor validated, ranks normalized).

The Admin People panel pages server-side (30/page, `sort_order,id` order)
and merges fetched rows without overwriting dirty drafts; a failed panel
fetch never becomes an authoritative empty collection.

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

## Static assets

Bundled static assets live under `assets/` and are grouped by kind so the folder
stays manageable as more decorative art is added:

```text
assets/
  fonts/
  decorations/
    candy/
    pet/
  images/
  audio/      (bundled static audio only; uploaded audio lives in Supabase Storage)
```

Reference these with absolute paths (for example
`/assets/decorations/candy/candy1.svg`). Runtime uploads are never written here.

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
