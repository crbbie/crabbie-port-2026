# Crabbie data foundation plan

## Audit

The project is one 4,068-line HTML prototype. Its layout, CSS, responsive rules, hash routing, and animations all live in `crabbie-port26.html`. The public catalog uses hard-coded `PROJECTS`, `ASSETS`, and `OTHER_SERVICES`. The admin derives mock data through `buildAdminData()`, saves only by assigning in-memory `ADMIN_DATA`, and creates fake upload URLs. `localStorage` is limited to presentation preferences. The commission form states that it is a local-only prototype and does not persist requests.

## Batches

1. Foundation: config/client/migration/RLS/Storage/Vercel boundary; no UI redesign.
2. Public CMS reads: portfolio, assets, commissions, pages, navigation, settings, retaining prototype fallback.
3. Authenticated admin CRUD: replace mock load/save and protect the existing admin UI.
4. Storage upload and commission request persistence.
5. Seed existing data, validate RLS, connect GitHub, set Vercel environment variables, deploy.

## Decisions

- Preserve the existing HTML as the deployed page source and add integration scripts only.
- The Vercel endpoint supplies only public Supabase credentials; no service-role key is browser-accessible.
- Admin access is checked with server-controlled `app_metadata.role = "admin"`.
- Flexible prototype fields live in JSONB while publish state, ordering, keys, and relationships remain relational.
