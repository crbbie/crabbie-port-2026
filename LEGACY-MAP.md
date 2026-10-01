# CRABBIE LEGACY MAP

Decisions only: what to preserve, reuse, or replace. No redesign implemented here.

## 1. Metadata

- audit date: 2026-10-01 (UTC)
- repository: crbbie/crabbie-port-2026
- source main SHA: 6f9dbec9fe77e5d49038f872f6dcd542e59adf7 (origin/main after inventory merge)
- baseline SHA/tag: a0f04697ac4585166977001a46ba6b4074cfad87 / pre-redesign-2026-10-01
- inventory source: SITE-INVENTORY.md (commit 6f9dbec)
- scope: every meaningful SITE-INVENTORY area; each has a decision or explicit N/A/UNKNOWN
- branch: docs/redesign-legacy-map

## 2. Decision Legend

- LOGIC `KEEP`: reuse the existing implementation/behavior contract; redesign reconnects to it.
- LOGIC `REPLACE`: concrete reason to rewrite; used sparingly, never for working app logic.
- LOGIC `N/A`: no logic dimension (pure presentation or pure motion item).
- LOGIC `UNKNOWN`: evidence insufficient; do not guess.
- VISUAL `KEEP EXACT`: reuse the actual existing implementation/styling, not an imitation.
- VISUAL `REPLACE`: redesign defines new presentation; listed `preserve` items still bind.
- VISUAL `N/A` / `UNKNOWN`: no visual dimension / insufficient evidence.
- MOTION `KEEP EXACT`: reuse actual animation implementation and parameters.
- MOTION `REPLACE`: redesign defines new motion for this item.
- MOTION `STATIC`: item must not animate (intentional stillness is part of the contract).
- MOTION `N/A` / `UNKNOWN`: no motion dimension / insufficient evidence.

## 3. Critical Preservation Rules

1. Router, history, scroll-restoration, and viewer-owned history are load-bearing
   application logic, not presentation. Reuse, do not rewrite (§15, §16).
2. All public CMS adapters, pure cores, and the refresh router stay; new markup must
   rebind to their container/selector contracts (§18).
3. Admin persistence invariants (UUID identity, `updated_at` guard, single-flight,
   revision gate, confirmed-only baselines) are non-negotiable (§14).
4. RLS posture, constrained visitor insert, and RPC-only junction writes stay;
   never edit applied migrations — new forward migration only (§18).
5. Media deletion stays recoverable multi-step; purge stays gated; audit log stays
   append-only (§18).
6. Commission success is reported only after confirmed insert; single-flight submit
   stays (§17).
7. Free-asset download truthfulness (availability + URL presence) stays (§8).
8. Reduced-motion support stays for every motion item, kept or replaced (§20, §21).
9. Absence from a future Figma is never permission to drop Admin, CMS fields, or
   data wiring (§14).

## 4. Global Shell / Navigation

### Skip link

classification: logic KEEP / visual REPLACE / motion N/A
current responsibility: keyboard bypass to `#main`.
source: `crabbie-port26.html` `a.skip-link[href="#main"]`; focus reveal CSS; `#main` focus wiring.
preserve: `skip-link` class, `href="#main"`, existing `#main` target.
replace: pill styling, position.
integration note: new shell must keep an equivalent bypass + focus target.

### Desktop navigation

classification: logic KEEP / visual REPLACE / motion N/A (nav press motion: see §20 jelly contracts)
current responsibility: route navigation, active-route indication (`NAVKEY` maps detail
views to list parents), commission CTA, burger host.
source: `crabbie-port26.html` `nav#mainNav`, `.nav-links a[data-goto]`, `a.nav-cta`,
`NAVKEY`, `applyRoute` active/`aria-current` toggling; titles via `src/site-content-core.js`
(`cmsBrandName`, `cmsSeoTitle`); labels from `cms_navigation` via `src/site-content-cms.js`.
dependencies: `parseRoute`, `navigate`, `titleFor`, site-content adapter.
preserve: `id="mainNav"`, `a[data-goto="<view>"]` values, `aria-current` handling, CTA destination.
replace: layout, pill/capsule style, typography, badge treatment.
risks: renaming `data-goto` values breaks delegation + highlighting (MEDIUM).

### Mobile menu

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: small-viewport navigation open/close with focus trap.
source: `crabbie-port26.html` `button#navBurger`, `div#mobileMenu`, `closeMenu`,
outside-click/Escape/route-change close, Tab wrap.
preserve: `#navBurger` + `aria-expanded`, `#mobileMenu` + `.open`, inner `a[data-goto]`, trap behavior.
replace: slide direction, stagger, burger morph.
risks: dropping trap/`aria-expanded` breaks keyboard users (MEDIUM).

### Footer + contact rendering

classification: logic KEEP / visual REPLACE / motion N/A
current responsibility: explore links, CMS-ordered contact/social links, fixed links,
admin entry.
source: `crabbie-port26.html` footer markup, `ul#footContactList`, `#footEmail`/`#footTwitter`,
`data-foot-fixed`; `contactLinksSettings()` in `src/site-content-core.js` (authoritative
ordered `settings.contact.links[]`; legacy email/twitter fallback; unsafe values never render).
preserve: `#footContactList`, `.cms-contact-link`, fixed-link survival, https/mailto/anchor-only
URL policy (security invariant).
replace: columns, icons, typography.

### Toast

classification: logic KEEP / visual REPLACE / motion REPLACE (STATIC acceptable)
current responsibility: transient feedback (commission result, picker/save notices).
source: `crabbie-port26.html` `#toast[role=status]`, `toast()`.
preserve: `#toast` id, `role=status` live region, global `toast()` function.
replace: position, styling, duration.

### Boot / paint gates

classification: logic KEEP / visual REPLACE (overlay art) / motion REPLACE (keep pending-hide + reduced-motion)
current responsibility: hide chrome until first CMS paint; `loading` view for pending detail
slugs (prevents false 404); boot overlay orchestration.
source: `crabbie-port26.html` `html.cms-content-pending/ready`, `#homeBloomTransition`,
`cmsDetailPending/Missing`, `startupFallback404`; `src/site-content-cms.js` owns first-paint gate.
preserve: html gate classes, overlay `.is-hidden` contract, `loading` route for pending details.
replace: bloom/glow artwork, reveal stagger.
risks: removing gates causes prototype flash / false 404 (HIGH).

## 5. Home

### Hero (content + artwork slot)

classification: logic KEEP (copy/hydration bindings) / visual REPLACE / motion REPLACE
current responsibility: headline/tagline/CTAs/hero-media render from settings/brand.
source: `crabbie-port26.html` `section.view[data-view=home]`, `.hero-grid`, `.hero-ctas`,
`.hero-art-wrap`; brand/seo/hero copy via `src/site-content-cms.js`.
preserve: heading hierarchy, CTA destinations (portfolio/commissions), hero-media binding.
replace: layout, artwork treatment, bob/entrance (see §20).

### Featured works + freebies strips

classification: logic KEEP (hydration + delegation) / visual REPLACE / motion REPLACE
current responsibility: CMS-driven cards opening detail routes.
source: `crabbie-port26.html` `#worksGrid`, `#assetsGrid`; `window.CrabbiePortfolio.apply`,
`window.CrabbieAssets.apply`; `data-project`/`data-asset` delegation; `.work`/`.item`
in `isNavigatingControl`.
preserve: grid ids, `data-*` attributes, card classes in nav-exclusion list.
replace: card visuals, grid rhythm.
risks: cards outside the nav-exclusion list get press-delayed navigation (MEDIUM).

### Commission CTA band

classification: logic KEEP (tier data bindings) / visual REPLACE / motion REPLACE
current responsibility: tier teaser + conversion CTA.
source: `crabbie-port26.html` `.cta`, `.cta-tier`; commission services data.
preserve: price/destination bindings. replace: everything visual.

## 6. Portfolio

### Portfolio list (search, chips, grid, empty states)

classification: logic KEEP / visual REPLACE / motion REPLACE (entrance suppressible; restored-activation STATIC per §15)
current responsibility: filterable deterministic grid.
source: `crabbie-port26.html` `#pfSearch/#pfChips/#pfGrid/#pfStatus/#pfEmpty`, `initFilter('pf')`;
`planPortfolioVariants` → `src/portfolio-grid-core.js` (desktop bands, compact fallback);
`syncPortfolioComposition` call sites (hydrate/filter/resize); `.is-art-ready/.is-image-card`.
dependencies: `src/portfolio-cms.js`, `src/portfolio-cms-core.js`.
preserve: all five ids, `data-cat/data-search`, variant classes `pf-l/pf-t/pf-s/pf-w`,
art-ready classes, anti-overflow rules (`min-width:0`, wrapping).
replace: card visuals, gaps, filter control styling.
risks: dense auto-placement or dropped recompute sites freeze/break composition (MEDIUM).

### Portfolio data + CMS hydration

classification: logic KEEP / visual N/A / motion N/A
current responsibility: published projects feed list/detail/home.
source: `src/portfolio-cms.js` (`hydratePortfolio`, generation ownership, prototype fallback);
`src/portfolio-cms-core.js` mapping; tables `portfolio_projects`, `cms_categories`.
preserve: adapter contract + fallback policy. replace: nothing (N/A).

## 7. Project Detail

### Project detail route + blocks + cover + credits + prev/next

classification: logic KEEP / visual REPLACE / motion STATIC (stationary by design)
current responsibility: single-project story with CMS blocks, cover viewer, people credits,
sibling navigation, stationary entrance, list return with scroll restore.
source: `crabbie-port26.html` `section[data-view=project-detail]`, `renderProject`,
`publicBlockBody` (all block kinds), `#pdTitle/#pdDesc/#pdCreditStrip/#pdCover[data-cover-viewer]/#pdBlocks/#pdPrev/#pdNext`;
credits via `src/people-cms.js` ordered junction + `content.peopleCreditLabel`; stationary CSS.
preserve: all `pd*` ids, block-type switch coverage, cover containment, prev/next in nav-exclusion,
`data-cover-viewer` → viewer wiring, stationary entrance.
replace: hero/facts/block styling.
risks: dropped block kinds lose CMS content (MEDIUM); shared-image helper swap breaks containment (LOW).

## 8. Free Assets

### Free asset listing

classification: logic KEEP / visual REPLACE / motion N/A-to-REPLACE
current responsibility: searchable/filterable asset shelf.
source: `crabbie-port26.html` `#faSearch/#faChips/#faGrid/#faStatus/#faEmpty`, `initFilter('fa')`;
`src/free-assets-cms.js`, `src/free-assets-core.js` (`mapFreeAsset`, canonical category).
preserve: ids, `data-asset`, filter contract. replace: card/chip visuals.

### Asset detail + download gating + gallery

classification: logic KEEP / visual REPLACE / motion N/A
current responsibility: spec/license render, truthful download gating, cover-first gallery in
shared viewer.
source: `crabbie-port26.html` `renderAsset`, `#adDownload/#adDriveDownload/#adUnavailable/#adGallery/#adGalleryMore`,
`data-ad-index`; `isAssetAvailable`; `src/asset-gallery-core.js` (ordered `metadata.gallery[]`, coverAlt).
preserve: availability truth check (URL presence + `available`), disabled states, cover-first order,
viewer wiring.
replace: spec rows, gallery grid, banner styling.
risks: enabling download when unavailable/URL-less violates product truthfulness (HIGH).

## 9. Commissions

### Service tiers + accordions + other-service detail + fees

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: pricing/availability render, fee disclosure, service→form mapping.
source: `crabbie-port26.html` `.comm-grid .acc`, `[data-service][data-form][data-service-slug]`,
`#miniServicesGrid[data-other-service]`, `#otherServiceDetail[aria-live]`, `.rules-grid`;
`OTHER_SERVICES` map; `src/commissions-cms.js`, `src/commissions-core.js`; tables
`commission_services`, `commission_forms`.
preserve: `data-service/data-form` mapping, accordion open semantics, availability-disabled CTA
with reason, fee content. replace: cards, pills, accordion visuals.
risks: broken `data-form` mapping routes requests to the wrong tab (MEDIUM).

### Client thanks carousel

classification: logic KEEP (data/mode rules) / visual REPLACE / motion KEEP EXACT
current responsibility: people-driven thanks display with 3 modes (static/scroll/marquee).
source: `crabbie-port26.html` `section#clientThanks`, `renderClientThanks`, `ThanksMotion`;
`src/people-cms.js`; `settings.portfolioThanks`; mode thresholds, pause control, clone handling.
preserve: mode thresholds, pause persistence, clones `aria-hidden`/unfocusable, focus→browsing switch.
replace: track/item styling. motion implementation reused as-is (see §20).

### Request form tabs

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: per-type panels with keyboard-correct tab semantics.
source: `crabbie-port26.html` `.tab-btn[role=tab]`, `.tab-panel`, roving tabindex + Arrow/Home/End.
preserve: tab roles, `aria-selected/controls`, `.on` contracts, keyboard map. replace: pill/panel visuals.

## 10. About

classification: logic KEEP (public model) / visual REPLACE / motion REPLACE
current responsibility: bio/skills/experience/values render from CMS.
source: `crabbie-port26.html` `data-view=about`; `aboutPublicModel` in `src/site-content-core.js`;
table `cms_pages` (about + data).
preserve: model fields, repeater bindings. replace: all styling.

## 11. Contact

classification: logic KEEP / visual REPLACE / motion N/A
current responsibility: letter card, ordered contact rows/actions, copy-email.
source: `crabbie-port26.html` `data-view=contact`, `#publicContactRows .cms-contact-row`,
`#publicContactActions`, `#copyEmailBtn`; same `contactLinksSettings` provider as footer.
preserve: row/action ids, order/visibility semantics, unsafe-value policy. replace: card visuals.

## 12. Terms

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: 8-section agreement + jump nav + scrollspy (CMS-rebindable).
source: `crabbie-port26.html` `data-view=terms`, `details.tos-disclosure`, `[data-jump]`,
scrollspy wiring with `aria-current`.
preserve: section ids, jump mapping, spy rebind after CMS hydration. replace: layout/typography.

## 13. 404 / Loading

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: recovery links; CMS-pending placeholder.
source: `crabbie-port26.html` `data-view=404` (`.v404-num`), `data-view=loading`;
entered via `cmsDetailMissing/startupFallback404` and `cmsDetailPending`.
preserve: entry conditions, focus targets, recovery destinations. replace: art/copy styling.

## 14. Admin

Overall: logic KEEP for all panels and the save/auth/hydration machinery; visual REPLACE
allowed panel-by-panel provided editor field paths and `data-adm-*` bindings are preserved
or explicitly rebound; motion N/A.

### Auth (login, role gate, event policy)

classification: logic KEEP / visual REPLACE (keep ids) / motion N/A
source: `src/admin-auth.js` (session restore, sign-in, metadata-only denial, dirty bridge);
`src/admin-auth-core.js` (`app_metadata.role==='admin'` only, stable error codes);
`src/admin-auth-events-core.js` (only initial/sign-in hydrate; token refresh never replaces draft).
preserve: `app_metadata` gate, event policy, login form contract. replace: card styling.
risks: non-`app_metadata` authorization leaks admin UX (HIGH).

### Shell chrome (sidebar, topbar, locale, dirty guard)

classification: logic KEEP / visual REPLACE (keep ids) / motion N/A
source: `crabbie-port26.html` `#adminSidebar/#adminBurger/#adminSaveStatus/#adminTopSave/#adminContent`,
`ADMIN_MODULES` (+dashboard fallback); `ADMIN_I18N/tAdmin` single dictionary;
`src/admin-draft-guard*.js` (`canMutateAdmin`, `shouldBlockAdminExit`, `shouldSetBeforeUnload`).
preserve: module routing, readiness-gated save, presentation-only locale, discard guards.
replace: sidebar/topbar styling. risks: guard removal loses drafts (MEDIUM).

### Hydration mapping + persistence contract

classification: logic KEEP / visual N/A / motion N/A
source: `src/admin-hydration-core.js` (record identity `dbId`+`originalUpdatedAt`, per-key settings
baselines, atomic replace, throw-on-partial); `src/admin-record-save-core.js` (write plans,
UUID identity, `updated_at` guard, zero-row = `stale_save`, settings per-key writes,
confirmed-only baseline advance); `src/admin-save-flight-core.js` (single-flight);
`src/admin-save-revision-core.js` (revision gate); `src/admin-persisted-baseline-core.js`;
`src/admin-crud.js` (loads/saves/orders/deletes/RPC calls); `ADMIN_DATA/ADMIN_DRAFT/ADMIN_UI`
single state model.
preserve: every invariant in §3 rules 3–4. No second state model.
risks: baseline/single-flight/revision removal or slug-as-identity causes silent overwrites (HIGH);
`upsert(onConflict:'slug')` forbidden.

### Panels (dashboard, portfolio, people, assets, commissions, requests, about, terms, contact, media, cleanup, settings)

classification: logic KEEP / visual REPLACE (bindings preserved) / motion N/A
source: `crabbie-port26.html` `renderAdmin*` functions; `src/admin-crud.js`, `src/admin-media*.js`,
`src/admin-cleanup.js`, `src/admin-data-audit.js`, `src/appearance-core.js`; people RPCs
`save_project_with_people` / `move_person`; request lifecycle core; upload pipeline cores.
preserve: `ADMIN_DRAFT` field paths, `[data-adm-mediabrowse]` picker hook, the three admin modals,
sticky save, server paging (30/page), lifecycle ⊥ status model, trash+hold purge gate.
replace: panel styling, control visuals.
risks: renamed draft paths without formatter updates silently drop fields (MEDIUM).

## 15. Routing / History / Scroll

### Hash router core

classification: logic KEEP / visual N/A / motion N/A
current responsibility: route parse, sync apply with echo-dedup, titles, admin fallback, detail gates.
source: `crabbie-port26.html` `parseRoute`, `routeFromLocation`, `navigate`, `applyRoute`,
`handleHash`, `titleFor`, `SIMPLE_VIEWS`, `ADMIN_MODULES`, `NAVKEY`; `lastAppliedHash` echo guard.
preserve: echo guard, teardown-before-apply order, `restored` flag plumbing, dirty-guard replay
(`replaceState` + confirm + one-shot replay), 404/dashboard fallbacks.
replace: nothing. risks: echo loss double-applies views; owned-entry leak strands history (HIGH).

### History (Back/Forward, viewer-owned entry, dirty replay)

classification: logic KEEP / visual N/A / motion N/A
current responsibility: viewer-dismiss-first Back, stale-entry reconcile, admin discard replay.
source: `crabbie-port26.html` `popstate` capture, `viewerOwnedEntry/viewerStaleSkip/viewerScrollY`,
single same-URL `{crabbieViewer:true}` push, `closePublicLightbox` entry consumption,
`teardownViewerForRoute`.
preserve: at-most-one owned entry, steps push nothing, teardown without stale restore.
risks: mismatch strands viewer or steals focus (HIGH).

### Scroll restoration + focus + stationary rules

classification: logic KEEP / visual N/A / motion KEEP EXACT
current responsibility: deterministic keep/restore/top outcomes; stationary restores and detail
entrances (anti-flash); scroll-safe focus.
source: `src/route-scroll-core.js` (`sameRoute`, `isDetailReturn`, `clampScrollY`, `decideScroll`);
`instantScrollTo` sole primitive (never smooth); `scrollMemory` per view; `body.is-restoring` +
persistent `.view.is-restored-activation`; `focusView` per-view targets with `preventScroll`.
preserve: instant-only primitive, clamp, keep-on-same-route, activation lifetime, focus map.
replace: fresh-navigation entrance aesthetics only.
risks: smooth route scroll reintroduces crawl-to-top bug; focus-with-scroll destroys restore (HIGH).

### Nav delegation + immediacy

classification: logic KEEP / visual N/A / motion KEEP EXACT (exclusion contract)
current responsibility: immediate synchronous navigation for all card/link/back controls.
source: delegated click map (`data-goto/project/asset`, `.work/.item`, prev/next, back links,
admin jumps) with missing-source guard + slug encode/decode; `isNavigatingControl` exclusion from
press feedback + CSS kill-switch.
preserve: selector list parity between delegation and exclusion; immediacy (no animation delay).
risks: new clickable card outside exclusion gets delayed navigation (MEDIUM).

## 16. Viewer / Media

### Viewer visual chrome

classification: logic N/A / visual REPLACE / motion KEEP EXACT (functional zoom transition only)
current responsibility: dialog shell, caption/credits/position pills, prev/next, loading/error,
zoom bar, safe-area bands, live announcements.
source: `crabbie-port26.html` `#publicLightbox*` markup/CSS; `syncViewerChrome`, `paintViewerItem`.
preserve: all `publicLightbox*` ids, `hidden` collapsing, stage model (artwork clear of controls),
touch-action/cursor classes, trap list, live region. replace: colors, radii, blur, icons.
risks: overlay restyle pushing art under controls; dropped `hidden` collapsing breaking stage math (MEDIUM).

### Viewer logic / gesture engine

classification: logic KEEP / visual N/A / motion KEEP EXACT
current responsibility: collection API, gen-guarded loads, scroll lock, history ownership, focus
trap/restore, clamped zoom/pan across wheel/pinch/drag/keys, resize re-clamp.
source: `crabbie-port26.html` `openViewerCollection/loadViewerIndex/stepViewer/paintViewerItem/teardownViewerUI`,
gesture handlers; `src/lightbox-gesture-core.js` pure math (`window.CrabbieLightboxGesture`);
`src/lightbox-gesture.js` bridge.
preserve: gen guard, 1–4x clamp, edge pan bounds, direct (uninterpolated) drag/pinch, animated-only
discrete steps, lock pair, owned-entry lifecycle, loading/error mutual exclusion + retry.
replace: step sizes, pan px, announcer copy only.
risks: stale-load overwrite, root scroll drift, teardown/focus mismatch (HIGH); Escape ordering vs
menu/modals must stay viewer-first (MEDIUM).
Explicit non-features (confirmed absent, N/A): swipe-to-step, double-tap handler, DPR scaling.

## 17. Forms / Requests

### Commission submit pipeline

classification: logic KEEP / visual REPLACE / motion REPLACE
current responsibility: schema-aware collect → validate (required/email/consent, first-invalid
focus, per-field messages) → payload → single-flight insert → confirmed-only success panel +
toast + confetti; friendly failure with draft preserved.
source: `crabbie-port26.html` form ids (`#requestForm/#commissionForm/#consentBox/#commissionSubmit[aria-busy]/#briefResult/#briefText/#briefEmail`),
`setFormState`, `isCommissionSubmitting`; `src/commission-requests.js` (tolerant service/form
lookup, RLS insert); `src/commission-requests-core.js` (validation, payload, `toPublicRequestError`,
`isConfirmedCommissionSubmission`).
preserve: single-flight flag, busy lock, confirmed-insert gate, generic public errors (never raw DB
text), `hidden` result contract, edit-returns-with-values.
replace: field layout, shell styling (keep readable column + ≥16px inputs).
risks: duplicates/false success if gates removed (HIGH — product rule 4).

### Request lifecycle (admin)

classification: logic KEEP / visual REPLACE / motion N/A
current responsibility: inbox/archive/trash orthogonal to status; bulk cap + typed confirm;
trash-only + retention-hold purge gate; server paging/filtering.
source: `src/commission-request-lifecycle-core.js`; `src/admin-query-core.js` filter/paging specs;
migration `202609220001_commission_request_lifecycle.sql`.
preserve: transition rules, identity (UUID + `expectedUpdatedAt`), role gate, purge preconditions.
risks: one-click hard delete loses PII records (HIGH).

## 18. CMS / Data / Supabase

### Public adapters + refresh router

classification: logic KEEP / visual REPLACE (output contracts kept) / motion N/A
current responsibility: published-only hydration with latest-request ownership and prototype
fallback (People hides instead); scope → adapter refresh after admin saves.
source: `src/portfolio-cms.js`, `src/people-cms.js`, `src/free-assets-cms.js`,
`src/commissions-cms.js`, `src/site-content-cms.js` (owns first-paint gate), `src/public-cms-refresh.js`
(13 scopes in 5 groups; requests/media/cleanup intentionally no-op).
preserve: ownership tokens, fallback policy, output container/selector contracts, refresh scope map.
replace: renderer markup only together with its adapter.
risks: renamed DOM ids without adapter updates cause stale/empty views after save (MEDIUM);
dropped generation tokens cause paint races (LOW).

### Tables / RLS / RPCs / policies

classification: logic KEEP / visual N/A / motion N/A
current responsibility: 15 tables, published-only anon reads, constrained visitor insert,
admin-only writes/audit/cleanup/leases, public media bucket, hardened functions/grants,
`save_project_with_people` + `move_person` RPCs (invoker security, fixed path).
source: `supabase/migrations/*.sql` (reference only — never edit applied files).
preserve: entire posture; new needs → new forward migration + schema/security checks.
risks: blanket policies, disabled RLS, client-side role flags, service-role in browser (HIGH).

### Server APIs

classification: logic KEEP / visual N/A / motion N/A
current responsibility: public Supabase config (public key only); SSRF-pinned TikTok oEmbed proxy
with sanitized fields.
source: `api/public-config.js`; `api/tiktok-oembed.js` + `tiktokVideoId` gate.
preserve: key hygiene, host pinning, field sanitization. risks: open proxy or secret leak (HIGH).

### Media pipeline + deletion + cleanup + purge + audit

classification: logic KEEP / visual REPLACE (panels) / motion N/A
current responsibility: validated split upload (standard ≤6MB / TUS resumable with fallback),
SHA-256 dedupe, lease coordination; recoverable deletion lifecycle with usage gate + fresh
re-check; read-only scanner; gated manual purge; append-only audit.
source: `src/admin-upload-core.js`, `src/admin-media-upload.js`, `src/admin-media-core.js`,
`src/admin-media-safety-core.js`, `src/admin-media.js`, `src/media-upload-leases.js`,
`src/media-cleanup-scanner-core.js`, `src/media-purge-core.js`, `src/admin-cleanup.js`;
migrations for tombstone/cleanup/lease columns.
preserve: thresholds, retry/backoff, dedupe, lifecycle order, grace/scan/lease gates, audit writes.
replace: library/cleanup panel styling.
risks: one-step delete, skipped re-check, auto-purge, incomplete-scan purge → data loss (HIGH);
treating public bucket as private → exposure (MEDIUM).

## 19. Appearance / Settings

classification: logic KEEP / visual REPLACE (control styling; token contract fixed) / motion N/A
current responsibility: strict hex tokens, canonical defaults, resolved/inherited model, palette
snapshot/apply, background modes, 24-role Advanced overrides with prune-on-absent, truthful preview,
sanitized save, authoritative hydration.
source: `src/appearance-core.js` (`setTextOverride`, `planThemeVars/planAdvancedVars`,
`sanitizeThemeForWrite`); `refreshAppearancePreview`; `settings.theme.*` + `textOverrides` paths;
`body`-hosted `--text-*` chains.
preserve: token paths, inheritance semantics, preview-truthfulness, var chains.
replace: settings control visuals.
risks: raw path writes or materialized inherited values cause unprunable overrides; var renames
without dual preview/public update cause divergence (MEDIUM).

## 20. Legacy Motion

- Jelly/press delegation: logic KEEP (target list + nav-exclusion + admin/reduced skip) /
  visual REPLACE / motion REPLACE. Reuse contracts: `JELLY_TARGETS`, `isNavigatingControl`
  parity, `JELLY_MS`, `__jellyRunning` guard, `translate`/`scale`-property convention that composes
  with lifts; pet uses inner-body variant (transform-conflict avoidance).
- Hover lift/wobble: logic N/A / visual REPLACE / motion REPLACE.
- Hero/page entrances (fade/view/scale/eyebrow/signature/nav/menu/footer): visual N/A /
  motion REPLACE, except suppression contract (`is-restoring`, `.is-restored-activation`,
  stationary detail) KEEP EXACT.
- Sparkle burst, confetti (+ trigger points at commission success / admin save), flower sway,
  bow pop, hover bob, loading motion: visual REPLACE / motion REPLACE.
- Falling candy: visual REPLACE / motion KEEP EXACT (spawner, density/viewport scaling, asset
  list, gates). Settings `motion.fallingCandy/candyDensity`.
- Desktop pet: visual REPLACE / motion KEEP EXACT (spawn cap/FIFO, click/drag/wander/dialogue,
  field-avoid, mobile cap). Settings `motion.pet{enabled,maxDesktop,dialogues}`.
- Music control: logic KEEP EXACT (reuse `src/site-motion.js` implementation: single stable
  audio, gesture resume, persisted volume/mute, state attribute, admin/field-focus hiding) /
  visual REPLACE / motion N/A. Settings `music{enabled,url,title,volume,loop,autoplay}`.
- Thanks marquee: visual REPLACE / motion KEEP EXACT (mode thresholds, ~24px/s pacing, pause
  persistence, clone/focus rules, visibility pausing).
- Decor parallax/crossfade: visual REPLACE (artwork) / motion KEEP EXACT (thresholds, prefetch
  margins, decode gating, parallax/float split, coarse/reduced/admin gates).
- Viewer zoom transitions: visual N/A / motion KEEP EXACT (discrete-step `.anim-zoom`, direct
  manipulation uninterpolated).
- Reduced-motion system: visual N/A / motion KEEP EXACT (CSS kill + JS gates + live `matchMedia`
  handling across candy/pet/decor/thanks/boot/scroll).
- Dead code confirmed: `animFloatIn` keyframes defined, no application selector (N/A, no action).

## 21. Accessibility

- Focus system (`focusView` map, skip link, `preventScroll`): logic KEEP / visual REPLACE
  (keep visible focus) / motion N/A.
- ARIA semantics (pressed/expanded/selected/current/busy/disabled/hidden/modal, live regions,
  labelledby/describedby): logic KEEP / visual REPLACE / motion N/A.
- Focus traps (mobile menu, viewer) + opener restore: logic KEEP EXACT / visual REPLACE / motion N/A.
- Keyboard maps (viewer arrows/pan, tabs roving, admin save shortcut, Escape layering viewer-first):
  logic KEEP / visual N/A / motion N/A.
- Reduced motion: logic KEEP EXACT (see §20).
- Admin EN/VI dictionary boundary (admin-only, never public strings): logic KEEP.
- risks: dropped traps/restore or public use of `ADMIN_I18N` (MEDIUM).

## 22. Redesign Integration Risks

### R-01 Router echo / history ownership

severity: HIGH
source: `navigate`/`handleHash`/`popstate`, owned `{crabbieViewer:true}` entry, dirty replay.
coupling: every route change, viewer open/close, admin exit.
failure mode: double-applied views, stranded history, Back skipping routes, silent draft loss.
future requirement: reuse router/history/scroll/viewer-teardown as a unit; preserve guard order.

### R-02 Adapter–selector coupling

severity: HIGH
source: `-cms.js` renderers ↔ public container ids (grids, blocks, galleries, forms, contact rows).
coupling: admin save → `refreshPublicCms(scope)` → adapter repaint.
failure mode: save succeeds but public view goes stale/empty.
future requirement: change renderer markup only together with its adapter; keep id contracts.

### R-03 Persistence invariants

severity: HIGH
source: `admin-record-save-core.js`, save-flight/revision/baseline cores, `admin-crud.js`.
coupling: every admin mutation.
failure mode: silent overwrites, duplicate submits, phantom saved states.
future requirement: keep UUID identity, `updated_at` guard, single-flight, revision gate,
confirmed-only baselines; no slug-based upserts.

### R-04 Auth / RLS posture

severity: HIGH
source: `admin-auth*.js`, migrations (RLS/policies/grants), `public-config.js`.
coupling: admin shell, all reads/writes, request inserts.
failure mode: data exposure, privilege escalation surface.
future requirement: `app_metadata` gate, published-only reads, constrained inserts, public key only.

### R-05 Media deletion / purge safety

severity: HIGH
source: `admin-media-safety-core.js`, purge/scanner cores, cleanup migration.
coupling: media library, cleanup panel, every referenced view.
failure mode: irreversible asset loss breaking public pages.
future requirement: keep recoverable lifecycle, fresh re-check, grace/scan/lease gates, audit writes.

### R-06 Commission success truthfulness

severity: HIGH
source: `commission-requests*.js`, form state machine.
coupling: public form → `commission_requests` table → admin inbox.
failure mode: duplicates, false success, raw DB errors shown publicly.
future requirement: keep single-flight + confirmed-insert gate + generic errors.

### R-07 Scroll primitive discipline

severity: HIGH
source: `route-scroll-core.js`, `instantScrollTo`, stationary CSS.
coupling: all route transitions, detail open/return, viewer teardown.
failure mode: crawl-to-top, mid-read animation bursts, destroyed restore positions.
future requirement: instant-only route scroll; keep clamp, keep-on-same, activation lifetime,
scroll-safe focus, stationary detail.

### R-08 Viewer race / lock / focus

severity: HIGH
source: viewer controller + gesture bridge.
coupling: cards, galleries, covers, keyboard, touch, history.
failure mode: stale image/caption, page scroll drift during pan, lost focus, modal conflicts.
future requirement: keep gen guard, lock pair, owned-entry lifecycle, clamp math, trap + restore,
viewer-first Escape.

### R-09 Asset availability truthfulness

severity: MEDIUM
source: `renderAsset` gating, `isAssetAvailable`, service availability flags.
coupling: asset detail, commission tiers.
failure mode: dead downloads presented as live; closed services purchasable.
future requirement: keep gating logic; restyle banners freely.

### R-10 Draft-path / formatter parity

severity: MEDIUM
source: `ADMIN_DRAFT` paths ↔ `admin-crud-core.js` formatters ↔ `admin-query-core.js` selects.
coupling: every admin editor, especially gallery/`peopleIds`/overrides.
failure mode: silently dropped fields on save.
future requirement: rename paths only with formatter/select updates + round-trip test.

### R-11 Appearance var-chain parity

severity: MEDIUM
source: `appearance-core.js`, preview refresher, public CSS, hydration planner.
coupling: settings panel → preview → saved theme → public paint.
failure mode: preview/public divergence, unprunable inline overrides.
future requirement: keep token paths, inheritance, prune semantics, `body` var host.

### R-12 Nav-exclusion parity

severity: MEDIUM
source: delegation triggers ↔ `isNavigatingControl` ↔ CSS kill-switch.
coupling: every clickable card/link + any press animation.
failure mode: delayed navigation on new controls.
future requirement: every navigation trigger must be in the exclusion list.

### R-13 People junction integrity

severity: MEDIUM
source: `save_project_with_people` / `move_person` RPCs, ordered `peopleIds`.
coupling: project editor, credit strips, thanks section.
failure mode: misordered/lost credits; copied (stale) person data.
future requirement: RPC-only writes; junction stores references, never copies.

### R-14 oEmbed proxy pinning

severity: MEDIUM
source: `api/tiktok-oembed.js`, `tiktokVideoId`.
coupling: video link cards.
failure mode: SSRF if broadened.
future requirement: keep host pinning + field sanitization.

## 23. UNKNOWN / Decisions Requiring User Input

1. Live production interaction (music playback, form submission, auth against production
   Supabase) — not exercised in any batch; local suite covers the paths. UNKNOWN, no action.
2. `scripts/check-live-public.mjs` invocation — no npm script references it. UNKNOWN; likely
   manual/CI helper, out of redesign scope.
3. `scripts/seed-*.mjs` contents — not read (dev helpers). UNKNOWN; no redesign impact assumed,
   flag if seeds are ever rerun against production.
4. New visual treatment for every REPLACE item — by design deferred to DESIGN-CONTRACT /
   Figma stages, not decided here.
5. Whether Admin panels receive any visual refresh at all — no repository evidence or instruction
   either way; default assumption per §3 rule 9 is Admin stays functionally intact regardless.

## 24. Inventory Traceability Matrix

| Inventory area (SITE-INVENTORY §) | Logic | Visual | Motion | Legacy Map § |
|---|---|---|---|---|
| Route/View index (13 views) | KEEP | REPLACE (surfaces) | mixed | §4–§13, §15 |
| Global shell, nav, footer, overlays, gates, toast | KEEP | REPLACE | mixed | §4 |
| Home (hero, strips, CTA) | KEEP | REPLACE | REPLACE | §5 |
| Portfolio list + data/hydration | KEEP | REPLACE | REPLACE | §6 |
| Project detail | KEEP | REPLACE | STATIC | §7 |
| Free Assets list | KEEP | REPLACE | REPLACE | §8 |
| Asset detail + gating + gallery | KEEP | REPLACE | N/A | §8 |
| Commissions tiers/fees/services | KEEP | REPLACE | REPLACE | §9 |
| Thanks carousel | KEEP | REPLACE | KEEP EXACT | §9, §20 |
| Request form + pipeline | KEEP | REPLACE | REPLACE | §9, §17 |
| About | KEEP | REPLACE | REPLACE | §10 |
| Contact | KEEP | REPLACE | N/A | §11 |
| Terms | KEEP | REPLACE | REPLACE | §12 |
| 404 / loading | KEEP | REPLACE | REPLACE | §13 |
| Admin login/shell/panels | KEEP | REPLACE | N/A | §14 |
| Hidden/conditional UI (menu, viewer, music, candy, pet, modals, banners, badges) | KEEP | REPLACE | mixed | §4, §16, §20 |
| UI states (~30 tokens) | KEEP | REPLACE | mixed | §4, §15, §16, §20 |
| Navigation behavior | KEEP | N/A | KEEP EXACT (exclusion) | §15 |
| History Back/Forward | KEEP | N/A | N/A | §15 |
| Scroll restoration | KEEP | N/A | KEEP EXACT | §15 |
| Keyboard | KEEP | N/A | N/A | §15, §21 |
| Touch/pointer + gestures | KEEP | N/A | KEEP EXACT | §15, §16 |
| Viewer/lightbox | KEEP | REPLACE (chrome) | KEEP EXACT | §16 |
| Forms behavior | KEEP | REPLACE | REPLACE | §17 |
| Media behavior | KEEP | REPLACE | KEEP EXACT (decor) | §16, §18, §20 |
| Animation/motion inventory | mixed | REPLACE | mixed | §20 |
| CMS adapters + refresh | KEEP | REPLACE (contracts) | N/A | §18 |
| Pure cores | KEEP | N/A | N/A | §18 |
| Supabase/RLS/RPCs | KEEP | N/A | N/A | §18 |
| Server APIs | KEEP | N/A | N/A | §18 |
| Settings/appearance | KEEP | REPLACE (controls) | N/A | §19 |
| Admin persistence/lifecycle | KEEP | REPLACE (panels) | N/A | §14, §17 |
| Media pipeline/deletion/cleanup | KEEP | REPLACE (panels) | N/A | §18 |
| Admin↔public relationships | KEEP | REPLACE | N/A | §18 |
| Mobile-specific | KEEP | REPLACE | mixed | §4, §15, §20 |
| Accessibility/keyboard | KEEP | REPLACE | STATIC (reduced) | §21 |
| Error/empty/loading states | KEEP | REPLACE | REPLACE | §4, §13, §17 |
| Unknown/unverified items | carried | — | — | §23 |

Every SITE-INVENTORY section maps to at least one LEGACY-MAP decision above; no
inventory area was skipped. Dead/confirmed-absent items (`animFloatIn` unused,
swipe-to-step, double-tap, DPR scaling, `nav-motion-core.js` source module) are N/A
with evidence, not open unknowns.

## 25. Summary

- Public presentation is overwhelmingly REPLACE; application logic, data contracts,
  and safety machinery are overwhelmingly KEEP.
- KEEP EXACT concentrates in: scroll/history/viewer-teardown behavior, stationary
  restore/detail rules, nav-delegation immediacy, viewer gesture math, falling candy,
  desktop pet, music-control behavior, thanks marquee, decor parallax/crossfade,
  viewer zoom transitions, reduced-motion system, focus traps + opener restore.
- REPLACE concentrates in: every visible surface (nav, hero, cards, grids, detail
  layouts, forms shell, footer, admin panels, viewer chrome, settings controls) and
  decorative motion (entrances, jelly feel, sparkle, confetti, sway, bob, lifts, loading).
- 14 integration risks documented (8 HIGH); 5 unknowns carried, none blocking.
- No code, schema, CMS, animation, or routing was changed in this batch.
