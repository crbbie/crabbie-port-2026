# project.md

## Product purpose

Crabbie provides design and streaming assets for people who need usable creative resources for personal or creator use, while also showcasing Crabbie's illustration work and commission services.

The product creates value by helping visitors find suitable assets quickly, understand commission offerings, and send a structured commission request.

## Product user types

These are product-level user types, not all separate authentication roles.

### Visitor

A public user browsing artwork, free assets, About, Terms, and contact information.

### Commission client

A public visitor who reviews commission services/pricing and submits a commission request. No customer account is currently required.

### Admin owner

The authenticated site owner/admin who manages CMS content, commission requests, media, settings, pages, and navigation.

The code currently implements only anonymous/public access plus an authenticated `admin` authorization role.

## Core public views

- Home
- Portfolio
- Portfolio project detail
- Free Assets
- Free Asset detail
- Commissions
- About
- Terms of Service
- Contact
- 404
- Loading state

## Core admin areas

- Dashboard
- Portfolio
- People / Clients
- Free Assets
- Commissions
- Commission Requests
- About
- Terms
- Contact / Social
- Media Library
- Site Settings

## Critical user flows

### 1. View a portfolio project

Portfolio list → choose project → route resolves by project slug → project detail renders the correct saved/published content.

Never allow newly created/saved projects to resolve to 404 because public CMS state was not refreshed or the route map was not updated.

When the startup settlement gives up waiting for CMS data (module failure or
bounded timeout), an unresolved detail resolves against the prototype snapshot —
a real 404 for an unknown slug — but that substitution stays revivable, so a late
CMS snapshot still hydrates the detail. See `architecture.md` (startup
settlement contract).

### 2. View a free asset

Free Assets list → choose asset → asset detail renders metadata, availability, preview, and download action.

An unavailable/missing file must not pretend to be downloadable.

Assets may carry ordered additional previews (`metadata.gallery`): the detail
shows the cover first with extra previews below, all inspectable in the shared
viewer. Legacy cover-only assets and download semantics behave as before.

### 3. Review commission pricing

Commissions page → service details/pricing/availability render consistently from CMS data.

Pricing shown to visitors must match the data saved by admin.

### 4. Submit a commission request

Choose commission service/form → fill required fields → validate → disable duplicate submit → insert one request → only show success after confirmed persistence.

A failed submission must not show a false success state.

## Must-not-break product rules

1. Public detail routes must match the currently published CMS records.
2. Admin saves must not silently overwrite newer data or unrelated records.
3. Free asset download/availability state must be truthful.
4. Commission requests must not duplicate from double-clicks and must not claim success on failed/offline writes.
5. Unauthorized users must never gain admin data mutation privileges.

## Current intentional constraints

- The app is a single-file vanilla SPA with supporting ES modules. This is not, by itself, a bug.
- Public CMS modules may retain prototype/fallback content when a live public query fails. Do not remove this incidentally.
- The Media Library's current Storage bucket is public. It is unsuitable for confidential or unpublished client files.
