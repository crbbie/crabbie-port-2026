# AGENTS.md

## Purpose

This repository is the Crabbie portfolio / free-assets / commission website. AI agents may make repository changes autonomously when a task requires them, including code, UI, tests, dependencies, configuration, migrations, commits, pull requests, and merges, as long as the safety rules below are preserved.

Whenever a change materially alters architecture, data behavior, security, UX rules, product flows, or deployment assumptions, update the relevant rule file in the same change.

## Read before editing

Read only the rule files relevant to the task:

| Task | Read first | Main code areas |
| --- | --- | --- |
| UI / layout / responsive | `ux-rules.md` | `crabbie-port26.html` |
| Public page / route | `project.md`, `architecture.md`, `seo.md` | router/views in `crabbie-port26.html`, public CMS modules |
| Admin CRUD | `architecture.md`, `supabase.md`, `security.md` | `src/admin-*.js`, `src/*-core.js` |
| Database / schema | `supabase.md`, `security.md` | `supabase/migrations/`, admin mapping/write modules |
| Auth / permissions | `security.md`, `supabase.md` | `src/admin-auth*.js`, RLS migrations |
| Forms / commission flow | `ux-rules.md`, `project.md`, `legal.md` | commission form in HTML, `src/commission-requests*.js` |
| Media | `supabase.md`, `performance.md`, `security.md` | `src/admin-media*.js`, media migrations |
| Copy / sales content | `copywriting-sales.md`, `legal.md` | CMS content, settings, public views |
| Deploy / Vercel | `architecture.md`, `security.md` | `vercel.json`, `api/` |

## Fast execution mode — default

Mặc định ưu tiên hoàn thành task nhanh và trực tiếp.

### Với task nhỏ / localized
Ví dụ: đổi màu, đổi text, spacing, size, CSS, animation nhỏ, chỉnh một component, sửa một bug có vị trí rõ ràng.

**Phải:**
- tìm đúng selector/function/component liên quan;
- inspect phạm vi nhỏ nhất cần thiết;
- sửa trực tiếp;
- kiểm tra nhanh phần vừa sửa;
- kết thúc.

**Không được mặc định:**
- audit toàn project;
- explore nhiều file không liên quan;
- chạy full test suite;
- chạy full build;
- chạy safety checks dài;
- đọc nhiều documentation/rules không liên quan;
- refactor code ngoài scope;
- tìm thêm bug khác;
- chờ background command không cần thiết;
- viết báo cáo dài.

Nếu thay đổi chỉ ảnh hưởng 1–3 file, ưu tiên chỉ inspect những file đó.

### Verification cho task nhỏ
- Chỉ chạy check/test trực tiếp liên quan đến phần vừa thay đổi.
- Nếu thay đổi thuần CSS/text/layout đơn giản và có thể xác minh bằng code inspection, không cần chạy toàn bộ test suite.

### Khi nào mới dùng DEEP MODE
Chỉ mở rộng investigation/test khi task liên quan đến:
- database/data loss
- authentication
- permissions/RLS
- persistence/save/load
- migration
- API
- security
- cross-component architecture
- production deployment
- bug không xác định được root cause

Hoặc khi user chủ động yêu cầu:
- audit
- investigate deeply
- test everything
- review toàn project

### Priority
Khi yêu cầu của user rõ ràng và nhỏ:
- **DO THE REQUESTED CHANGE FIRST.**
- Không biến một cosmetic edit thành một audit.
- **Mục tiêu mặc định:** `minimum exploration → minimum change → targeted verification → finish`
- Không hy sinh correctness, nhưng cũng không thực hiện các bước không tạo thêm giá trị thực tế.
- Với task nhỏ, báo cáo cuối chỉ cần: `changed`, `file`, `done`. Không cần giải thích dài trừ khi có lỗi/risk.

## Repository facts

- Package manager: npm.
- Lockfile: `package-lock.json`.
- Use Node 20+ for the current Playwright toolchain unless the repository later pins another compatible version.
- The app is a vanilla HTML/CSS/JavaScript SPA, not React/Next/Vite.
- Main SPA file: `crabbie-port26.html`.
- Backend services: Supabase Auth, Postgres/Data API, Storage.
- Hosting/runtime config: Vercel.
- There is no build script and no dev script in `package.json`.

## Commands

Run the smallest relevant set, then run the full safety set for cross-cutting changes.

```bash
npm test
npm run test:router
npm run test:startup
npm run check:foundation
npm run check:schema
```

There is currently no lint or typecheck script. Do not claim lint/typecheck passed unless such scripts are added and actually run.

## Change workflow

1. Read the applicable rule files.
2. Locate the real root cause before changing code.
3. Prefer the smallest coherent fix over broad refactors.
4. Preserve established data-safety behavior and public flows.
5. Add or update regression coverage for bugs and behavior changes.
6. Run relevant checks, then the full safety set when the change touches routing, admin persistence, auth, media, schema, or deployment.
7. Commit with a focused Conventional Commit message.

No user approval is required between these steps for normal repository work.

## Branch and commit conventions

Use focused branch names such as:

- `fix/<short-description>`
- `feat/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

Use Conventional Commit prefixes such as `fix:`, `feat:`, `test:`, `docs:`, `refactor:`, `chore:`.

Keep visual-only changes separate from schema/data migrations when practical so UI regressions are easy to revert.

## Absolute safety rules

AI agents must never:

- force-push a shared/protected branch;
- delete the repository, Supabase project, Vercel project, domain, or other account-level resource;
- expose passwords, auth/session tokens, private keys, service-role keys, Vercel tokens, or secret environment values;
- place a Supabase service-role key or other privileged secret in browser code;
- weaken or bypass RLS/auth just to make a feature work;
- rewrite or edit migration files that may already have been applied to production; create a new forward migration instead;
- hard-delete `admin_audit_log` through normal application behavior;
- replace the recoverable media deletion lifecycle with a one-step destructive delete;
- treat the current public `media` bucket as private or suitable for confidential/unpublished client files;
- bulk-delete production data without a verified recovery/backup path;
- silently remove optimistic concurrency, single-flight save protection, dirty-draft guards, or authoritative hydration behavior.

## Production changes

Agents may prepare and apply normal non-destructive changes without asking for approval when authenticated tooling and the target project are unambiguous.

For destructive or irreversible production operations, prefer a staged/reversible alternative. If no safe alternative exists, do not execute the destructive operation automatically; leave a clear operator step instead.

Before any production schema operation:

- verify the target project/environment;
- use a new migration;
- preserve existing data by default;
- provide a rollback or recovery path when feasible;
- run repository schema/security checks.

## High-value invariants

Do not break these flows:

1. Portfolio list → portfolio detail route.
2. Free Assets list → asset detail → valid availability/download behavior.
3. Commission services/pricing render correctly.
4. Commission request form validates, prevents duplicate submission, and only reports success after a confirmed insert.
5. Admin auth/RLS and safe admin persistence remain intact.
6. Startup settlement releases the public shell (`cms-content-pending` →
   `cms-content-ready`) within its bounded window and resolves pending detail
   routes, on every route, even when the CMS module graph fails or never settles.

## Architecture guardrails

- Do not migrate the app to a framework merely to “clean it up”.
- Do not remove prototype/fallback public content unless the task explicitly replaces that behavior and tests it.
- Do not collapse standard and resumable media uploads into one path; the split is intentional.
- Put pure business/data rules in `*-core.js` when an existing core module already owns that behavior.
- Keep browser wiring/DOM logic in the SPA or browser-facing module, not in pure core modules.
- Avoid unrelated formatting or large-scale rewrites while fixing a localized bug.

## Documentation ownership

AI agents own upkeep of these rule files. Update them in the same change whenever repository reality changes enough to make a rule stale.
