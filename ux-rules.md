# ux-rules.md

## Core UX principle

Preserve user work, tell the truth about state, and make destructive actions reversible or explicitly confirmed.

## Typography roles

Three brand faces, each with exactly one semantic role (roles are assigned by
purpose, never by font size):

- DISPLAY (`--font-display`, DFVN Starshines): hero, page and section titles.
- DECORATIVE (`--font-decorative`, iCiel Be Cool): badges, eyebrows, kickers,
  decorative labels, handwritten accents.
- BODY / INFORMATION (`--font-body`, DFVN Hogfish): paragraphs, navigation,
  buttons, lists, card info, forms, admin UI and all reading content.

Decorative type is an accent only. Reading text must stay in the body face.

## Appearance tokens

Admin > Appearance (stored under the existing `theme` site-settings key, no
schema change) exposes only semantic typography color tokens — display, accent,
body, decorative, muted — plus an optional website background image. Do not add
per-element color settings.

- Colors apply through centralized CSS variables (`--text-*` declared on
  `body` so the active palette is respected).
- The background image applies through `body::before` with a readability
  overlay; with no image the default pastel gradient/pattern is preserved.
- The admin panel must show a live preview (heading, body, decorative label,
  button/nav) that reflects unsaved changes, and a per-token reset.
- Media previews are resolved by file kind (image/audio/video/file), never by the
  storage path. Audio renders a player and has its own error message; it must
  never be shown as a broken image. Structural settings (`theme`, `motion`,
  `music`, `typography`) are merged with defaults at save time so a partial
  database row is never written back incomplete.
- The public stacking model is: background (`body::before`) → decorative
  artwork (`#crabbieDecoLayer`) → falling candy → content → pet → nav/music/modals.
  The public `body` stays transparent so the fixed background and candy layers
  remain visible; `html` carries the overscroll fallback colour (`--cms-bg-color`).
- The decorative background artwork (`src/site-decor.js`) is one fixed,
  `pointer-events:none`, `overflow:hidden` layer that crossfades the three local
  `/assets/decorations/deco-bg (N).png` images across the scroll range
  (top → ~32% → ~66% → bottom); desktop adds scroll parallax and a subtle
  floating animation, while coarse pointers (phones/tablets) keep the art
  visible and fixed with no parallax or float. Admin mode hides it and
  `prefers-reduced-motion` stops all motion. It must never add
  horizontal overflow or cover interactive content.
- Saved palettes store the whole colour group in `theme.palettes`; Apply updates
  every colour field and the live preview immediately, and the normal Save
  persists the theme key. Swatches must make each palette recognisable at a glance.
- The last applied appearance is cached in `localStorage` (`crabbie:appearance`)
  and re-applied before first paint so the loading/home transition background
  matches the site instead of flashing the default.

## Motion, music and the desktop pet
- Motion settings live under the `motion` site-settings key. Falling candy uses
  the local `/assets/decorations/candy/*.svg` assets, recycles nodes, keeps
  `pointer-events:none` and reduces density on mobile.
- The desktop pet (`motion.pet`, assets
  `/assets/decorations/pet/Desktop-Pet.gif`) rests in a bottom band, never over
  the navigation or hero. Desktop starts with a small base count and clicking
  adds pets (each dropping in from above) up to `maxDesktop` (hard max five);
  mobile shows exactly one. A deliberate drag pins the pet where it is dropped —
  it must not wander away afterwards — and a resize clamps any off-screen pet
  back inside. Dialogue `url` renders a labelled link
  (`target=_blank rel="noopener noreferrer"`); the raw address is never shown.
- `prefers-reduced-motion` disables candy and pet movement (and the hero idle
  float). Motion must never trap content or cover nav/modals/focused fields.
- Music (`music` key) uses one stable audio instance per session, so SPA route
  changes never restart the track. Autoplay failures are never fatal: playback
  starts on the first user gesture. A small public control offers play/pause and
  mute, and the visitor's mute/volume preference is remembered in `localStorage`.
  Media-field uploads show an inline progress/error/retry status so a slow audio
  upload never looks frozen, and repeated upload clicks are blocked while active.
- `html`/`body` background colour follows the visible background
  (`--cms-bg-color`) so mobile overscroll bands never reveal a mismatched colour;
  `min-height` uses `100dvh` with a `100vh` fallback.

## Loading

### Public site

The public UI intentionally hides prototype content during initial CMS hydration to avoid a visible prototype-to-live content flash.

Keep:

- `cms-content-pending` behavior;
- loading transition behavior;
- reduced-motion handling.

Do not reveal known-stale prototype content as if it were live CMS data during hydration.

### Admin

Admin load states are:

```text
idle | loading | ready | error
```

Database mutation is allowed only in `ready`.

If admin hydration fails:

- show an error/retry state;
- do not merge partial live data into an old/prototype draft;
- do not enable save/delete as if data were authoritative.

### Requests and media

Requests and Media Library have panel-level loading/error/retry states and should not block the entire admin unnecessarily.

## Save / dirty-state UX

- Field edits mark the relevant draft target dirty.
- Unsaved admin work must trigger navigation/unload protection.
- Background auth refresh must never replace an unsaved draft.
- While a save transaction is active, disable conflicting edit/save/discard actions.
- Duplicate save clicks must not create overlapping transactions.
- A save that reaches the database successfully but fails only during public refresh should say the data was saved and tell the user to reload/retry the refresh.

## Create behavior

Creating an admin item first creates a local unsaved draft. It should not silently write an incomplete database record immediately.

A new record is inserted when Save succeeds.

## Delete behavior

For saved CMS records:

1. confirm the destructive action;
2. perform the database delete;
3. remove it from local state only after confirmed DB success.

If delete fails, keep the record visible/editable locally.

Media follows its separate recoverable deletion lifecycle and usage checks.

### People deletion

- Deleting a Person is blocked while any persisted project references it (draft projects count); the dialog shows a referencing-project count/sample and offers Unpublish instead.
- Draft (unsaved) references in the current Admin session block deletion too.
- Never auto-remove credits from projects. Unpublishing keeps associations and hides the identity everywhere.
- Person deletion never deletes avatar bytes automatically.

## Confirmations

Keep confirmation for:

- deleting records;
- discarding unsaved edits;
- leaving admin with unsaved edits;
- publishing content that is missing required content;
- destructive media operations.

Do not add confirmation dialogs to harmless navigation or routine edits.

## UI-change reversibility

The owner frequently wants to undo visual changes that look worse after implementation.

For UI/layout work:

- make focused, reversible commits;
- avoid mixing visual changes with schema/data migrations;
- do not rewrite unrelated sections while adjusting one screen;
- preserve the previous working behavior unless the task explicitly replaces it;
- when a visual experiment is broad, make a checkpoint commit before the experiment so Git revert is simple.

Use Git-level reversibility rather than adding an in-app Undo feature unless the task specifically asks for user-facing Undo.

## Double-submit protection

Maintain existing protection:

### Commission form

- local in-flight guard;
- disable submit button;
- use `aria-busy`;
- only show success after confirmed persistence.

### Admin saves

- single-flight save owner;
- save controls disabled during an active transaction.

### Login

- disable sign-in action while the request is in flight.

## Error messaging

### Public users

Show friendly, actionable messages. Do not show raw database/RLS/auth internals, stack traces, SQL details, tokens, or secret configuration.

### Admin

Show a concise actionable message in the UI. Technical detail may go to developer console/logging when it does not contain secrets or personal request payloads.

Known write conflicts should use purpose-built messages such as stale-save, duplicate slug, permission, missing record, and missing/invalid field.

## Empty states

Empty states should explain whether:

- there is genuinely no content;
- no item matches current filters;
- data failed to load.

Do not use the same empty message for an error and a legitimate empty result.

## Responsive rules

### Public breakpoints currently used

- 1180px
- 900px (navigation switches to the hamburger before the desktop capsule is squeezed/overflows; 768px already overflows)
- 860px
- 720px
- 600px (commission grid and request form drop to one column on phones; tablet keeps two columns)
- 380px

### Admin breakpoints currently used

- 1185px (list/editor split: side-by-side only while the editor keeps ~560px of usable width; sum of sidebar + gutters + list + gap + scrollbar + editor)
- 1100px
- 900px
- 860px
- 720px
- 640px
- 560px (media grid drops to one card per row so five card actions stay readable)

The admin topbar height is measured by JS (`installTopbarHeightSync`) into
`--adm-topbar-h`; sticky lists and scroll offsets follow the real, possibly
wrapped topbar height rather than a fixed value.

Preserve these unless a focused responsive refactor deliberately consolidates them.

Important current behavior:

- admin split/editor layouts collapse to one column around tablet widths;
- admin rows become one column on small screens;
- media grid reduces columns responsively (one card per row on phones);
- media toolbar is grouped (upload + search / filters / view toggle) and stacks on narrow screens;
- the media preview dialog owns its width and is the single scroll region (its head keeps a close button);
- the media picker grid sizes to the dialog width, not the viewport;
- short admin forms (Contact, Footer, Typography, SEO, Music, Branding) use `.adm-editor-narrow` (~860px); creative editors keep the wider ~1000px column and Terms/About stay wide;
- Appearance shows controls beside a sticky live preview on desktop and one column (non-sticky preview after the colour groups) on mobile;
- the dashboard reads intro → quick actions → stats strip → attention/health; Data health rows stack label over a wrapping value;
- cleanup rows read path → metadata → actions on desktop and stack per record on phones; long cleanup lists are `<details open>` groups that keep their safety warnings visible;
- public navigation switches to the hamburger at ≤900px; the mobile menu is bounded by the viewport (incl. safe area) and scrolls so every item is reachable;
- the public footer keeps Brand on its own row and shows Explore/Contact in two columns on phones, falling back to one column at very narrow widths;
- the public page must have zero unintended horizontal overflow: `document.documentElement.scrollWidth <= clientWidth + 1` at 320/360/375/390/430px portrait and phone landscape. Long CMS-authored tokens (project titles with no spaces, URL descriptions, long tags, long collaborator names) must wrap (`overflow-wrap:anywhere`, grid/flex `min-width:0`) instead of widening the page. Portfolio `.work` cards share the same shrink/wrap defense. Decorative badges are bounded too: portfolio `.cloud-tag` labels are capped to the card (`max-width: calc(100% - 28px)`), grow in height instead of clipping (`min-height`, wrapping span with `overflow-wrap:anywhere` — never ellipsis/truncation), and the About `.profile-frame` keeps right-side headroom on narrow screens (`max-width: min(380px, 100% - 20px)` plus a tucked `.flower-tag` under ≤720px) so the rotated frame plus flower never pass the layout edge, even with a CMS profile image filling the frame. Root defense stays `body{overflow-x:hidden}` plus `overscroll-behavior-x:none`; never put `overflow-x:clip` on `html` — Chromium stops pinning the sticky nav when the root clips either axis. Local horizontal scrollers (client thanks, media preview) own their own overflow; the page itself never pans;
- portfolio project detail: `.pd-hero` tracks are `minmax(0,…)` with `min-width:0` children so hero content can always shrink; divider/spacer render without a numbered card, and untitled text/caption blocks drop the extra white card (one dashed frame); on phones Previous/Next share a row with Back to Portfolio on its own row; phone vertical rhythm is deliberate (compact hero gap, title→description, description→facts, facts→cover, cover→first block, final content→footnav) instead of inheriting the desktop cadence;
- portfolio project detail cover containment: `.pd-cover` owns a stable 4:3 frame with `overflow:hidden` and its direct `img` child is absolutely positioned (`inset:0`, `min-width:0`, `min-height:0`, `object-fit:cover`) so square/portrait artwork can never resize the frame, escape the rounded corners, or cover Section 01 (`#pdBlocks` always starts below the frame). Keep this scoped to `.pd-cover`; do not change the shared `publicImage()` renderer. An overlay trigger button exposes viewer inspection without touching that geometry;
- the public lightbox uses ONE remaining-space media stage on every viewport (desktop, tablet, phone portrait and phone landscape): a flex column whose flexible `.public-lightbox-stage` owns the space between the reserved close band, the visible caption/collaborator credits and the bottom zoom toolbar. The contained artwork AND the prev/next controls are centered inside that same stage (never the viewport), so ornamentation and `env(safe-area-inset-*)` bands can never push the resting artwork under a control. Hidden metadata collapses to zero space; when metadata cannot fit the dialog scrolls as one deliberate region. The stage is pointer-transparent so a backdrop click still closes the viewer, while the artwork/controls opt back in so interaction never dismisses by accident. Close/toolbar padding and position grow with safe-area insets on notch phones; close and zoom buttons keep ~44px touch targets on every viewport (base sizing, not just narrow portrait); short landscape viewports (height ≤500px) tighten both the reserved close/toolbar bands and the stage minimum so the image stage stays usable;
- the public lightbox zooms with a bounded pan, never a bare centered scale: one-finger touch drag and mouse drag pan the artwork while zoomed (at 1x the dialog keeps its normal scroll), the pan clamps so an image edge lands exactly on the stage edge, zoom stays within 1–4x, and Reset/reopen always re-center deterministically; resize/orientation re-clamps without changing the zoom level, and panning is transform-only so the root document never moves. In multi-image collections Left/Right step prev/next (with a position indicator); with a single zoomed image the arrow keys pan instead;
- lightbox captions wrap unbroken tokens (`overflow-wrap:anywhere`, `min-width:0`) so long URLs stay inside the caption pill and the dialog; collaborator names already wrap, and credit avatars keep their own 30px sizing outside the artwork zoom/pan rules;
- public motion is restrained: one short hover spring on `.work-more` (no perpetual loop), a single gentle hero float, a slow drift on Home cloud-tag labels only, and sparkle only on primary CTAs; `.is-jelly` is a short press/release squash applied strictly to interactive controls (buttons, chips, tabs, pills); navigation cards (`.work[data-project]`, `.item[data-asset]`, `.work-more`, and descendants) are excluded from jelly so navigation begins immediately without animation delays. `[data-goto]` navigation is never delayed by animation. The decorative artwork (`src/site-decor.js`) crossfades on desktop and phones, but scroll parallax and the continuous float drift are desktop/fine-pointer only — on coarse pointers the art stays visible and viewport-fixed with no transform, so the background never feels like it slides sideways while scrolling; `prefers-reduced-motion` still stops everything;
- portfolio `.work` cards keep the shared hover lift: the `.pf-grid` entrance animation must not forward-fill `transform` after it settles, and the featured resting ring (`is-cms-featured`) is scoped to `:not(:hover)` so featured and normal cards share the same lift/shadow hover feedback;
- portfolio card metadata is a bounded preview: the absolute `.meta` is capped to its card (`max-height: 100%`, overflow hidden) and `.work-title` clamps to three lines, so a pathological CMS title can never escape into the card above — normal one/two-line titles render exactly as before, and the full title stays in the DOM (screen readers, selection) and on the project detail page behind See more;
- portfolio image-only cards (`is-image-card`) use ONE coherent in-flow model at or below the desktop masonry breakpoint (1180px): the card is a normal full-width grid row with no containment (`contain:none`, `overflow` stays visible so the protruding category cloud is never clipped and the outer card contains its content through normal layout), the thumb is `position: relative` with `height: auto`, the whole artwork keeps its natural ratio (`object-fit: contain`), and the meta sits below the art (`position: static`) instead of over it. There is no separate `<=720px` crop/`contain:paint` patch — that conflicting patch was removed. A 180px minimum keeps the labeled `PROJECT IMAGE` fallback sized only while artwork is absent, loading or failed; a successfully painted source sets `is-art-ready` and releases the minimum, so wide artwork is never padded out and no empty placeholder strip remains. Lazy, cached-complete and broken sources are all handled (inline load/error plus a reconcile in `syncPortfolioCardMode`; broken artwork clears readiness and removes itself, keeping a sized labeled box). Only the artwork clips, at the thumb boundary. Above 1180px desktop keeps the masonry spans, cover fill and overlay meta exactly. The artwork renders through its own `pf-full-art` markup (never the shared `publicImage()` inline cover styles, which normal thumbnails keep), and image cards keep their viewer (not project-detail) navigation;
- portfolio grid composition is deterministic and presentation-only (`src/portfolio-grid-core.js`, mirrored inline in the SPA): desktop (>1180px) applies the repeating complete bands `[large, tall]`, `[small, small, small]`, `[wide, wide]` (six columns, 128px rows, 26px gaps), so each complete seven-card cycle has exactly one large card; only complete bands are used and an incomplete tail falls back to compact small cards. The plan is a pure function of the visible ordered count, recomputed through one shared path on hydration, reorder, filtering/search and breakpoint resize, so the same final records/order/filter always produce the same composition regardless of source slug or an earlier removal/reintroduction. Placement stays in CMS/DOM/keyboard order (never dense auto-placement). At 721–1180px ordinary cards drop to paired small bands with no legacy three-row spans, and a full-width image card ends/restarts the band so it can never stretch an unrelated multi-row card; at `<=720px` the grid is a single column with readable normal previews and natural image-card artwork with metadata underneath;
- the public music control sits below the nav/mobile menu in the stack (z-index 55) and hides while a field is focused on touch devices (display only — audio, source, mute and playback survive; blur and route changes restore it without restarting); its buttons are 44px on coarse pointers (34px stays for fine-pointer desktops);
- public editable text stays at 16px or more on touch devices at every width (search boxes and commission fields gain a coarse-pointer rule so phones, landscape and tablets never trigger iOS focus zoom); footer links grow to real 44px targets on coarse pointers via padding, with desktop sizing untouched;
- asset detail: short metadata keeps label/value side by side; long-form fields (description, usage/license, update note) stack the label over a left-aligned, full-width paragraph (authored line breaks preserved); empty optional rows stay hidden;
- asset preview galleries: the cover stays first in `.ad-preview`; additional previews render below in a responsive grid (`repeat(auto-fill, minmax(150px, 1fr))`, 3 columns on phones) with stable 1/1 boxes, `min-width:0` and no root overflow; broken thumbs keep a stable fallback box; single-image assets show no gallery section and no viewer prev/next chrome; no cover never hides valid previews;
- shared public viewer: one overlay serves Portfolio cover, asset collections and existing gallery/image-card triggers; viewport-filling modal (no Fullscreen API), fit/reset, zoom ± with status, bounded pan/pinch, prev/next with position indicator for collections, captions and optional project credits; the contained artwork and the prev/next controls center on the media stage (never the viewport), image positioning stays separate from the translate/scale gesture transform, and the pan bounds stay image-relative (`clientWidth`/`clientHeight`), re-clamped after image load, stage resize (`ResizeObserver`) and orientation changes without ever resetting zoom; loading/error/retry states with stale-request guards; focus trap, polite position/loading announcements, return to the actual opener (route fallback otherwise), preserved background lock, instant (never smooth) scroll restoration; Back dismisses before route change; controls keep ~44px targets and safe-area padding; `prefers-reduced-motion` stills the discrete zoom easing via the global rule;
- portfolio project detail: divider/spacer render without a numbered card, and untitled text/caption blocks drop the extra white card (one dashed frame); on phones Previous/Next share a row with Back to Portfolio on its own row;
- contact: the stamp takes its own row above the letter body on phones (never over the eyebrow); the email wraps naturally; the email CTA is primary with the secondary actions sharing a row;
- terms: the section badge reuses the number already in the CMS heading (never doubles); the number aligns with the first line of a multi-line heading; the mobile TOC is a collapsed disclosure with every section reachable;
- commission cards use one fixed 16/11 preview frame, so a real thumbnail and the placeholder keep the same ratio (the image is cropped to the frame, never stretched); cards share one height so the CTA rows line up, and switch to natural heights while an accordion is open so siblings gain no dead whitespace;
- the what's-included accordion expands to its content height (no fixed max-height, so nothing is clipped);
- the request form keeps the wide decorative shell but limits its reading/input column (~880px) and keeps two columns for short fields; on phones it is one column with trimmed nested padding, ≥16px inputs (no iOS focus zoom), a two-column tab group, a stacked consent block, and grouped primary/secondary result actions;
- the commission direct-email card wraps the address naturally and lays its actions out in a tidy grid on phones.

After responsive changes, verify at least desktop, tablet, and mobile widths with `npm run test:router` or equivalent browser checks.

## Navigation and motion contracts

- Route scroll uses one instant primitive (`instantScrollTo`, clamped to valid
  document bounds) so detail-to-list restores never inherit global smooth
  scrolling. Forward navigation goes to top; explicit project/asset returns
  restore the remembered list position and filters; Back/Forward restores a
  visited view with memory; direct detail loads with no memory go top.
- `navigate()` is the single navigation owner: it applies the destination
  route synchronously during activation so the active view and URL switch in
  the exact same event tick without intermediate frames or layout mismatch;
  subsequent `hashchange` events are treated as echoes and deduped by
  `handleHash`. Same-route public refresh (`sameRoute`) keeps scroll and
  focus; only genuine view/id changes scroll or move focus.
- Detail navigation is visually stationary: initial activation of `project-detail`
  and `free-asset-detail` suppresses route-level entrance animations (`animViewIn`),
  title/back-link pop animations (`animFadeUp`), and eyebrow pop animations
  (`animEyebrowPop`, keeping stationary `-2deg` rotation without overshoot).
- Restored list content is stationary: `body.is-restoring` applies during
  the restoration tick, while `.view.is-restored-activation` persists on the
  restored list view container for its entire active lifetime (suppressing
  root `animViewIn` and grid card `animFadeScale` so no delayed animations
  can trigger when `is-restoring` is dropped). Fresh navigation clears
  `is-restored-activation` and plays entrances normally. Grid entrances use
  `backwards` fill so completed entrances release hover lift.
- Semantic navigation controls (`isNavigatingControl`: `[data-goto]`,
  `[data-project]`, `[data-asset]`, `.work`, `.item`, `#pdPrev`, `#pdNext`,
  `.back-link`, `[data-admin-jump]`, `[data-admin-module]`) are strictly excluded
  from jelly squash/stretch and sparkle particle bursts (`sparkleBurst`).
  Route transitions immediately sweep any lingering `.anim-sparkle` elements
  so clicks never delay routing or leave visible artifacts across view changes.
- The public lightbox gesture policy is scale-aware: at 1x the dialog scrolls
  natively (`touch-action: pan-x pan-y pinch-zoom`); zoomed artwork owns the
  gesture (`is-zoomed` → `touch-action:none`). Drag/pinch paint transforms
  directly with no transition; only discrete zoom steps animate. Pinch,
  `touchcancel`, reset/reopen, resize/orientation bounds, keyboard, focus
  restoration and background locking are preserved.
- Reduced motion is a runtime lifecycle (`handleReduceChange`): reduced on
  stops candy/pet loops; reduced off reconciles/restarts enabled systems only.
  Pinned positions, counts and the single music instance are preserved.

## Startup, loading and fail-open

The public shell (nav, views, footer) is hidden by `html.cms-content-pending`
until the first CMS snapshot settles, so prototype content never flashes before
live content. That gate is a bounded contract, not an open-ended wait.

- A healthy load releases the gate from the CMS module: hydrated content appears
  directly, with no prototype flash, and the Home bloom animation plays in full.
- When the CMS module graph fails (CDN abort, failed module) or never settles,
  the shell still becomes visible within a bounded window (default 6s at the
  latest, usually immediately on a module failure). The visitor always keeps
  working navigation instead of a blank page.
- A direct project/asset URL that cannot be resolved because CMS data never
  arrived resolves against the prototype snapshot: a known prototype record
  renders, an unknown slug shows the real 404. A loading view is never permanent.
- If the CMS data does arrive later, it still hydrates normally and can revive
  the detail the visitor asked for. Fail-open never fabricates data and never
  rewrites history or returns the visitor to an earlier route.
- The Home load animation is decorative: if it is disabled (reduced motion),
  absent (deep link) or fails, the page must still be fully usable, scrollable
  and visible without it.
- Reduced motion keeps its guarantee: no bloom overlay, no reveal stagger, and
  no scroll lock.

## Accessibility basics

- Preserve keyboard-focusable controls.
- Keep `aria-busy`, `aria-expanded`, `aria-current`, and disabled semantics where already used.
- Respect `prefers-reduced-motion`.
- Do not encode critical status only by color.

## People visibility and thank-you motion

- Published off: no public credits or thank-you entry. Published on + thank-you off: project credits only. Published on + thank-you on (with avatar): eligible for both.
- A blank profile URL renders a plain-text identity; only valid `https://` URLs become `target=_blank rel="noopener noreferrer"` links.
- The client thank-you section (Commissions, stored under the legacy `portfolioThanks` settings key) hides entirely with zero eligible people; 1–5 render a static centered list; 6+ progressively enhance to a desktop marquee.
- The marquee is one CSS transform animation (no JS loop), pauses on hover, route change, hidden page or offscreen section, and honors an explicit session-persistent Pause/Resume control plus live `prefers-reduced-motion` changes.
- Keyboard focus into marquee items stops the animation, drops visual clones and restores a scrollable canonical list with revealed names until Resume; clones are `aria-hidden` with no focusable descendants, so there are never duplicate focus stops.
