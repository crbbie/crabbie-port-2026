# CRABBIE LEGACY MAP (CANONICAL)

USER-LEGACY-DECISIONS.md is the authoritative decision source.
This file synchronizes the technical audit to those user decisions.
No redesign is implemented here. No code was changed in this batch.

## 1. Metadata

- canonicalization date: 2026-10-01 (UTC)
- repository: crbbie/crabbie-port-2026
- base: docs/redesign-legacy-map @ 0cd8866 (prior agent audit)
- source main SHA: 6f9dbec9fe77e5d49038f872f6dcd542e59adf7
- baseline SHA/tag: a0f04697ac4585166977001a46ba6b4074cfad87 / pre-redesign-2026-10-01
- inventory source: SITE-INVENTORY.md (commit 6f9dbec)
- user decision source: USER-LEGACY-DECISIONS.md (owner USER, COMPLETE, 58/58)
- branch: docs/lock-user-legacy-decisions

## 2. Source Precedence (binding)

These sources are authoritative along independent dimensions. They coexist and govern
different aspects of a change; none is a lower-priority fallback for another.

1. USER-LEGACY-DECISIONS.md — authoritative for all user design/product decisions.
   User notes narrow the scope of the user's feature decision; feature decisions govern
   the user-facing feature/presentation; motion decisions govern motion.
2. Technical invariants (§18) — independent mandatory functional constraints. They are
   authoritative for implementation correctness and are neither overridden by, nor used
   to override, any user visual/motion decision.
3. SITE-INVENTORY.md — authoritative description of what existed before redesign.
4. Legacy audit / source evidence in this file — implementation references,
   dependencies, and risks (technical statements only, never design authority).
5. Old agent-authored KEEP/REPLACE classifications — SUPERSEDED. They must not
   override user choices anywhere in this document.

When resolving ambiguity, first determine which dimension the statement belongs to: user
notes narrow the user's feature decision, feature decisions govern the user-facing
feature/presentation, motion decisions govern motion, and technical invariants
independently constrain implementation correctness. These dimensions coexist; no old agent
classification may override any of them. Where a user decision and a technical guarantee
coexist, both apply simultaneously — the user decision governs the user-facing experience,
the guarantee independently governs the hidden correctness beneath it (e.g. REMOVE boot
overlay removes the visible overlay; CMS first-paint / pending-detail correctness keeps
its PRESERVE_GUARANTEE). Neither overrides the other.

## 3. Canonical Decision Values and Semantics

Feature values (exactly as in USER-LEGACY-DECISIONS.md):

- KEEP_EXACT — user wants the existing feature/component retained very closely.
  A future implementation agent prefers reuse of the existing implementation over
  visual approximation. User notes always narrow the scope (e.g. Featured Works keeps
  the card, not the section title).
- KEEP_BEHAVIOR_REDESIGN_VISUAL — preserve purpose, required data connections, and
  required interaction/behavior; presentation may be rebuilt. Old markup/CSS need not
  remain exact unless a technical dependency requires compatibility or explicit rebinding.
- REPLACE — user permits the previous presentation/implementation to be replaced.
  Technical invariants still survive (Typography REPLACE does not break Appearance
  persistence; grid REPLACE does not allow mobile overflow; 404 REPLACE does not remove
  404 routing behavior).
- REMOVE — user does not want that user-facing feature/presentation. Before deleting
  implementation later, future agents must check whether the same code also provides a
  technical invariant; if so, remove the surface while preserving the guarantee.
  Nothing is deleted in this documentation batch.
- UNSURE — undecided. Count in this batch: 0.

Motion values:

- KEEP_EXISTING_MOTION — reuse the existing motion implementation.
- NEW_MOTION — new motion will be designed (only: commission CTA band).
- STATIC — intentionally still (used implicitly by stationary-detail/ restored-list rules).
- N_A — no motion dimension, or parent feature removed (removed items with untouched
  motion fields are N_A, not UNSURE).
- UNSURE — undecided. Count in this batch: 0.

## 4. USER DECISION SUMMARY (generated from USER-LEGACY-DECISIONS.md)

Feature decisions (58 total): KEEP_EXACT 19, KEEP_BEHAVIOR_REDESIGN_VISUAL 26,
REPLACE 9, REMOVE 4, UNSURE 0.

Motion decisions (58 total): KEEP_EXISTING_MOTION 28, NEW_MOTION 1, N_A 29, UNSURE 0.
(N_A 29 = 25 items with no motion dimension + 4 removed items whose canonical motion is
N_A because the parent feature is REMOVE — decor background artwork is explicitly N_A,
while boot overlay, hero background motion, and loading animation have untouched motion
selectors normalized to N_A. None of these is UNSURE. See SPECIAL CASE F, §16.)

Removed features (4): boot overlay, decorative background artwork, hero background
motion, loading animation.

Non-empty user notes (2): Featured works card scope note; freebies decorative-download
note. Both preserved verbatim adjacent to their items.

Technical invariants carried: 20, all PRESERVE_GUARANTEE.

Asset card: user decision KEEP_BEHAVIOR_REDESIGN_VISUAL, motion KEEP_EXISTING_MOTION
(matches the Motion Decisions table, §16).

## 5. Overview Decisions (Tổng quan)

### Layout / grid system

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: no horizontal overflow on small screens; keep anti-overflow rules
(`min-width:0`, wrapping) in any new grid.
existing implementation: per-area grids (`.hero-grid`, `.grid`, `.comm-grid`, `.rules-grid`)
in `crabbie-port26.html` CSS; no unified grid system.
integration risk: MEDIUM — global grid swap can introduce phone overflow.

### Typography

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: `--text-*` variable chain managed by appearance must stay consistent
between preview and public; variable renames require dual updates.
existing implementation: `crabbie-port26.html` CSS (`body`, `h1–h4`, `.eyebrow`, `.signature`);
`src/appearance-core.js` (`setTextOverride`, `planThemeVars`).
integration risk: MEDIUM on variable rename.

### Color / theme tokens

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: strict hex model, inheritance, prune-on-absent, sanitized writes;
never materialize inherited values; preview stays truthful.
existing implementation: `src/appearance-core.js` (`planThemeVars`, `planAdvancedVars`,
`sanitizeThemeForWrite`).
integration risk: MEDIUM — raw path writes create unprunable overrides.

### Base buttons & controls

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A (press motion decided separately under Jelly)
user note: (none)
technical guarantees: disabled semantics for closed-service CTAs and unavailable downloads
must survive any restyle.
existing implementation: `crabbie-port26.html` CSS (`.btn`, `.nav-cta`, `[disabled]`).
integration risk: LOW.

## 6. Global Decisions

### Desktop navigation

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: routing semantics, `aria-current` behavior, `data-goto` delegation
contract, `NAVKEY` detail→parent mapping, CMS labels/titles wiring.
existing implementation: `nav#mainNav`, `.nav-links a[data-goto]`, `a.nav-cta`, `NAVKEY`,
`applyRoute`, `parseRoute`, `navigate`, `titleFor`; `src/site-content-core.js`,
`src/site-content-cms.js`, table `cms_navigation`.
integration risk: MEDIUM — renaming `data-goto` values breaks delegation + highlight.

### Mobile menu (burger)

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: open/close behavior, outside-click/Escape/route-change close, focus
trap, `aria-expanded`.
existing implementation: `button#navBurger`, `div#mobileMenu`, `.open`, inner `a[data-goto]`,
`closeMenu`, trap wiring in `crabbie-port26.html`.
integration risk: MEDIUM — dropping trap/`aria-expanded` breaks keyboard use.

### Footer & contact block

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: `contactLinksSettings` ordering/visibility/fallback semantics;
https/mailto/anchor-only URL policy (security invariant, not aesthetic).
existing implementation: `#footContactList`, `.cms-contact-link`, `[data-foot-fixed]`,
`#footEmail`, `#footTwitter`; `src/site-content-core.js`.
integration risk: MEDIUM on URL policy change (security).

### Toast

user decision: REPLACE
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: `role=status` live region must survive restyle.
existing implementation: `#toast[role=status]`, `toast()` in `crabbie-port26.html`.
integration risk: MEDIUM if live region lost.

### Skip link

user decision: KEEP_EXACT
motion: N_A
user note: (none)
technical guarantees: equivalent bypass mechanism + focus target must exist in new shell.
existing implementation: `a.skip-link[href="#main"]`, `#main` in `crabbie-port26.html`.
integration risk: LOW; removal breaks keyboard bypass.

### Boot overlay — SPECIAL CASE A

user decision: REMOVE
motion: N_A (parent feature removed; untouched motion field is not an open decision)
user note: (none)
technical guarantees (PRESERVED, not removed): `cms-content-pending/ready` correctness,
CMS first-paint gate, pending detail must not become false 404, startup loading correctness.
REMOVE covers the visible overlay/bloom/loading presentation only.
existing implementation: `html.cms-content-pending/.cms-content-ready`, `#homeBloomTransition`,
`.is-hidden`, `cmsDetailPending/Missing`, `startupFallback404`; `src/site-content-cms.js`.
integration risk: HIGH if the hidden gate is removed together with the overlay
(prototype flash / false 404).

### Decorative background artwork — SPECIAL CASE B

user decision: REMOVE
motion: N_A (artwork has no motion of its own; the motion engine is a separate
KEEP_EXACT item below)
user note: (none)
technical guarantees: none for the artwork itself. The parallax/crossfade motion system
is preserved separately as a reusable engine for future assets — this is NOT permission
to keep the old artwork.
existing implementation: background CSS layers in `crabbie-port26.html`.
integration risk: LOW for artwork; engine reuse documented under decor motion.

## 7. Home Decisions

### Hero — SPECIAL CASE E

user decision: REPLACE
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: heading hierarchy, CTA destinations (portfolio/commissions), hero
image CMS binding. REPLACE governs visual/composition only, not the motion choice.
existing implementation: `section.view[data-view=home]`, `.hero-grid`, `.hero-ctas`,
`.hero-art-wrap`; `src/site-content-cms.js`.
integration risk: LOW provided bindings survive.

### Featured works — SPECIAL CASE C

user decision: KEEP_EXACT (narrowed by user note)
motion: KEEP_EXISTING_MOTION
user note (verbatim): "chỉ giữ cái thẻ thôi, còn cái thẻ tiêu đề A few little favorites thì bỏ đi. "
canonical instruction: KEEP_EXACT applies to the featured work card implementation only.
The "A few little favorites" title/banner treatment is REMOVED. The note overrides any
broad reading of KEEP_EXACT.
technical guarantees: card stays in nav-exclusion (immediate navigation); CMS card bindings.
existing implementation: `#worksGrid`, `.work`, `[data-project]`;
`window.CrabbiePortfolio.apply`.
integration risk: MEDIUM if cards leave the exclusion list.

### Freebies strip — SPECIAL CASE D

user decision: KEEP_EXACT
motion: KEEP_EXISTING_MOTION
user note (verbatim): "thêm nút download trên trên góc trái như bản thiết kế mới, chỉ là nút trang trí không tác dụng gì"
canonical instruction: preserve the existing asset card/strip behavior. The future redesign
adds a decorative download-looking control at top-left that MUST NOT trigger any download
or navigation. Real asset opening/downloading stays on the existing behavior paths.
existing implementation: `#assetsGrid`, `.item`, `[data-asset]`;
`window.CrabbieAssets.apply`.
integration risk: MEDIUM — a future agent must not wire the decorative control to real logic.

### Commission CTA band

user decision: REPLACE
motion: NEW_MOTION (the only NEW_MOTION item)
user note: (none)
technical guarantees: tier teaser + commissions destination binding.
existing implementation: `.cta`, `.cta-tier` in `crabbie-port26.html`.
integration risk: LOW.

## 8. Portfolio Decisions

### Portfolio grid

user decision: KEEP_EXACT
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: deterministic band planner, recompute points (hydrate/filter/resize),
anti-overflow behavior; no dense auto-placement.
existing implementation: `#pfGrid`, `.is-art-ready`, `.is-image-card`, `.pf-l/.pf-t/.pf-s/.pf-w`,
`initFilter('pf')`, `planPortfolioVariants`, `syncPortfolioComposition`;
`src/portfolio-grid-core.js`, `src/portfolio-cms.js`, `src/portfolio-cms-core.js`.
integration risk: MEDIUM if recompute points are dropped.

### Portfolio search & filter

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: deterministic `data-cat`/`data-search` filtering, status + empty-state
behavior; control ids stay rebindable for adapters.
existing implementation: `#pfSearch`, `#pfChips`, `#pfStatus`, `#pfEmpty`, `initFilter('pf')`.
integration risk: LOW provided ids/contracts survive.

### Project card

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: card opens project detail; card stays in nav-exclusion for immediate
navigation; art-ready image handling.
existing implementation: `.work`, `[data-project]`, `.is-art-ready`.
integration risk: MEDIUM on exclusion-list drift.

### Portfolio empty state

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: `#pfEmpty` + reset behavior when no cards match.
existing implementation: `#pfEmpty`, `#pfStatus`.
integration risk: LOW.

## 9. Project Detail Decisions

### Detail layout

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: full block-type coverage (missing kinds lose CMS content); stationary
entry (anti-flash); list return keeps scroll position; cover containment.
existing implementation: `section[data-view=project-detail]`, `#pdTitle`, `#pdDesc`,
`#pdCover[data-cover-viewer]`, `#pdBlocks`, `#pdPrev`, `#pdNext`, `renderProject`,
`publicBlockBody`; `src/portfolio-cms.js`.
integration risk: MEDIUM on block coverage.

### Credits presentation

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: ordered junction references; label from `content.peopleCreditLabel`;
junction stores references, never copied person data.
existing implementation: `#pdCreditStrip`; `src/people-cms.js`.
integration risk: MEDIUM (People RPC integrity invariant).

### Content / media blocks

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: `publicBlockBody` handles every CMS block kind.
existing implementation: `#pdBlocks`, `publicBlockBody`.
integration risk: MEDIUM on dropped block kinds.

### Prev / next navigation

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: immediate sibling navigation; controls stay in nav-exclusion.
existing implementation: `#pdPrev`, `#pdNext`.
integration risk: LOW.

## 10. Free Assets Decisions

### Asset list layout

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: grid + search/filter behavior via adapter contracts.
existing implementation: `#faGrid`, `initFilter('fa')`, `mapFreeAsset`;
`src/free-assets-cms.js`, `src/free-assets-core.js`.
integration risk: LOW.

### Asset search & filter

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: normalized-category filtering.
existing implementation: `#faSearch`, `#faChips`, `#faStatus`, `#faEmpty`.
integration risk: LOW.

### Asset card

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: card opens asset detail via `data-asset`.
existing implementation: `.item`, `[data-asset]`.
integration risk: LOW.

### Asset detail page

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: spec/license/gallery/status render; DOM changes require matching
adapter updates.
existing implementation: `renderAsset` in `crabbie-port26.html`.
integration risk: MEDIUM (adapter–selector coupling).

### Download area

user decision: KEEP_EXACT
motion: N_A
user note: (none)
technical guarantees: download allowed only when asset is `available` AND a URL exists;
otherwise disabled with reason (product truthfulness, HIGH).
existing implementation: `#adDownload`, `#adDriveDownload`, `#adUnavailable`,
`isAssetAvailable`.
integration risk: HIGH if gating is weakened.

### Asset gallery

user decision: KEEP_EXACT
motion: N_A
user note: (none)
technical guarantees: ordered `metadata.gallery[]`, cover-first (cover index 0), shared
viewer opening.
existing implementation: `src/asset-gallery-core.js`, `#adGallery`, `#adGalleryMore`,
`[data-ad-index]`.
integration risk: MEDIUM on order/viewer wiring.

## 11. Commissions Decisions

### Tier cards

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: price/availability render; disabled-with-reason CTA when closed;
`data-form` mapping must route to the correct tab.
existing implementation: `.comm-grid`, `[data-service][data-form][data-service-slug]`;
`src/commissions-cms.js`, `src/commissions-core.js`.
integration risk: MEDIUM on form mapping.

### Service accordion

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: correct accordion open/close semantics.
existing implementation: `.acc` in `crabbie-port26.html`.
integration risk: LOW.

### Other services

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: `OTHER_SERVICES` map render into `#otherServiceDetail[aria-live]`.
existing implementation: `#miniServicesGrid[data-other-service]`, `#otherServiceDetail`.
integration risk: LOW.

### Fees & terms display

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: fee/terms content completeness.
existing implementation: `.rules-grid`.
integration risk: LOW.

### Client thanks

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: people-driven render, count-threshold modes, pause control, clones
`aria-hidden` and unfocusable, focus→browsing switch.
existing implementation: `#clientThanks`, `renderClientThanks`, `ThanksMotion`;
`src/people-cms.js`.
integration risk: LOW; mode/clone/focus rules are contractual.

### Request form (tabs)

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: `role=tab` semantics, roving tabindex, Arrow/Home/End, `.on` panel
switching; CMS schema override path.
existing implementation: `.tab-btn[role=tab]`, `.tab-panel`, `.on`.
integration risk: MEDIUM if tab semantics break (keyboard loss).

### Result / success screen

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: success shown ONLY after confirmed insert; toast + confetti on
success; generic error + preserved draft on failure (HIGH).
existing implementation: `#briefResult`, `#briefText`, `#briefEmail`,
`#commissionSubmit[aria-busy]`, `setFormState`, `isConfirmedCommissionSubmission`,
`isCommissionSubmitting`; `src/commission-requests.js`, `src/commission-requests-core.js`.
integration risk: HIGH if gates are removed (duplicates / false success).

## 12. About / Contact / Terms Decisions

### About page

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: `aboutPublicModel` fields from `cms_pages`.
existing implementation: `src/site-content-core.js` (`aboutPublicModel`).
integration risk: LOW.

### Contact page

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: same provider/semantics as footer (order, visibility, URL policy).
existing implementation: `#publicContactRows .cms-contact-row`, `#publicContactActions`,
`#copyEmailBtn`; `src/site-content-core.js`.
integration risk: LOW.

### Terms page

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: disclosure/jump structure; scrollspy `aria-current` rebound after
CMS hydration.
existing implementation: `details.tos-disclosure`, `[data-jump]`, scrollspy wiring.
integration risk: LOW (rebind required after hydration).

## 13. 404 / Loading Decisions

### 404 page

user decision: REPLACE
motion: N_A
user note: (none)
technical guarantees: 404 routing behavior stays (unknown routes, bare detail paths,
renamed slugs); focus target + recovery destinations in the new presentation.
existing implementation: `[data-view=404]`, `.v404-num`, `cmsDetailMissing`,
`startupFallback404`.
integration risk: LOW.

### Loading view (CMS pending)

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: pending detail slugs render loading, never false 404 (HIGH).
existing implementation: `[data-view=loading]`, `cmsDetailPending`.
integration risk: HIGH if the view is dropped.

## 14. Viewer / Lightbox Decisions

### Viewer chrome

user decision: KEEP_EXACT
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: `hidden` collapsing, stage model (artwork clear of controls),
safe-area bands, live announcements; restyle must not push art under controls or break
stage math (MEDIUM).
existing implementation: `#publicLightbox*` markup/CSS, `syncViewerChrome`,
`paintViewerItem` in `crabbie-port26.html`.
integration risk: MEDIUM.

### Viewer controls (gesture engine)

user decision: KEEP_EXACT
motion: N_A (the engine's motion behavior is covered by the viewer zoom-transition item
and §16; no separate motion choice was recorded for the controls)
user note: (none)
technical guarantees: 1–4x clamped zoom, bounded pan, direct drag/pinch, discrete-step
animation only; gen-guarded loads, scroll lock, history ownership, focus trap/restore,
loading/error mutual exclusion (HIGH on races/drift/focus).
existing implementation: `src/lightbox-gesture-core.js` (`window.CrabbieLightboxGesture`),
`src/lightbox-gesture.js`, `openViewerCollection`, `loadViewerIndex`, `stepViewer`,
`teardownViewerUI`.
integration risk: HIGH.

## 15. Global Features Decisions

### Music player

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL (authoritative; the old map's
"logic KEEP EXACT" phrasing referenced in the user file's constraint note is superseded)
motion: N_A
user note: (none)
technical guarantees: single stable audio element across routes; gesture-gated resume;
persisted volume/mute; playback-state attribute; hidden in admin and while typing into
fields on touch. Reuse of `src/site-motion.js` behavior is expected.
existing implementation: `src/site-motion.js` (`#crabbieMusicControl`, `applyMusic`);
settings `music{enabled,url,title,volume,loop,autoplay}`.
integration risk: LOW.

### Desktop pet

user decision: KEEP_EXACT
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: FIFO cap, click/drag/wander/dialogue, field avoidance, mobile cap.
existing implementation: `src/site-motion.js` wiring + `src/desktop-pet-core.js` pure rules;
settings `motion.pet{enabled,maxDesktop,dialogues}`.
integration risk: LOW.

### Falling candy

user decision: KEEP_EXACT
motion: KEEP_EXISTING_MOTION
user note: (none)
technical guarantees: density/viewport scaling, device and reduced-motion gates.
existing implementation: `src/site-motion.js` spawner; settings
`motion.fallingCandy/candyDensity`.
integration risk: LOW.

## 16. Motion Decisions (rebuilt from USER-LEGACY-DECISIONS.md)

Format per item: user feature decision / user motion decision / existing source /
technical constraints / future integration instruction.

- Mobile menu: KEEP_BEHAVIOR_REDESIGN_VISUAL / KEEP_EXISTING_MOTION. Source: burger/menu
  wiring in `crabbie-port26.html`. Constraints: trap + `aria-expanded` stay. Future: rebuild
  visuals, keep open/close/focus behavior and existing entrance feel.
- Toast: REPLACE / KEEP_EXISTING_MOTION. Source: `#toast`, `toast()`. Constraints: keep
  `role=status`; keep existing show/hide timing feel. Future: new toast visuals, same behavior.
- Boot overlay: REMOVE / N_A. No motion to carry; hidden gate guarantee lives in §18.
- Hero: REPLACE / KEEP_EXISTING_MOTION. Source: hero entrance/bob wiring. Constraints: heading
  order + CTA bindings. Future: new composition reusing selected hero motion behavior (SPECIAL E).
- Featured works: KEEP_EXACT narrowed by note / KEEP_EXISTING_MOTION. Card motion kept;
  section title treatment removed with the title (SPECIAL C).
- Freebies strip: KEEP_EXACT / KEEP_EXISTING_MOTION. Card motion kept; decorative top-left
  download control must be inert (SPECIAL D).
- Commission CTA: REPLACE / NEW_MOTION. Only item permitted new motion; design later.
- Portfolio grid/cards/detail/list/assets/tiers/accordion/other/thanks/result/loading-view/
  viewer chrome: KEEP_* / KEEP_EXISTING_MOTION per §§8–14. Sources: planner, cards, blocks,
  gallery, tiers, thanks, brief result, loading view, viewer chrome wiring. Constraints: the
  contractual behaviors listed in each section stay.
- Jelly: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: `JELLY_TARGETS`, `isNavigatingControl`,
  `JELLY_MS`, `__jellyRunning`, pet inner-body variant. Constraints: nav-exclusion parity,
  admin/reduced skip, transform-conflict avoidance. Future: reuse implementation as-is.
- Hover lift/wobble: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: hover/wobble CSS + wiring.
  Future: reuse as-is.
- Hero background motion: REMOVE / N_A. Ambient hero-bg motion is not carried; hero's
  KEEP_EXISTING_MOTION covers the remaining selected hero motion, not this removed layer.
- Page entrance: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: entrance keyframes + stagger.
  Constraints: suppression contract (`is-restoring`, `.is-restored-activation`, stationary
  detail) is an invariant, not aesthetic.
- Sparkle: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: burst wiring + trigger points.
- Confetti: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: burst wiring; triggers at commission
  success + admin save. Trigger points stay.
- Flower sway / bow pop: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: deco CSS.
- Thanks marquee: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: `ThanksMotion`. Constraints:
  thresholds, pacing, pause persistence, clone/focus rules.
- Decor parallax/crossfade: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: `src/site-decor.js`.
  Constraints: thresholds, prefetch margins, decode gating, coarse/reduced/admin gates.
  The current decor ARTWORK is REMOVE; the engine is preserved for future assets (SPECIAL B).
- Viewer zoom transition: KEEP_EXACT / KEEP_EXISTING_MOTION. Source: `.anim-zoom`; direct
  manipulation stays uninterpolated.
- Loading animation: REMOVE / N_A. Loading visuals are not carried; loading ROUTE correctness
  (pending view, no false 404) is a separate guarantee in §18.
- SPECIAL CASE F — removed item with untouched motion. Rule: when the parent feature is
  explicitly REMOVE and its motion selector was untouched, canonical motion is N_A —
  parent feature removed. This is normalization only: it does not change a user decision
  and does not create an UNSURE item. Applies to: boot overlay, hero background motion,
  loading animation.

## 17. Removed Features (canonical)

- Global — boot overlay (visible overlay/presentation only; hidden gate stays, §18).
- Global — decorative background artwork (engine stays, §16).
- Motion — hero background motion (remaining hero motion choice unaffected).
- Motion — loading animation (loading route correctness unaffected).
- Motion normalization: all 4 removed items canonicalize to motion N_A because the parent
  feature is REMOVE. The 3 with untouched motion selectors (boot overlay, hero background
  motion, loading animation) are N_A, not UNSURE. See SPECIAL CASE F, §16.

## 18. Technical Invariants (PRESERVE_GUARANTEE)

Carried from USER-LEGACY-DECISIONS.md. Status of every item: PRESERVE_GUARANTEE —
the redesigned application must preserve equivalent correctness. This does not require
keeping exact source code forever, only equivalent guarantees, unless the user later
changes the requirement.

1. Hash routing & route application: `parseRoute`/`routeFromLocation`/`navigate`/
   `applyRoute`/`handleHash` with echo-dedup, teardown-before-apply, 404/dashboard
   fallbacks. Visuals may change freely.
2. Back/Forward & viewer history ownership: viewer-dismiss-first, at most one
   `{crabbieViewer:true}` entry, no per-step entries, no stale restore.
3. Scroll restoration: deterministic keep/restore/top via `decideScroll`;
   `instantScrollTo` only (never smooth); clamped; same-route keep.
4. Detail→list return position: `isDetailReturn` + `.is-restored-activation` stationary
   state preserves reading context.
5. Focus traps & opener restore: mobile menu + viewer trap focus; close restores opener.
6. Viewer zoom/pan bounds: 1–4x clamp, bounded pan, resize re-clamp, direct manipulation.
7. CMS refresh after admin save: `refreshPublicCms(scope)` over 13 scopes / 5 groups;
   adapters repaint the correct containers.
8. Dirty-draft protection: `canMutateAdmin` / `shouldBlockAdminExit` /
   `shouldSetBeforeUnload` block losing unsaved work.
9. Save-conflict protection: UUID identity, `updated_at` guard, zero-row = stale,
   single-flight, revision gate, confirmed-only baselines; no slug upserts.
10. Supabase auth/RLS: `app_metadata.role==='admin'` gate; published-only reads;
    constrained visitor inserts; public key only in browser.
11. Confirmed commission submission: single-flight + busy lock + success only after
    confirmed insert; generic public errors.
12. Media deletion & purge safety: recoverable lifecycle, usage gate, fresh re-check,
    grace/scan/lease gates, manual confirmed purge, append-only audit.
13. Truthful asset downloads: availability + URL gating with disabled-with-reason states.
14. Accessibility semantics: ARIA set, live regions, keyboard maps, skip link.
15. Reduced-motion support: CSS kill + JS gates + live `matchMedia` handling.
16. Immediate navigation & nav-exclusion: delegation/exclusion parity, no animation delay.
17. Server API security: public key only; pinned, sanitized oEmbed proxy.
18. Appearance tokens & var chains: token paths, inheritance, prune-on-absent,
    `body`-hosted `--text-*`.
19. Media upload pipeline: validated split standard/TUS with fallback, SHA-256 dedupe,
    leases, retry/backoff.
20. People junction RPC integrity: `save_project_with_people` / `move_person` only;
    references, never copies.

Full rationale, sources, and per-item "what visual may still change" are recorded in
USER-LEGACY-DECISIONS.md (§ Technical Invariants) and remain the reference.

## 19. Admin Decision

user decision: KEEP_BEHAVIOR_REDESIGN_VISUAL
motion: N_A
user note: (none)
technical guarantees: save/auth/hydration machinery intact (invariants 8–10, 12, 19, 20);
Admin stays functionally intact regardless of public visual decisions. Only presentation
may change, with editor field paths and `data-adm-*` bindings preserved or rebound.
existing implementation: `crabbie-port26.html` (`#adminSidebar`, `#adminBurger`,
`#adminSaveStatus`, `#adminTopSave`, `#adminContent`); `src/admin-crud.js`,
`src/admin-media*.js`, `src/admin-cleanup.js`, `src/appearance-core.js`.
integration risk: MEDIUM on draft-path/formatter drift.

## 20. Traceability Matrix (58/58 user decisions)

| # | Area | User decision | Motion | Technical guarantee | Map section |
|---|---|---|---|---|---|
| 1 | Layout / grid system | REPLACE | N_A | no phone overflow | §5 |
| 2 | Typography | REPLACE | N_A | appearance var-chain parity | §5 |
| 3 | Color / theme tokens | REPLACE | N_A | token inheritance/pruning | §5 |
| 4 | Base buttons & controls | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | disabled semantics | §5 |
| 5 | Desktop navigation | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | routing + aria-current | §6 |
| 6 | Mobile menu | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | trap + aria-expanded | §6 |
| 7 | Footer & contact block | REPLACE | N_A | URL policy (security) | §6 |
| 8 | Toast | REPLACE | KEEP_EXISTING_MOTION | role=status live region | §6 |
| 9 | Skip link | KEEP_EXACT | N_A | equivalent bypass + target | §6 |
| 10 | Boot overlay | REMOVE | N_A | first-paint gate remains | §6 |
| 11 | Decor background artwork | REMOVE | N_A | motion engine kept separately | §6 |
| 12 | Hero | REPLACE | KEEP_EXISTING_MOTION | heading/CTA/image bindings | §7 |
| 13 | Featured works card | KEEP_EXACT | KEEP_EXISTING_MOTION | nav immediacy; title removed per note | §7 |
| 14 | Freebies strip | KEEP_EXACT | KEEP_EXISTING_MOTION | inert decorative download control | §7 |
| 15 | Commission CTA band | REPLACE | NEW_MOTION | tier teaser + destination | §7 |
| 16 | Portfolio grid | KEEP_EXACT | KEEP_EXISTING_MOTION | deterministic planner + recompute | §8 |
| 17 | Portfolio search & filter | REPLACE | N_A | deterministic filtering + ids | §8 |
| 18 | Project card | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | nav-exclusion + art-ready | §8 |
| 19 | Portfolio empty state | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | empty + reset behavior | §8 |
| 20 | Detail layout | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | block coverage + stationary + restore | §9 |
| 21 | Credits presentation | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | junction references only | §9 |
| 22 | Content / media blocks | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | all block kinds render | §9 |
| 23 | Prev / next navigation | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | immediacy + exclusion | §9 |
| 24 | Asset list layout | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | adapter contracts | §10 |
| 25 | Asset search & filter | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | normalized-category filtering | §10 |
| 26 | Asset card | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | detail opening via data-asset | §10 |
| 27 | Asset detail page | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | adapter–selector coupling | §10 |
| 28 | Download area | KEEP_EXACT | N_A | availability + URL truthfulness | §10 |
| 29 | Asset gallery | KEEP_EXACT | N_A | cover-first order + viewer | §10 |
| 30 | Tier cards | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | price/availability + form mapping | §11 |
| 31 | Service accordion | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | accordion semantics | §11 |
| 32 | Other services | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | OTHER_SERVICES + aria-live | §11 |
| 33 | Fees & terms display | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | content completeness | §11 |
| 34 | Client thanks | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | modes + pause + clone rules | §11 |
| 35 | Request form tabs | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | tab keyboard semantics | §11 |
| 36 | Result / success screen | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | confirmed-insert gate | §11 |
| 37 | About page | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | aboutPublicModel fields | §12 |
| 38 | Contact page | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | order/visibility/URL policy | §12 |
| 39 | Terms page | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | scrollspy rebind after hydration | §12 |
| 40 | 404 page | REPLACE | N_A | 404 routing behavior stays | §13 |
| 41 | Loading view | KEEP_BEHAVIOR_REDESIGN_VISUAL | KEEP_EXISTING_MOTION | no false 404 for pending slugs | §13 |
| 42 | Viewer chrome | KEEP_EXACT | KEEP_EXISTING_MOTION | hidden collapse + stage model | §14 |
| 43 | Viewer controls/engine | KEEP_EXACT | N_A | clamp/bounds/race/focus guarantees | §14 |
| 44 | Music player | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | single stable audio behavior | §15 |
| 45 | Desktop pet | KEEP_EXACT | KEEP_EXISTING_MOTION | FIFO/drag/wander/dialogue rules | §15 |
| 46 | Falling candy | KEEP_EXACT | KEEP_EXISTING_MOTION | density/viewport/gate rules | §15 |
| 47 | Jelly / press | KEEP_EXACT | KEEP_EXISTING_MOTION | exclusion/skip/transform contracts | §16 |
| 48 | Hover lift / wobble | KEEP_EXACT | KEEP_EXISTING_MOTION | existing feel reused | §16 |
| 49 | Hero background motion | REMOVE | N_A | remaining hero motion unaffected | §16 |
| 50 | Page entrance | KEEP_EXACT | KEEP_EXISTING_MOTION | suppression contract is invariant | §16 |
| 51 | Sparkle burst | KEEP_EXACT | KEEP_EXISTING_MOTION | trigger points stay | §16 |
| 52 | Confetti | KEEP_EXACT | KEEP_EXISTING_MOTION | success/save triggers stay | §16 |
| 53 | Flower sway / bow pop | KEEP_EXACT | KEEP_EXISTING_MOTION | existing feel reused | §16 |
| 54 | Thanks marquee | KEEP_EXACT | KEEP_EXISTING_MOTION | thresholds/pacing/clone rules | §16 |
| 55 | Decor parallax/crossfade | KEEP_EXACT | KEEP_EXISTING_MOTION | thresholds/gates; engine for future assets | §16 |
| 56 | Viewer zoom transition | KEEP_EXACT | KEEP_EXISTING_MOTION | discrete steps; direct manipulation raw | §16 |
| 57 | Loading animation | REMOVE | N_A | loading route correctness separate | §16 |
| 58 | Admin interface | KEEP_BEHAVIOR_REDESIGN_VISUAL | N_A | full machinery intact | §19 |

All 58 user decisions represented. No silent omissions.

## 21. Coverage Validation and Conflicts

- Resolved: 58/58 per USER-LEGACY-DECISIONS.md. Untouched required items: 0.
- UNSURE: 0. Deferred: none (matches source file).
- Removed Features (4) match source file exactly.
- Both non-empty user notes copied verbatim (§7).
- Motion choices match the Motion Decisions table for all 32 table rows.
- Removed items with untouched motion fields recorded as N_A (not UNSURE), preserving
  the source file's "Deferred: none" truth.
- Special cases A–F all represented: A/B = §6 boot overlay / decor background artwork;
  C/D/E = §7 featured works / freebies strip / hero; F = §16 removed item with untouched
  motion (canonical N_A, never UNSURE).
- Genuine conflicts between user decisions: none. Apparent tensions (REMOVE vs guarantee,
  KEEP_EXACT vs note) are handled by separating dimensions per §2: the user
  visual/behavior/motion decision and the technical invariant coexist, and neither
  overrides the other.
- Old agent-authored classifications no longer appear as design authority anywhere in
  this file; remaining technical statements describe behavior, safety, integrity,
  accessibility, dependencies, or risk only.

## 22. Summary

- The user owns all 58 design/product decisions; this file is their canonical technical
  mirror. KEEP_EXACT clusters in cards, grids, galleries, downloads, viewer, pet, candy,
  and the motion library; KEEP_BEHAVIOR_REDESIGN_VISUAL covers navigation, detail flows,
  forms, and content pages; REPLACE covers tokens, footer, toast shell, hero/CTA/404
  presentation and filters; REMOVE covers 4 surfaces whose hidden guarantees survive.
- 20 technical invariants stand as PRESERVE_GUARANTEE regardless of visual treatment.
- When resolving ambiguity, first determine which dimension the statement belongs to.
  User notes narrow the user's feature decision; feature decisions govern the user-facing
  feature/presentation; motion decisions govern motion; technical invariants independently
  constrain implementation correctness. These dimensions coexist; do not use an old agent
  classification to override any of them.
- No code, schema, CMS, animation, or routing was changed in this batch.
