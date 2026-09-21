# legal.md

## Current legal/product behavior

The site has a Terms of Service page.

Commission submission requires the visitor to accept Terms before a request can be inserted.

The database also enforces `terms_accepted` for visitor commission inserts.

Keep the UI and database rule aligned.

## Rules for legal/commercial copy

AI may edit Terms, pricing, licensing, refund, turnaround, copyright, or usage copy when the task explicitly concerns that content, but must not invent business promises that are not supported by existing policy or owner-provided requirements.

Do not invent or silently add:

- guaranteed delivery dates;
- guaranteed refunds;
- lifetime support;
- ownership/copyright transfer promises;
- licensing rights;
- privacy/data-retention promises;
- tax/legal claims;
- jurisdiction/dispute terms.

If a requested legal/commercial rule is missing, phrase the UI conservatively or mark it for owner content rather than fabricating a binding promise.

## Pricing consistency

Commission prices, currency, availability, and add-on rules displayed publicly must match the CMS data saved by admin.

Avoid duplicating a price in multiple hard-coded locations where one can drift from another.

## Commission request records

Commission requests contain personal data.

Normal product behavior should not expose these publicly or add casual bulk hard-delete controls.

A genuine privacy deletion request should be handled through a deliberate deletion/anonymization process rather than generic content deletion.

## Free assets

For downloadable assets, displayed license/credit requirements must match the actual intended usage terms. Do not label an asset “free for any use” unless that policy is explicitly present.

## Scope

These repository rules protect consistency and avoid fabricated promises. They are not a substitute for jurisdiction-specific legal advice when the owner intentionally changes Terms, privacy policy, tax treatment, or licensing contracts.
