# seo.md

## Current SEO support

Site Settings currently support:

- SEO title;
- SEO description;
- social image.

Runtime behavior applies these to:

- `document.title`;
- `meta[name="description"]`;
- `meta[property="og:image"]`.

The router also sets route-specific document titles for core views and detail pages.

## Route rules

When adding or renaming a public route:

- update route parsing;
- update `titleFor(...)`;
- make sure detail routes use the correct project/asset title;
- preserve a real 404 title for unknown routes.

Do not leave a new public page with an unrelated admin/home title.

## Content rules

- Keep titles descriptive and human-readable.
- Avoid stuffing keywords.
- Portfolio/project titles should reflect the artwork/project name.
- Free asset titles should state what the asset is.
- Commission pages should describe the service clearly rather than using vague sales language.

## Social images

Use Media Library URLs only for content intended to be publicly reachable. The current media bucket is public.

## Missing infrastructure

The repository currently has no verified:

- `robots.txt`;
- `sitemap.xml`.

Do not claim sitemap/robots support exists unless those files are added.

If stable crawlable non-hash routes or static SEO landing pages are introduced later, revisit sitemap, robots, canonical URLs, structured data, and per-page Open Graph metadata.
