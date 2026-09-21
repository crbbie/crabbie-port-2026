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
- 860px
- 720px
- 380px

### Admin breakpoints currently used

- 1100px
- 1000px
- 900px
- 860px
- 720px
- 640px

Preserve these unless a focused responsive refactor deliberately consolidates them.

Important current behavior:

- admin split/editor layouts collapse to one column around tablet widths;
- admin rows become one column on small screens;
- media grid reduces columns responsively;
- media toolbar stacks on narrow screens;
- public navigation switches to mobile behavior.

After responsive changes, verify at least desktop, tablet, and mobile widths with `npm run test:router` or equivalent browser checks.

## Accessibility basics

- Preserve keyboard-focusable controls.
- Keep `aria-busy`, `aria-expanded`, `aria-current`, and disabled semantics where already used.
- Respect `prefers-reduced-motion`.
- Do not encode critical status only by color.
