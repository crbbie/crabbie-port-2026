# CRABBIE EXISTING SITE INVENTORY

Descriptive inventory only. No keep/replace decisions are made here.

## 1. Inventory metadata

- audit date: 2026-10-01 (UTC)
- repository: crbbie/crabbie-port-2026
- audited SHA: a0f04697ac4585166977001a46ba6b4074cfad87 (origin/main)
- audit branch: docs/redesign-site-inventory
- production URL: https://crabbie-port-2026.vercel.app/
- baseline tag: pre-redesign-2026-10-01
- audit scope: full repository (SPA shell `crabbie-port26.html` ~14k lines / ~1.1 MB,
  `src/*.js` browser + pure-core modules, `api/`, `scripts/`, `supabase/migrations/`,
  Vercel config, docs) plus production shell fetch. No implementation files changed.

## 2. Route / View Index

Router: hash router in `crabbie-port26.html` (`parseRoute`, `navigate`, `applyRoute`,
`handleHash`, `titleFor`). Vercel rewrites `/`, `/admin`, `/admin/:path*` to
`/crabbie-port26.html` (`vercel.json`).

| Route/View | Purpose | Visibility | Main source |
|---|---|---|---|
| `#home` (also `/` empty hash) | Landing: hero, featured works/assets, commission CTA | VISIBLE | `crabbie-port26.html` `section.view[data-view=home]` |
| `#portfolio` | Browsable portfolio grid with search + category chips | VISIBLE | `crabbie-port26.html` `section.view[data-view=portfolio]` |
| `#project/<slug>` | Single project detail (CMS or prototype fallback) | VISIBLE | `crabbie-port26.html` `section.view[data-view=project-detail]` |
| `#free-assets` | Free asset listing with search + category chips | VISIBLE | `crabbie-port26.html` `section.view[data-view=free-assets]` |
| `#asset/<slug>` | Single asset detail: specs, license, download/Drive, gallery | VISIBLE | `crabbie-port26.html` `section.view[data-view=free-asset-detail]` |
| `#commissions` | Tiers, other services, fees, client thanks, 4-tab request form | VISIBLE | `crabbie-port26.html` `section.view[data-view=commissions]` |
| `#about` | Bio, skills, experience, values, CTA | VISIBLE | `crabbie-port26.html` `section.view[data-view=about]` |
| `#terms` | 8-section Terms of Service with side nav | VISIBLE | `crabbie-port26.html` `section.view[data-view=terms]` |
| `#contact` | Letter card, contact rows, email/social actions | VISIBLE | `crabbie-port26.html` `section.view[data-view=contact]` |
| unknown / bare `#project` / `#asset` | 404 recovery view with links | CONDITIONAL | `crabbie-port26.html` `section.view[data-view=404]` |
| CMS-pending detail | Loading placeholder while CMS detail resolves | CONDITIONAL | `crabbie-port26.html` `section.view[data-view=loading]` |
| `#admin[/<module>]` | Login shell or 12-module Admin CMS | CONDITIONAL, ADMIN_ONLY (panels) | `crabbie-port26.html` `section.view[data-view=admin]` |

Route details: `SIMPLE_VIEWS` home/portfolio/free-assets/commissions/about/terms/
contact/404/loading; `ADMIN_MODULES` dashboard/portfolio/people/assets/commissions/
requests/about/terms/contact/media/cleanup/settings; `NAVKEY` maps project-detail to
portfolio and free-asset-detail to free-assets for nav highlighting; unknown admin
module falls back to dashboard; detail slugs pending on CMS render `loading`, unknown/
renamed slugs render `404` (`cmsDetailPending/Missing`, `startupFallback404`).

## 3. Global UI

### Skip link

type: VISIBLE (focus-only reveal)
location: global shell
behavior: jumps to `#main`.
source evidence: `crabbie-port26.html` `a.skip-link[href="#main"]`; CSS offscreen until `:focus`.

### Desktop navigation

type: VISIBLE, DESKTOP_ONLY (links row)
location: global (`nav#mainNav.nav`)
contains: brand (goes home), 7 links (Home, Portfolio, Free Assets, Commissions,
About, Terms, Contact), commission CTA, burger button (mobile only).
behavior: active link pill per route (`aria-current` set in `applyRoute`).
source evidence: `crabbie-port26.html` `nav#mainNav`; `.nav-links a[data-goto]`;
`a.nav-cta`; `button#navBurger[aria-controls=mobileMenu]`.

### Mobile navigation menu

type: MOBILE_ONLY, HIDDEN_UNTIL_ACTION
location: global
trigger: burger button; closes on outside click, Escape, route change.
contains: 7 navigation links + CTA.
behavior: staggered item entrance; burger morphs to X (`aria-expanded`).
source evidence: `crabbie-port26.html` `div#mobileMenu.mobile-menu`; `closeMenu`;
breakpoint hides `.nav-links` / shows burger at max-width 900px.

### Footer

type: VISIBLE
location: global
contains: brand + tagline, Explore link column, Contact column
(`ul#footContactList`, `#footEmail`, `#footTwitter`, fixed links), bottom bar
(copyright, admin entry link `#admin`).
behavior: contact links render from authored settings order; fixed links survive
empty custom lists.
source evidence: `crabbie-port26.html` `footer .foot-inner`.

### Global buttons / badges / links

type: VISIBLE (some CONDITIONAL variants)
location: global
contains: `.btn` variants (primary/yellow/purple/ghost), `.nav-cta`, `.link-pill`,
`.video-link-card` (YouTube/TikTok), `.back-link`, `.cloud-tag` colors,
`.flower-tag` (NEW/HOT), `.avail` (open/inquiry/closed), `.banner-badge`,
`.season-badge`, `.hero-badge`, `.tos-note`.
source evidence: `crabbie-port26.html` inline CSS + usages per view.

### Global decorative layers

type: VISIBLE (ambient), SYSTEM_ONLY (transition overlay)
location: global
contains: `#homeBloomTransition` boot overlay (glow + flower layer + logo +
sparkle layer), `body::before` gradient/image backdrop, `#decoration-styles`
flower (`has-flower-deco::before`) and bow (button `::before`) decorations.
source evidence: `crabbie-port26.html` `#homeBloomTransition`, `body::before`,
`#decoration-styles`.

### Global overlays / portals

type: HIDDEN_UNTIL_ACTION
location: global
contains: `#toast[role=status]` notifications; `#publicLightbox` shared viewer;
`#adminConfirmModal`, `#adminMediaModal` (picker), `#adminMediaPreviewModal`;
`input#adminGlobalFileInput`.
source evidence: `crabbie-port26.html` overlay markup near end of body.

## 4. Home

### Hero

type: VISIBLE
location: `#home`
contains: badge, intro line, H1 with accent, tagline, lede, dual CTAs (portfolio,
commissions), signature note; hero artwork panel with seasonal badge and caption.
behavior: staggered entrance; artwork gentle bob.
source evidence: `crabbie-port26.html` `.hero-grid`, `.hero-badge`, `.hero-ctas`,
`.hero-art-wrap`.

### Featured works strip

type: VISIBLE
location: `#home`
contains: section banner + `#worksGrid` cards (`data-project`) with format icon,
title, category.
behavior: cards open project detail; hover lift.
source evidence: `crabbie-port26.html` `.works`, `#worksGrid.work`.

### Freebies strip

type: VISIBLE
location: `#home`
contains: section banner + `#assetsGrid` cards (`data-asset`) with flower tag,
format, name, category.
source evidence: `crabbie-port26.html` `.assets`, `#assetsGrid .item`.

### Commission CTA band

type: VISIBLE
location: `#home`
contains: headline, copy, tier mini-cards with prices, CTA buttons.
source evidence: `crabbie-port26.html` `.cta`, `.cta-tier`.

## 5. Portfolio

### Portfolio index

type: VISIBLE
location: `#portfolio`
contains: page head (eyebrow/title/sub), search input `#pfSearch`, category chips
`#pfChips` (all/illustration/chibi/vtuber/other), grid `#pfGrid` cards
(`data-project`, `data-cat`, `data-search`), status line `#pfStatus`, empty state
`#pfEmpty` with reset-filters button.
behavior: deterministic band composition via `planPortfolioVariants()`
(`src/portfolio-grid-core.js`); art-ready reconciliation (`.is-art-ready`);
filter/search/reorder recompute variants.
source evidence: `crabbie-port26.html` `#pfGrid`, `#pfSearch`, `#pfChips`;
`src/portfolio-grid-core.js` (`window.CrabbiePortfolioGrid`).

## 6. Portfolio Detail

### Project detail

type: VISIBLE
location: `#project/<slug>`
contains: back link, eyebrow, title `#pdTitle`, description, credit strip
`#pdCreditStrip` (hidden when empty), facts (category/tags/credits/year), cover
`#pdCover` (click opens viewer), content blocks `#pdBlocks` (heading/text/image/
gif/image-text/gallery/grid/video/youtube/before-after/quote/caption/link/
divider/spacer via `publicBlockBody()`), prev/next footer nav (`#pdPrev`,
`#pdNext`).
behavior: stationary entrance (no entrance animation); prev/next navigate between
projects; Back returns to list with scroll restoration.
source evidence: `crabbie-port26.html` `data-view=project-detail`, `renderProject()`.

## 7. Free Assets

### Free asset listing

type: VISIBLE
location: `#free-assets`
contains: page head, search `#faSearch`, chips `#faChips` (all/emotes/
stream-assets/overlays/panels/icons/wallpapers/brushes/templates/psd-png/other),
grid `#faGrid` cards with flower tag, preview icon, format, name, category, tags,
availability status; `#faStatus`, `#faEmpty` with reset.
source evidence: `crabbie-port26.html` `#faGrid`, `#faSearch`, `#faChips`.

## 8. Free Asset Detail

### Asset detail

type: VISIBLE
location: `#asset/<slug>`
contains: back link, preview icon, title, category, spec list (description, format,
version, date, credit, license, update note), unavailable banner
`#adUnavailable`, download actions (`#adDownload`, `#adDriveDownload`),
preview gallery (`#adGallery`, show-more button `#adGalleryMore`), cross-link CTA.
behavior: download buttons enable only when URLs exist and availability is
`available`; unavailable assets show banner + disabled buttons; cover first with
ordered extra previews, all inspectable in shared viewer.
source evidence: `crabbie-port26.html` `data-view=free-asset-detail`; enable logic
near download wiring; `src/asset-gallery-core.js`.

## 9. Commissions

### Commission tiers

type: VISIBLE
location: `#commissions`
contains: 4 tier cards (Bust Up $70, Half Body $100, Full Body $150 by inquiry,
Chibi Full Body 380k VND) each with availability badge, thumbnail, name, price,
description, "What's included & fees" accordion, request button (`data-service`,
`data-form`).
behavior: accordion expands fee table; request button jumps to matching form tab;
closed services disable CTA with reason title.
source evidence: `crabbie-port26.html` `.comm-grid`, `.acc`, `[data-service]`.

### Other commission types

type: VISIBLE + HIDDEN_UNTIL_ACTION (detail panel)
location: `#commissions`
contains: mini-card grid (`#miniServicesGrid`, static/animated emote, bundle,
alerts, panels) + detail panel `#otherServiceDetail[aria-live]`.
behavior: selecting a mini-card (`aria-pressed`) reveals detail with entrance.
source evidence: `crabbie-port26.html` `#miniServicesGrid`; `OTHER_SERVICES` map.

### Fees & add-ons

type: VISIBLE
location: `#commissions`
contains: rule grid (tax 5%, rush +20%, private +20%, second character +50%,
background varies, commercial use terms).
source evidence: `crabbie-port26.html` `.rules-grid`.

### Client thanks carousel

type: CONDITIONAL (hidden section until People/thanks data present)
location: `#commissions`
contains: heading, body, toggle button, viewport + track list of client names.
behavior: marquee slide; pauses on hover / when offscreen (IntersectionObserver);
name tooltip pill on hover/focus.
source evidence: `crabbie-port26.html` `section#clientThanks`; thanks motion wiring.

### Commission request form

type: VISIBLE
location: `#commissions`
contains: 4 type tabs (emotes/panels/alerts/illustration, roving tabindex +
arrow/Home/End keys), per-type panels with inputs/textareas/choice radios/
file-link fields, consent checkbox `#consentBox`, submit button
`#commissionSubmit`, Terms link; success panel `#briefResult` (summary, brief
text, copy, mailto, edit actions); direct-contact card (email button, social
link, copy-email button).
behavior: CMS form schema can override fields per tab; validation (required,
email regex, consent) focuses first invalid with per-field messages; submitter
locks with busy state + single-flight flag; success only after confirmed insert
(`isConfirmedCommissionSubmission`); failure shows friendly toast, keeps draft;
edit returns to form with values intact.
source evidence: `crabbie-port26.html` `#requestForm`, `#commissionForm`,
`#briefResult`; `src/commission-requests.js`; `src/commission-requests-core.js`.

## 10. About

type: VISIBLE
location: `#about`
contains: hero (profile frame + flower tag, eyebrow, title, bio, hand note),
"What I make" chip cloud (10 chips), Experience grid (9 cards), Creative values
grid (8 cards), CTA band (portfolio/commissions/contact links).
behavior: CMS groups (skills/experience) render publicly after admin edits.
source evidence: `crabbie-port26.html` `data-view=about`; about public model in
`src/site-content-core.js`.

## 11. Contact

type: VISIBLE
location: `#contact`
contains: letter card (flap + stamp), eyebrow/title/note, reply-time badge,
contact rows `#publicContactRows` (icon + label + value), actions (email button,
social link, copy-email button `#copyEmailBtn`).
behavior: rows render authored `settings.contact.links` order/names/visibility;
legacy email/twitter values remain as fallback; unsafe values never render.
source evidence: `crabbie-port26.html` `data-view=contact`; `contactLinksSettings`
in `src/site-content-core.js`.

## 12. Terms

type: VISIBLE
location: `#terms`
contains: head, side nav (`details.tos-disclosure` + jump buttons for 8 sections),
sections (contact & process, payment & refund with table + warning panel, edits,
turnaround, files & formats, exclusions, copyright, artist rights), closing note.
behavior: scrollspy highlights current section; jump buttons smooth-scroll
(respecting reduced motion).
source evidence: `crabbie-port26.html` `data-view=terms`; scrollspy wiring.

## 13. Admin

### Login shell

type: CONDITIONAL (shown when no admin session), ADMIN_ONLY
location: `#admin`
contains: brand, title, email + password inputs, error slot, sign-in button, back
link.
behavior: failed login / metadata-only role denied / authorized login covered by
router suite; single submit listener; logout + navigation covered.
source evidence: `crabbie-port26.html` `#adminLoginShell`, `#adminLoginForm`;
`src/admin-auth.js`.

### Admin shell chrome

type: ADMIN_ONLY
location: `#admin`
contains: sidebar (`#adminSidebar`) with 12 module buttons + preview-website link
+ sign out; topbar (`#adminBurger`, eyebrow/heading/description, save-status,
EN/VI locale switch, top save button); content workspace `#adminContent`.
behavior: save disabled until one authoritative hydration succeeds; locale switch
is presentation-only (never dirties draft); dirty exit prompts once +
beforeunload warning; admin mode suppresses music/candy/pet.
source evidence: `crabbie-port26.html` `#adminRealShell`; `src/admin-draft-guard.js`;
`src/admin-hydration-core.js`.

### Dashboard panel

type: ADMIN_ONLY
location: `#admin/dashboard`
contains: welcome, quick actions (jump to portfolio/assets/requests/media),
stats, attention rows, content-health checklist + publish guard.
source evidence: `crabbie-port26.html` `renderAdminDashboard()`.

### Portfolio panel

type: ADMIN_ONLY
location: `#admin/portfolio`
contains: Items/Categories subtabs, record list with select + reorder, editor
(basic info, title/slug, card mode, category, tags, year, description, cover),
People credits picker, external links, content sections/blocks builder
(`#admNewBlockType`), publishing controls, save/delete/preview actions.
source evidence: `crabbie-port26.html` `renderAdminPortfolio*`; `src/admin-crud.js`.

### People panel

type: ADMIN_ONLY
location: `#admin/people`
contains: People / Client thank-you subtabs; search/status/thanks filters + retry;
server pager (30/page, prev/next); identity editor (display name, avatar,
avatar alt, profile URL, kind, published, show-in-thank-you); thanks settings
(enabled/heading/body).
source evidence: `crabbie-port26.html` `renderAdminPeople*`; `move_person` /
`save_project_with_people` RPCs.

### Free Assets panel

type: ADMIN_ONLY
location: `#admin/assets`
contains: Items/Categories subtabs; editor (thumbnail, file/Drive URLs, download
visibility toggles, cover alt, format, version, date, credit, flower tag,
license, update note), gallery editor, availability/published/featured/
placeholder flags.
source evidence: `crabbie-port26.html` `renderAdminAssets*`, gallery editor.

### Commissions panel

type: ADMIN_ONLY
location: `#admin/commissions`
contains: Items / Request forms subtabs; service editor (title/slug, description,
thumbnail, price/currency, alternate price, commercial/extra/background/tax/
rush/private rules, included files, canvas, delivery, availability, form link);
form editor (title/slug/description/published + question blocks,
`#admNewFieldType`).
source evidence: `crabbie-port26.html` `renderAdminCommissions*`.

### Requests panel (Inbox)

type: ADMIN_ONLY
location: `#admin/requests`
contains: lifecycle tabs (inbox/archive/trash), search/filter/refresh toolbar,
bulk actions + select-all, rows with server pager, detail editor
(answers/status/notes), archive/trash/restore/purge/hold actions with typed
bulk-delete confirmation, "email notifications not configured" panel.
behavior: server-side paging/filtering; lifecycle orthogonal to status; trash +
retention-hold gating for permanent delete (`REQUEST_TRASH_RETENTION_DAYS=30`
advisory).
source evidence: `crabbie-port26.html` `renderAdminRequests*`;
`src/commission-request-lifecycle-core.js`.

### About / Terms panels

type: ADMIN_ONLY
location: `#admin/about`, `#admin/terms`
contains: About profile fields + skills/experience repeaters (add/edit/delete/
move) + published flag; Terms title + large content field + published flag.
source evidence: `crabbie-port26.html` `renderAdminAbout()`, `renderAdminTerms()`.

### Contact / Social panel

type: ADMIN_ONLY
location: `#admin/contact`
contains: ordered link rows (label/value/visible) with move/delete/add,
unsafe-value warning.
source evidence: `crabbie-port26.html` `renderAdminContact()`.

### Media Library panel

type: ADMIN_ONLY
location: `#admin/media`
contains: toolbar (search/filter/clear, grid-list toggle, upload), upload status +
cancel, dropzone grid with inspect/alt/copy actions, bulk delete + clear,
server pagination; lazy canonical preview modal.
behavior: MIME/size validation; standard (<=6MB) vs resumable TUS (>6MB) paths;
SHA-256 dedupe reuses existing rows; deletion is recoverable tombstone flow,
blocked while media is referenced.
source evidence: `crabbie-port26.html` `renderAdminMedia*`;
`src/admin-media.js`; `src/admin-media-upload.js`; `src/admin-upload-core.js`;
`src/admin-media-safety-core.js`.

### Storage & Cleanup panel

type: ADMIN_ONLY
location: `#admin/cleanup`
contains: scan trigger, scan-complete/incomplete badge, sections (scan status,
requests lifecycle, media overview, top-10, possibly unused, protected, broken,
rowless, missing, pending, coverage), purge eligibility + one/bulk purge with
confirmation text, protect toggles.
behavior: read-only scanner keyed by canonical storage path; purge requires
complete scans, grace days, no active upload leases.
source evidence: `crabbie-port26.html` `renderAdminCleanup*`;
`src/admin-cleanup.js`; `src/media-cleanup-scanner-core.js`;
`src/media-purge-core.js`.

### Site Settings panel

type: ADMIN_ONLY
location: `#admin/settings`
contains: Settings / Navigation subtabs; groups (Branding, Typography,
Appearance, Motion, Music, SEO, Footer, Interface); color role tokens,
background modes (default/solid/gradient/image + size/position/overlay),
gradient colors + angle, saved palettes, Advanced text-color overrides (24 roles
in 7 groups with inheritance preview), music settings, navigation list editor.
behavior: preview is truthful (resolved values only, never materialized);
saves sanitize to valid leaves; hydration removes stale inline overrides.
source evidence: `crabbie-port26.html` `renderAdminSettings*`;
`src/appearance-core.js`.

## 14. Hidden / Conditional UI

### Mobile menu

type: MOBILE_ONLY, HIDDEN_UNTIL_ACTION
location: global
trigger: burger button.
contains: navigation links + CTA.
behavior: opens/closes; staggered entrance.
source evidence: `crabbie-port26.html` `#mobileMenu`, `#navBurger`.

### Toast notifications

type: HIDDEN_UNTIL_ACTION, SYSTEM_ONLY
location: global
trigger: `toast(msg)` calls (commission success, picker incompatibility, save
feedback).
behavior: auto-dismiss (~2400ms); polite live region.
source evidence: `crabbie-port26.html` `#toast[role=status]`.

### Public lightbox / shared viewer

type: HIDDEN_UNTIL_ACTION
location: global
trigger: portfolio card / asset gallery / detail cover (`data-cover-viewer`,
`data-ad-index`, `data-lightbox-src`).
contains: stage image, caption, credits, position indicator, prev/next buttons,
loading pill, error card with retry/close, zoom bar (out/label/reset/in).
behavior: single collection API `openViewerCollection(items,index,opts)`; wraps
around ends; zoom 1x-4x with clamped pan; keyboard/touch/wheel controls; history
owns at most one entry per opening (Back dismisses first); route departure tears
down without restoring stale scroll; focus trapped, opener focus restored.
source evidence: `crabbie-port26.html` `#publicLightbox` + controls;
`src/lightbox-gesture-core.js`; `src/lightbox-gesture.js`.

### Cover-inspection overlay button

type: CONDITIONAL, hover/focus-only affordance
location: portfolio cards
trigger: image cards (`.is-image-card`).
behavior: invisible overlay keeps artwork clickable with zoom cursor.
source evidence: `crabbie-port26.html` cover overlay CSS.

### Music control

type: CONDITIONAL, HIDDEN_UNTIL_ACTION
location: global (fixed corner)
trigger: rendered only when music settings enabled with URL; hidden in admin.
contains: play/pause + mute buttons, playback state.
behavior: single stable audio element across routes; autoplay resume on first
gesture; volume/mute persisted; hides while typing on touch (`is-field-focused`).
source evidence: `src/site-motion.js` `#crabbieMusicControl` (injected).

### Falling candy layer

type: CONDITIONAL, SYSTEM_ONLY
location: global (fixed, non-interactive)
trigger: candy settings; density low/normal/high scaled by viewport; off in admin
and under reduced motion.
source evidence: `src/site-motion.js` `#crabbieCandyLayer`.

### Desktop pet + speech bubble

type: CONDITIONAL, HIDDEN_UNTIL_ACTION (bubble)
location: global (fixed)
trigger: pet enabled; click / drag / wander.
contains: pet sprite, dialogue bubble with optional link.
behavior: click plays jelly + dialogue (no immediate repeat), drag pins with
threshold vs click, rAF wander avoids form fields, smaller on mobile.
source evidence: `src/site-motion.js` `.crabbie-pet`; `src/desktop-pet-core.js`.

### Decorative background layer

type: CONDITIONAL, SYSTEM_ONLY
location: global (fixed behind content)
trigger: scroll progress; only first state eager, others prefetched near their
range; decode-gated crossfade; disabled transforms on coarse pointers / reduced
motion.
source evidence: `src/site-decor.js` `#crabbieDecoLayer` (3 local PNGs).

### Admin confirm modal

type: ADMIN_ONLY, HIDDEN_UNTIL_ACTION
location: admin
trigger: dirty-draft navigation, record delete, publish guard (falls back to
native confirm where modal unavailable).
behavior: relabeled title/body/confirm per case (keep-editing vs delete).
source evidence: `crabbie-port26.html` `#adminConfirmModal`.

### Admin media picker modal + preview modal

type: ADMIN_ONLY, HIDDEN_UNTIL_ACTION
location: admin
trigger: browse buttons in editors (`data-adm-mediabrowse`) / gallery replace;
preview from picker or library.
behavior: picker grid renders owned selection separately; incompatible uploads
surface a toast; Escape closes topmost.
source evidence: `crabbie-port26.html` `#adminMediaModal`, `#adminMediaPreviewModal`.

### Boot / paint gates

type: SYSTEM_ONLY
location: global
trigger: startup and first CMS paint.
contains: `#homeBloomTransition` overlay; `cms-content-pending/ready` chrome
gating; home reveal sequencing.
source evidence: `crabbie-port26.html` `html` state classes + transition markup.

### Commission accordions / tabs / service detail

type: HIDDEN_UNTIL_ACTION (accordion bodies, service detail), CONDITIONAL (tab panels)
location: `#commissions`
trigger: fee accordion buttons; type tabs; other-service mini-cards.
behavior: grid-rows open/close + caret rotation; tab panels swap with entrance;
service detail reveals with entrance.
source evidence: `crabbie-port26.html` `.acc`, `.tab-btn/.tab-panel`,
`#otherServiceDetail`.

### Native disclosure groups

type: HIDDEN_UNTIL_ACTION (ADMIN_ONLY except Terms nav)
location: admin cleanup groups, advanced appearance sections, Terms side nav.
trigger: native `<summary>` toggle.
source evidence: `crabbie-port26.html` `details.adm-cleanup-group`,
`.adm-advanced`, `details.tos-disclosure`.

### Empty / validation / success states

type: CONDITIONAL / HIDDEN_UNTIL_ACTION
location: portfolio, free assets, commission form, asset detail, admin lists
contains: filter empty states with reset buttons; per-field validation messages;
submitter busy state; brief success panel; unavailable-asset banner + disabled
downloads; admin save-status / error copy / pager disabled bounds; email panel
`data-state` colors.
source evidence: `crabbie-port26.html` `#pfEmpty`, `#faEmpty`, `.field-error`,
`#briefResult`, `#adUnavailable`, `#adminSaveStatus`.

### Conditional badges / tags

type: CONDITIONAL
location: cards, about hero, commission tiers
contains: flower tags (NEW/HOT), availability pills, tag chips, CMS-featured ring,
marquee name pills.
source evidence: `crabbie-port26.html` `.flower-tag`, `.avail`, `.item-tags`,
`.is-cms-featured`.

### Screen-reader / system-only nodes

type: SYSTEM_ONLY
location: global
contains: lightbox live status, aria-hidden decorative layers, hidden file input.
source evidence: `crabbie-port26.html` `#publicLightboxStatus`,
`#adminGlobalFileInput`; aria-hidden layers in `src/site-motion.js`.

Note: no custom dropdown/popover/drawer components exist; filtering uses chip
buttons, admin uses modals + native details, sidebar collapses via media query.

## 15. UI State Inventory

Documented state tokens (all observed in code/CSS; no invented states):

- `hidden` attribute: lightbox parts, brief result; global `[hidden]` rule.
- `.is-active`: views, nav highlight base, hero stagger children.
- `.open`: mobile menu, admin modals, accordions, availability variants.
- `.show`: toast, empty states, service detail, pet bubble, music control.
- `.on`: chips, tab buttons/panels, language buttons.
- `.active`: desktop/mobile nav links.
- `:hover` / `:focus` / `:focus-visible` / `:focus-within`: buttons, cards, inputs,
  tooltip pills.
- `:disabled` / `[disabled]`: buttons, CTAs, mini-cards, submit, admin save,
  pagers, gated downloads.
- `[aria-pressed=true]`: chips, mini-cards (with check badge), tabs, language.
- `[aria-expanded]`: burger, admin toggles, checklist/block headers.
- `[aria-disabled]`, `[aria-busy]`, `[aria-modal]`, `[aria-hidden]`: downloads,
  submitter, dialogs, decorative layers.
- `[data-state]`: email panel (failed/pending/sent); music control
  (off/paused/playing).
- `[data-view]`: router view identity (13 values).
- `body.is-loading` / `body.is-route-loading` / `body.is-restoring` /
  `.view.is-restored-activation`: router/restore suppression states.
- `.is-hidden`: boot transition overlay.
- `.is-zoomed` / `.is-panning`: lightbox image gesture states.
- `.is-jelly` / `.is-hover-wobble` / `.is-shaking` (+ pet `.is-pet-jelly`):
  press/hover/shake feedback.
- `.is-art-ready` / `.is-image-card`: portfolio image readiness/geometry.
- `.is-cms-featured`: featured ring.
- `.is-static` / `.is-marquee` / `.is-paused` / `.is-browsing`: thanks carousel modes.
- `.is-dragging` / `.is-dropping`: pet drag states.
- `.is-field-focused`: music control hide-while-typing.
- `html` gates: `cms-content-pending/ready`, `home-reveal-sequence/active`,
  `home-transition-pending`.
- Note: no `is-navigating` token exists; navigation immediacy is handled by
  excluding navigation controls from press feedback (`isNavigatingControl`).

## 16. Behavior / Interaction Inventory

### Navigation

- `navigate(path,opts)`: saves scroll memory, honors admin dirty guard, tears
  down viewer, applies route synchronously in the same tick (hash echo deduped).
- Click delegation for `[data-goto]`, `[data-project]`, `[data-asset]`, `.work`,
  `.item`, prev/next, back links, admin jumps; navigation controls execute
  immediately with no press-animation delay.
- Nav highlighting via `NAVKEY` (detail views highlight their list parents).
- Direct URLs: `/admin*` pathname fallback resolves to admin; hash deep-links
  resolve per `parseRoute`.
- source evidence: `crabbie-port26.html` `navigate`, `applyRoute`, `handleHash`,
  `routeFromLocation`.

### History (Back / Forward)

- `popstate` captures outgoing scroll before hash handling; viewer-owned history
  entry is consumed first (Back dismisses viewer, Close/Escape consume only the
  owned entry); image steps push nothing; route departure tears down viewer
  without restoring obsolete scroll.
- Admin dirty navigation replays via `replaceState` + discard confirmation.
- source evidence: `crabbie-port26.html` `popstate` handler, `closePublicLightbox`,
  `teardownViewerForRoute`.

### Scroll

- Unified pure contract `decideScroll` (`keep` for same-route/no-scroll,
  `restore` for detail returns + Back/Forward with memory, `top` otherwise);
  `instantScrollTo` is the only route-scroll primitive (deterministic, no smooth
  interference); detail refresh re-renders in place without routing.
- Sticky navbar (`top:0`, below mobile menu layer); Terms scrollspy; thanks
  marquee pauses offscreen; decor layer reacts to scroll progress.
- source evidence: `src/route-scroll-core.js`; `crabbie-port26.html` scroll wiring;
  `src/site-decor.js`.

### Keyboard

- Escape closes mobile menu, lightbox (history-aware), admin picker/preview,
  commits inline text edits.
- Lightbox arrows: prev/next or pan when zoomed; Up/Down pan when zoomed; Tab
  focus trap.
- Commission tabs: Arrow/Home/End with roving tabindex.
- Admin save shortcut: only Ctrl/Cmd+S owns the keypress; bare `s/S` typing never
  triggers save; blocked shortcuts still suppress the browser dialog.
- Skip link focuses `#main`.
- source evidence: `crabbie-port26.html` keydown handlers; `handleAdminSaveShortcut`.

### Touch / pointer

- Viewer: 2-finger pinch zoom (1x-4x, clamped), 1-finger drag pans only when
  zoomed (else native scroll), mouse drag pans when zoomed, wheel steps zoom,
  double-tap behavior via gesture bridge; ResizeObserver/stage changes re-clamp
  without resetting zoom.
- Pet drag with 6px click threshold + pointer capture.
- Coarse-pointer enlargements (music buttons 44px), hover-zoom disabled on touch,
  safe-area insets for nav/lightbox/music.
- No `devicePixelRatio` handling found in `src/` or shell (CSS px only).
- No swipe-to-step between viewer images found (arrows/buttons/wheel only).
- source evidence: `src/lightbox-gesture-core.js` (pure math),
  `src/lightbox-gesture.js` (bridge), viewer touch/pointer handlers,
  `src/site-motion.js` pet drag.

### Viewer / lightbox

- Open single or collection with slug/opener capture; body scroll lock with
  position memory; caption/credits/position chrome sync; loading vs error states
  mutually exclusive with retry; close restores scroll (only on drift) and focus.
- source evidence: `crabbie-port26.html` `openViewerCollection`,
  `loadViewerIndex`, `stepViewer`, `paintViewerItem`, `teardownViewerUI`.

### Forms

- Commission submit pipeline: read field values (radio/checkbox aware) → validate
  (schema-aware or legacy required/email + consent) → build brief + payload →
  single-flight insert → success panel + toast + confetti, or friendly error with
  draft preserved; input clears field errors.
- Admin editors: dirty tracking per path, save scoping, conflict surfacing.
- source evidence: `crabbie-port26.html` form pipeline;
  `src/commission-requests-core.js`; `src/commission-requests.js`.

### Media

- Progressive decor loading (cold state 1 only, prefetch margin, decode-gated,
  retry-capped); art-ready image reconciliation; admin thumbnail transform
  (480px/q70); gallery batching (12-per-batch thumbs); viewer uncropped zoom.
- source evidence: `src/site-decor.js`; portfolio art-ready wiring;
  `src/admin-media-core.js`; `src/asset-gallery-core.js`.

## 17. Animation / Motion Inventory

Runtimes:

- `src/site-motion.js` (`window.CrabbieSiteMotion`): falling candy spawner
  (density + mobile scaling), desktop pet lifecycle (spawn/click/drag/wander/
  dialogue), single-instance music control, live reduced-motion handling.
- `src/site-decor.js`: fixed background crossfade + parallax (desktop
  fine-pointer only) + gentle float.
- `src/desktop-pet-core.js`: pure pet rules (spawn plan, FIFO cap, wander,
  dialogue no-repeat, clamping).

Entrance / ambient / micro-motion (all in `crabbie-port26.html` inline CSS/JS
unless noted):

- View/hero/page-head/grid entrance (`animViewIn`, `animFadeUp`, `animFadeScale`,
  hero stagger, eyebrow pop, signature reveal, footer rise); detail views and
  restored list views suppress entrance animations by design.
- Ambient: hero artwork bob, flower sway, bow pop, board sway, gentle float/
  rotate, thanks marquee, loading spinner + dots, tab/chip/status pops.
- Press/hover: jelly squash on buttons/chips/tabs/cards (nav controls excluded),
  hover wobble + lift, sparkle bursts on primary CTAs, confetti on commission
  success + admin save, card shake, see-more bob.
- Zoom/viewer: discrete transform transition for button/wheel zoom only.
- Parallax: decor background only; no hero/card parallax found.
- Reduced motion: `prefers-reduced-motion` disables ambient/entrance/press
  effects; runtime gates smooth scroll, shake, sparkle, confetti, counters,
  jelly, candy, pet loops, decor transforms (live `matchMedia` handling).
- Transitions: button/chip/tab/card transform + shadow durations.
- Unverified: `animFloatIn` keyframes defined but no application selector found;
  lightbox Enter/Space has no custom handler (native buttons only).

## 18. Data / System Inventory

### Public CMS adapters (`src/`)

All use latest-request ownership (superseded responses never publish) and fall
back to prototype content on unconfigured/failed queries (People hides instead).

| Module | Purpose | Consumed by |
|---|---|---|
| `portfolio-cms.js` (`window.CrabbiePortfolio`) | Published projects + ordered people credits per slug | Portfolio list, project detail, home works |
| `people-cms.js` (`window.CrabbiePeople`) | Published people + project association map, paged to completion | Credit strips, lightbox credits, thanks section |
| `free-assets-cms.js` (`window.CrabbieAssets`) | Published free assets | Free Assets list/detail, home freebies |
| `commissions-cms.js` (`window.CrabbieCommissions`) | Services + request forms in parallel | Commissions page + form schema |
| `site-content-cms.js` (`window.CrabbieSiteContent`) | Pages, navigation, settings; owns first-paint gate (`cms-content-pending/ready`, ready event, startup settle) | About, Terms, Contact, footer, SEO, brand, thanks |
| `public-cms-refresh.js` (`window.CrabbiePublicCmsRefresh`) | Scope → adapter refresh router for admin saves | Admin save pipeline |

Pure cores (`*-core.js`): portfolio mapping, people normalize/visibility, asset
mapping/category, commission mapping/pricing, site-content mapping (contact
links, thanks, titles, about model), appearance tokens, portfolio grid planner,
asset gallery normalize, media-link helpers (YouTube/TikTok ids), richtext
sanitize, public/admin round-trips, route-scroll contract, pet rules, lightbox
gesture math, auth codes, auth-event policy, i18n formatter, CRUD formatters,
hydration mapping, featured cap, persisted baselines, save single-flight, draft
revision, record-save plan, query/paging specs (30/page), upload strategy
(6MB split, 3 retries, SHA-256 dedupe), media allow-lists + 50MB cap, media
safety/deletion machine, media-manager targets, request validation/payload,
request lifecycle machine, cleanup scanner, purge planner, data audit, draft
guard.

### Supabase

- Client: `src/supabase-client.js` (CDN ESM client from `api/public-config.js`
  public URL + publishable key; session persistence + auto-refresh); public URL
  and key only — no privileged secrets in browser.
- Tables (foundation migration): `cms_categories`, `portfolio_projects`,
  `free_assets`, `commission_services`, `commission_forms`,
  `commission_requests`, `cms_pages` (about/terms), `cms_navigation`,
  `site_settings` (key PK), `media`, `people`, `portfolio_project_people`,
  `media_cleanup_state`, `media_upload_leases`, `admin_audit_log`.
- Migrations (`supabase/migrations/`): foundation (tables + RLS + storage
  policies + anon `SELECT published` / `INSERT commission_requests` + admin
  policies); media bucket ensure; updated-at hardening; anon grant tightening;
  category seed + back-link; media deletion safety (tombstone columns +
  audit log); admin performance indexes; media dimensions; request lifecycle
  columns (archive/trash/hold, inbox landing); cleanup state; purge safety
  (scan counts, claim columns, upload leases); people + junction + RPCs
  (`save_project_with_people`, `move_person`).
- RLS posture: anon reads published CMS rows; visitors insert requests only with
  enforced shape (length/terms/status=new/empty notes); admin role via JWT
  `app_metadata.role='admin'`; audit log admin-only; `media` Storage bucket is
  public (unsuitable for confidential files).
- APIs (`api/`): `public-config.js` (public Supabase config as JS, short cache);
  `tiktok-oembed.js` (validated TikTok oEmbed proxy, SSRF-pinned host, sanitized
  fields, 8s abort).
- Upload leases: `src/media-upload-leases.js` (2h TTL claim coordination).

### Settings / appearance

- Settings keys: `branding`, `typography`, `theme` (colors, palettes, background
  mode/image/gradient, Advanced `textOverrides` 24 roles / 7 groups),
  `motion` (decorations, falling candy + density, pet), `music` (enabled, url,
  volume, loop, autoplay), `language`, `seo` (title/description/social image),
  `footer`, `interface`, `portfolioThanks`, `contact` (authoritative ordered
  `links[]`; legacy `email`/`twitter` read-compatible fallback; unsafe values
  never rendered).
- `src/appearance-core.js` (`window.CrabbieAppearance`): strict `#RRGGBB`
  validation, canonical defaults, resolved/inherited value model, palette
  snapshot/apply, background resolver, Advanced role registry + inheritance.

### Admin editing / persistence

- Services: `admin-auth.js` (session/login/logout + dirty-aware events),
  `admin-crud.js` (loads, UUID-scoped saves, order writes, deletes, people RPCs,
  request lifecycle ops, server-paged request/media/people loads),
  `admin-media.js` (upload/delete/retry/alt/bulk/integrity),
  `admin-media-upload.js` (pipeline), `commission-requests.js` (public submit +
  admin fetch/status), `admin-cleanup.js` (scan/protect/purge),
  `admin-data-audit.js` (completeness audit bridge), `admin-draft-guard.js`.
- Contract: updates keyed by DB UUID + `updated_at` baseline (zero-row = stale
  conflict, never silent overwrite); settings per-key baselines; local baselines
  advance only after confirmed success; single-flight saves; mutation disabled
  until authoritative hydration; failed deletes keep local records; admin audit
  log append-only.

### Commission request lifecycle

- Statuses `new/reviewing/contacted/accepted/declined/closed` (admin Completed ↔
  closed); lifecycle `inbox/archive/trash` orthogonal to status; bulk ops capped
  (50) with typed delete confirmation; permanent delete trash-only +
  retention-hold gate; server paging/filtering with sanitized search.
- source evidence: `src/commission-request-lifecycle-core.js`,
  `src/commission-requests-core.js`, `src/commission-requests.js`,
  `src/admin-query-core.js`.

### Media system

- Split pipeline: validation → SHA-256 → active-digest dedupe → upload lease →
  standard (<=6MB, retried) or resumable TUS (>6MB, progress, cancel) → media
  row → lease release; TUS-unavailable falls back to standard with flag.
- Deletion lifecycle (recoverable, never one-step): active → pending tombstone →
  storage_removed → finalized; usage gate over portfolio/asset/commission/
  people/page/settings references; integrity diagnostics; idempotent retries.
- Cleanup scanner + purge planner: canonical-path reference index, protected
  flags, first-unreferenced grace anchor, complete-scan + grace-day eligibility,
  claimed single-flight batches via Storage API only.
- source evidence: `src/admin-upload-core.js`, `src/admin-media-core.js`,
  `src/admin-media-safety-core.js`, `src/media-cleanup-scanner-core.js`,
  `src/media-purge-core.js`, `src/media-upload-leases.js`.

## 19. Admin ↔ Public Relationships

| Admin panel | Public surface driven |
|---|---|
| Portfolio (+ Categories) | Portfolio list/detail route, card/cover, tags, filters, blocks, credits |
| People | Project credit strips, lightbox credits, commissions thanks section |
| Assets (+ Categories) | Free Assets list/detail, availability/downloads, gallery, filters |
| Commissions (+ Forms) | Services/pricing render; request-form schema/validation/payload |
| Requests | None directly (consumes public inserts; status/lifecycle admin-only) |
| About / Terms | About / Terms routes |
| Contact | Contact route + footer/social links |
| Media | All public imagery/files referenced across views |
| Cleanup | None directly (hygiene overview + guarded purge coordination) |
| Settings / Appearance / Navigation | Global brand/typography/colors/backgrounds/SEO/motion/music/footer/thanks copy; nav labels |
| Dashboard | None directly (overview + health + publish guard) |

Refresh wiring: `refreshPublicCms(scope)` maps each save scope to its adapter(s)
(portfolio/people/assets/commissions/pages/settings/navigation).

## 20. Mobile-Specific Inventory

- Burger + slide-down menu under 900px; sidebar drawer collapse in admin.
- Breakpoints ~1180/1100/900/860/720/640/600/560/380px + max-height + coarse-
  pointer + hover-capability queries + reduced-motion.
- Portfolio grids collapse to compact/single-column; media grids 3→2→1 columns;
  admin jumpbar hidden on wide screens; touch disables hover zoom; music buttons
  enlarge; pet shrinks; lightbox/nav/music use safe-area insets; field focus
  hides music control; no-phone-overflow + wrapping rules verified by router
  suite across 11-12 viewports.
- source evidence: `crabbie-port26.html` media queries; `src/site-motion.js`
  coarse rules; `src/site-decor.js` coarse/reduced rules.

## 21. Accessibility / Keyboard Inventory

- Skip link; per-view focus targets on route change with `preventScroll`;
  lightbox focus trap + opener restore + live status announcements; roving-
  tabindex tabs; `aria-expanded/pressed/selected/current/busy/disabled/hidden/
  modal/labelledby/describedby` across nav/menu/tabs/forms/viewer/modals/pagers.
- Native buttons/inputs/summary used for controls; focus-visible outlines;
  validation errors linked per field; decorative layers aria-hidden.
- Reduced-motion support throughout (section 17).
- source evidence: `crabbie-port26.html` focus/aria wiring; admin i18n EN/VI
  dictionary (`ADMIN_I18N`, `tAdmin`, single-dictionary rule).

## 22. Existing Error / Empty / Loading States

- Loading: boot transition overlay; CMS-pending chrome gate; `loading` view for
  pending detail; viewer loading pill; admin load states; upload progress.
- Empty: filter empty states with reset; empty CMS tables clear views (covered
  by suite); empty contact list clears rows + footer (fixed links survive).
- Error: viewer error card + retry; form field errors + friendly submit failure;
  failed admin hydration locks mutation with zero writes + retry path; save
  conflicts surface as stale (never silent overwrite); failed deletes keep
  records; failed purge/upload finalize safely; badge-count failure retries on
  next render.
- Success: brief panel + toast + confetti; save-status feedback; purge/delete
  confirmations.
- 404: unknown routes, bare detail paths, renamed CMS slugs.
- source evidence: sections 14-16 + `src/admin-hydration-core.js`,
  `src/admin-record-save-core.js`.

## 23. Unknown / Unverified Items

- Live interactive production behavior beyond shell load (music playback, form
  submission, auth) — not exercised; local suite covers these paths instead.
- `scripts/check-live-public.mjs` invocation — no npm script references it.
- `scripts/seed-*.mjs` contents — not read (dev/seed helpers, out of scope).
- `animFloatIn` keyframes application selector — defined, no usage found.
- Lightbox Enter/Space custom handling — none found (native buttons only).
- Swipe-to-step between viewer images — not found (arrows/buttons/wheel only).
- `devicePixelRatio`/DPR handling — no occurrences in shell or `src/`.
- `src/nav-motion-core.js` source module — does not exist; only
  `src/nav-motion-core.test.mjs` (tests router/motion settlement behavior).
- SOURCE: UNRESOLVED — none remaining at item level; every inventoried item has
  at least a file-level evidence reference above.

## 24. Inventory Coverage Summary

- Routes/views inventoried: 13 (11 public incl. 404 + loading, admin shell with
  login + 12 panels).
- Visible UI groups/items: ~45 (global shell, per-view sections, admin panels).
- Hidden/conditional UI items: ~25 (menu, toast, viewer + chrome, music, candy,
  pet, decor, modals, gates, accordions/tabs, disclosures, state banners,
  badges, SR-only nodes).
- Meaningful states inventoried: ~30 tokens (section 15).
- Behavior categories: navigation, history, scroll, keyboard, touch/pointer,
  viewer, forms, media (8).
- Data/system categories: CMS adapters, pure cores, Supabase (tables/RLS/
  migrations/RPCs), server APIs, settings/appearance, admin persistence,
  request lifecycle, media pipeline/deletion/cleanup (8).
- Mobile-only / conditional worth noting: burger menu, touch gesture set,
  coarse-pointer adaptations, safe-area wiring, viewport-collapsed grids,
  field-focus music hiding, admin drawer.
- Completeness cross-check: routes ↔ `parseRoute`/`SIMPLE_VIEWS`/`ADMIN_MODULES`
  ✓; HTML sections ↔ per-view inventory ✓; event wiring ↔ behavior inventory ✓;
  responsive CSS ↔ mobile inventory ✓; admin UI ↔ 12 panels ✓; CMS/supabase ↔
  adapters + migrations ✓; tests ↔ 40 unit files + 7 scripts ✓; production
  shell fetch ✓ (all views present).
- Pre-existing issue discovered: none blocking. Observation only: static shell
  carries intentional prototype/fallback tokens that resolve after CMS
  hydration (already recorded in BASELINE.md). No fix applied.
- Checks run: `npm run check:foundation` (PASS); `npm run test:router` (all
  checks PASS at baseline commit; runner hit the 120s tool timeout during final
  teardown, not a test failure). No implementation changed for any check.
