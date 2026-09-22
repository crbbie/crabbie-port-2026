# supabase.md

## Supabase role in this project

Supabase provides:

- Auth for admin login;
- Postgres/Data API for CMS and commission data;
- Storage for Media Library files.

The browser uses a publishable key. Privileged authorization is enforced with RLS and server-controlled `app_metadata.role`.

## Main tables

| Table | Purpose |
| --- | --- |
| `cms_categories` | Portfolio / asset categories |
| `portfolio_projects` | Portfolio projects |
| `free_assets` | Free downloadable assets |
| `commission_services` | Commission offerings/pricing |
| `commission_forms` | Dynamic commission form definitions |
| `commission_requests` | Submitted commission requests |
| `cms_pages` | About and Terms |
| `cms_navigation` | CMS navigation |
| `site_settings` | Key/value site configuration |
| `media` | Storage metadata and deletion state |
| `admin_audit_log` | Append-only admin/media audit trail |

## Important relations

- `portfolio_projects.category_id → cms_categories.id ON DELETE SET NULL`
- `free_assets.category_id → cms_categories.id ON DELETE SET NULL`
- `commission_requests.service_id → commission_services.id ON DELETE SET NULL`
- `commission_requests.form_id → commission_forms.id ON DELETE SET NULL`

Keep `SET NULL` for these relations by default. It preserves historical/content records when a category/service/form is removed instead of cascading deletion.

## RLS

All application tables in the foundation migration enable Row Level Security.

Public access is intentionally limited:

- published categories/projects/assets/services/forms/pages/navigation are readable publicly;
- site settings are readable publicly;
- visitors may insert a commission request only under constrained conditions;
- admin mutations require authenticated JWT `app_metadata.role = 'admin'`.

Do not disable RLS to fix a query. Fix the policy, query, role, or data model instead.

## Keys and environment

Browser-safe configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never ship a service-role key to the browser.

`.env` and `.env.local` are ignored. Do not commit real secrets.

## Migration policy

Migration directory:

```text
supabase/migrations/
```

Current naming pattern:

```text
YYYYMMDDHHMM_description.sql
```

Rules:

1. Never edit an old migration that may have already run in production.
2. Create a new forward migration for every schema/policy/index change.
3. Preserve existing data by default.
4. Prefer additive/backward-compatible changes first, then cleanup later.
5. For destructive changes, include a verified migration/backfill/recovery plan.
6. Keep RLS/grants explicit.
7. Run `npm run check:schema` after schema/security changes.
8. If production migration execution is available, verify the exact target project before applying it.

There is currently no repository script that proves which migrations have been applied to production.

## Admin write identity and concurrency

Do not write admin records by slug.

- Hydrated DB UUID is the update identity.
- New record without DB UUID is inserted.
- `updated_at` is an optimistic-concurrency baseline.
- A guarded update that matches zero rows is a conflict.
- Only confirmed DB responses may advance local identity/baseline state.

Settings follow the same principle with per-key baselines.

## Hard-delete policy

### Never hard-delete in normal application behavior

- `admin_audit_log`

### Media

Media must use the recoverable lifecycle:

```text
active
→ pending
→ remove Storage object
→ storage_removed
→ delete metadata row
```

A partial failure must remain recoverable/retryable.

### Commission requests

Requests use the deliberate lifecycle `Inbox ⇄ Archive → Trash → Permanent Delete`
(`archived_at` / `deleted_at` / `retention_hold`; see migration
`202609220001_commission_request_lifecycle.sql`). Lifecycle never rewrites
business status, Trash is read-only in Admin, permanent delete requires Trash +
no retention hold, and bulk operations are capped at 50/batch with per-record
outcomes. Do not add a casual one-click hard-delete outside this workflow.
Treat requests as business records containing personal data.

### CMS content

Normal CMS records may be deleted after confirmation when references and user impact are understood.

## Storage

Current bucket:

```text
media
```

It is a public bucket.

Anonymous metadata/object listing has been restricted, but knowing an object URL can still make the file reachable. Therefore:

- do not upload confidential client files;
- do not assume draft/unpublished files are private;
- do not describe Media Library as private storage.

A future private-draft/promote-to-public design is documented in migration comments but is not implemented.

## Media limits and metadata

- Max upload size: 50 MB.
- Explicit image/video/audio/PDF/ZIP allowlist.
- SHA-256 supports duplicate detection.
- Width/height metadata is optional and currently recorded for new image uploads where available.
- Historical width/height values may remain null.

## Generated DB types

The current codebase does not use generated TypeScript database types. Mapping is handwritten JavaScript. If generated types are introduced later, document the generation command here.
