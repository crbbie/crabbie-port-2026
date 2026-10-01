# CRABBIE PRE-REDESIGN BASELINE

Date: 2026-10-01 (UTC)
Repository: crbbie/crabbie-port-2026
Production URL: https://crabbie-port-2026.vercel.app/

Main branch: main
Main SHA: a0f04697ac4585166977001a46ba6b4074cfad87
Baseline branch: baseline/pre-redesign-2026-10-01
Baseline tag: pre-redesign-2026-10-01

## Production verification

- Home: OK — production root loads, hero content present.
- Navigation/routing: OK — nav (Home, Portfolio, Free Assets, Commissions, About, Terms, Contact) present; `/admin` rewrite serves the SPA shell (verified via fetch).
- Portfolio: OK — portfolio list view present in production shell.
- Portfolio detail: OK — project detail view present in production shell.
- Free Assets: OK — free assets list view present in production shell.
- Commission: OK — commission tiers, fees, and request form present in production shell.
- Contact: OK — contact view present in production shell.
- Terms: OK — terms view present in production shell.
- Music/legacy interactions: PRESENT — `#crabbieMusicControl` wiring exists in repo (`src/site-motion.js`, `crabbie-port26.html`); local `npm run test:router` PASS covers music control behavior. Interactive playback on live production: UNKNOWN (not exercised in this batch).
- Other relevant routes: OK — 404 view and Admin shell present in production shell.

Local regression at baseline commit: `npm run check:foundation` PASS; `npm run test:router` PASS (all checks passed before suite timeout on completion).

Status: CURRENT PRODUCTION VERIFIED (static shell + routing; live interactive behavior beyond shell load not exercised)

## Known pre-existing issues

No known blocking issues observed during baseline verification.

Observation (non-blocking, pre-existing): the static pre-hydration shell contains
fallback/placeholder tokens (e.g. `YEAR`, `[PROJECT TAGS]`, `File not available yet`).
Per `architecture.md` / `project.md`, prototype/fallback content alongside live CMS
data is intentional and resolves after CMS hydration — not a regression signal.
- existed before redesign: yes

## Important rule

This baseline represents the website BEFORE the visual redesign.

No redesign work is included in this baseline.

The existing repository remains the source of truth for application logic,
CMS, Supabase integration, routing, Admin, data wiring, and selected legacy
components/motion.
