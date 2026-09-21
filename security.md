# security.md

## Security model

Admin security is a combination of:

1. Supabase Auth;
2. client-side admin gating for UX;
3. Postgres/Storage RLS for actual authorization.

Never rely on “the admin button is hidden” as the security boundary.

## Admin authorization

Admin access is based on server-controlled auth metadata:

```text
user.app_metadata.role === "admin"
```

Do not authorize admin behavior from editable `user_metadata`, query strings, localStorage flags, or client-only booleans.

## Browser Supabase client

Current auth client behavior includes persisted sessions and auto-refresh.

The browser may receive:

- Supabase project URL;
- Supabase publishable key.

These are not privileged secrets.

The browser must never receive:

- service-role key;
- database password;
- Vercel token;
- private API secret;
- other privileged server credentials.

## Sensitive data

Treat these as sensitive/private:

- commission client name;
- client email;
- contact/social handle when submitted privately;
- commission request answers;
- auth/session tokens;
- passwords;
- private environment variables;
- Supabase/Vercel privileged credentials.

Do not log complete commission request payloads or passwords.

Do not include sensitive request data in public URLs, analytics labels, error messages, or public HTML.

`admin_audit_log.actor_email` is an admin-only audit field and must never be exposed publicly.

## RLS

Keep RLS enabled.

Do not introduce blanket policies such as `using (true)` for private/admin data just to resolve a frontend error.

Public read/write rules must stay intentionally scoped:

- only published CMS content is public;
- visitor commission inserts are constrained;
- admin management requires admin role.

## Media privacy limitation

The `media` bucket is public.

Removing anonymous listing does not make individual object URLs private.

Therefore never upload:

- confidential client references;
- private contracts;
- unpublished sensitive work;
- secrets;
- files whose confidentiality depends on obscurity.

If true private media is needed, implement a private bucket/signed-URL/promotion design rather than pretending the current bucket is private.

## Security headers

Vercel currently sends:

- `X-Content-Type-Options: nosniff`
- strict-origin referrer policy
- restrictive Permissions Policy
- `X-Frame-Options: SAMEORIGIN`

A Content Security Policy is intentionally not enabled yet because the app still depends on inline scripts/styles and runtime CDN ESM imports.

Do not ship a strict CSP without first making the application compatible and testing it.

## Error handling

Public UI must not expose:

- SQL/PostgREST internals;
- RLS policy details;
- stack traces;
- auth tokens;
- environment values.

Admin UI should prefer friendly categorized errors. Technical diagnostics belong in developer tooling/console and must still avoid secrets and personal request payloads.

## Dependency/config changes

Agents may update dependencies or Vercel configuration when the task requires it without user confirmation, but must:

- keep changes scoped;
- avoid unnecessary major-version churn;
- run relevant regression checks;
- verify security headers/rewrites when changing `vercel.json`.

## Forbidden destructive operations

Never automatically:

- force-push shared branches;
- delete production projects/repositories/domains;
- disable RLS;
- expose secrets;
- destroy audit logs;
- perform unrecoverable bulk production deletion.

Use a staged, recoverable alternative instead.
