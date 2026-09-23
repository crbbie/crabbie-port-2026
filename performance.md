# performance.md

## Current strategy

The project favors small public CMS queries, paged growing admin datasets, transformed media thumbnails, and resumable large uploads.

Do not regress these behaviors while simplifying code.

## Admin paging

Current default page sizes:

- Commission Requests: 30
- Media: 30
- People / Clients: 30 (server-side search, filters and 30-record pages)

Requests and media are intentionally not part of the main full admin hydration. They load per panel/page.

Do not replace this with “load every request/media row then filter in JavaScript”.

## Public People queries

- People and project-people reads paginate to completion (never truncated at the API default row cap), use explicit column lists and deterministic `sort_order,id` ordering, and resolve associations without N+1 requests.
- The thank-you marquee uses one CSS transform animation (duration from group width at ~24 CSS px/second), one controller owning a bounded IntersectionObserver/ResizeObserver pair, and pauses offscreen/hidden — no timers, rAF loops or DOM growth on refresh.

## Query rules

- Use explicit select column lists.
- Avoid `select('*')` in growing admin queries.
- Keep filtering/sorting server-side for requests/media.
- Avoid N+1 queries in list views.
- Preserve indexes matching real filter/order/FK patterns.
- When adding a growing collection, paginate from the start.

## Media rendering

Use transformed thumbnail URLs for grids/lists when possible.

Use the canonical original for:

- full preview when required;
- download;
- media where transformation is unsupported.

Do not render large original artwork everywhere just because the public URL exists.

## Upload pipeline

Current rules:

- upload max: 50 MB;
- files up to about 6 MB use standard upload;
- larger files use resumable TUS when available;
- transient retry is bounded;
- SHA-256 dedupe can reuse an active identical file;
- upload paths are unique and uploads do not overwrite existing objects;
- immutable uploaded objects use one-year cache control.

Do not merge standard/resumable transfer code if that removes resumability, bounded retry, progress/cancel, or safe fallback.

## Caching

- Uploaded immutable media currently uses `cacheControl=31536000`.
- `api/public-config.js` is cached for 300 seconds.

Do not cache user-specific/authenticated admin data in a public/shared cache.

## Performance targets

These are engineering targets, not claims that current production metrics were measured:

- interactions should show immediate visual feedback instead of appearing frozen;
- route/detail navigation should not trigger avoidable full-data reloads;
- grids should use thumbnails, lazy/conditional loading where practical, and bounded DOM work;
- growing admin datasets should remain paged;
- new queries should have a clear index story when they introduce new filter/order patterns.

If a feature appears slow, measure the query/network/render bottleneck before rewriting architecture.
