import assert from 'node:assert/strict';
import {
  createAssetDraft,
  formRelationshipOptions,
  normalizeRequestFormFields,
  formattedCommissionPrice,
  CONTACT_ROLES
} from './admin-roundtrip-core.js';
import { formatAssetRow, formatCommissionRow, formatPageRow, formatPortfolioRow } from './admin-crud-core.js';
import { buildAdminWritePlan } from './admin-record-save-core.js';
import { mediaRowPayload } from './admin-upload-core.js';
import { formatMediaItem } from './admin-media-core.js';
import { mapCommissionService } from './commissions-core.js';
import { mapAdminHydrationResults } from './admin-hydration-core.js';

// A missing explicit default used to serialize a new asset as unavailable.
assert.equal(createAssetDraft({ id: 'client-asset', slug: 'new-asset' }).availability, 'available');

// A Commission stores a persisted form slug, never a stable local UI identity.
assert.deepEqual(formRelationshipOptions([
  { id: 'client-123', slug: 'contact-form', title: 'Contact form' }
]), [{ value: 'contact-form', label: 'Contact form' }]);

// The Form writer preserves every supported authored property and ordered choices.
assert.deepEqual(normalizeRequestFormFields([
  { id: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose', help: 'Pick one', required: true, contactRole: 'none', options: ['Mini', 'Full'] },
  { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.test', help: '', required: true, contactRole: 'email' }
]), [
  { id: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose', help: 'Pick one', required: true, contactRole: 'none', options: ['Mini', 'Full'] },
  { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.test', help: '', required: true, contactRole: 'email' }
]);

// A numeric price edit derives fresh public display text instead of retaining stale details.
assert.equal(formattedCommissionPrice({ price: '75', currency: 'USD', priceFormatted: '$25' }), '$75');
assert.equal(formattedCommissionPrice({ price: '1500000', currency: 'VND', priceFormatted: '$25' }), '1500000 VND');


// The role vocabulary never invents a value the repository does not author.
assert.deepEqual([...CONTACT_ROLES], ['none', 'name', 'email']);
assert.equal(normalizeRequestFormFields([{ id: 'q', type: 'text' }])[0].contactRole, 'none');
assert.equal(normalizeRequestFormFields([{ id: 'q', type: 'text', contactRole: '  email  ' }])[0].contactRole, 'email');
assert.deepEqual(
  normalizeRequestFormFields([{ id: 'q', type: 'select', options: ['  Mini ', '', 'Full', '   '] }])[0].options,
  ['Mini', 'Full'],
  'stored options are trimmed, keep author order and never keep blank lines'
);

// --- Asset availability survives the real writer in both directions ---
assert.equal(createAssetDraft({ id: 'client-asset' }).availability, 'available');
assert.equal(createAssetDraft({ id: 'client-asset', availability: 'unavailable' }).availability, 'unavailable');
assert.equal(formatAssetRow({ slug: 'petal-pack', availability: 'unavailable' }).availability, 'unavailable', 'an unavailable asset is never written as available');
assert.equal(formatAssetRow({ slug: 'free-pack', availability: 'available' }).availability, 'available', 'an available asset stays available');

// --- Commission relations persist the form slug, never a local UI identity ---
const commissionPlan = buildAdminWritePlan('commissions', {
  id: 'client-commission', dbId: null, originalUpdatedAt: null,
  slug: 'emote-bundle', title: 'Emote Bundle', price: '75', currency: 'USD',
  availability: 'open', form: 'contact-form', published: true, featured: false
});
assert.equal(commissionPlan.payload.form_slug, 'contact-form', 'the commission stores the persisted form slug');
assert.equal(/^client-/.test(String(commissionPlan.payload.form_slug)), false, 'a local client id never reaches the database');
assert.deepEqual(formRelationshipOptions([{ id: 'client-123', slug: 'contact-form', title: 'Contact form' }]), [{ value: 'contact-form', label: 'Contact form' }]);

// --- The Request Form writer round-trips every supported authored value ---
const formPlan = buildAdminWritePlan('forms', {
  id: 'client-form', dbId: null, originalUpdatedAt: null,
  title: 'Emote request', slug: 'emote-request', description: 'Tell me about the emote.',
  published: true,
  fields: [
    { id: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose one', help: 'Pick a package', required: true, contactRole: 'none', options: ['Mini', 'Full'] },
    { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.test', help: 'So I can reply', required: true, contactRole: 'email' }
  ]
});
assert.equal(formPlan.payload.slug, 'emote-request');
assert.equal(formPlan.payload.description, 'Tell me about the emote.', 'the form description is persisted');
assert.equal(formPlan.payload.published, true, 'the form published flag is persisted');
assert.deepEqual(formPlan.payload.fields[0], {
  id: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose one', help: 'Pick a package',
  required: true, contactRole: 'none', options: ['Mini', 'Full']
});
assert.deepEqual(formPlan.payload.fields[1], {
  id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.test', help: 'So I can reply',
  required: true, contactRole: 'email'
});
assert.equal(/^client-/.test(JSON.stringify(formPlan.payload)), false, 'no local identity leaks into a form payload');


// --- A canonical price edit always regenerates the formatted display ---
assert.equal(formatCommissionRow({ price: '75', currency: 'USD', priceFormatted: '$25' }).details.priceFormatted, '$75', 'saving a new price rewrites the formatted detail');
assert.equal(formatCommissionRow({ price: '1500000', currency: 'VND', priceFormatted: '$25' }).details.priceFormatted, '1500000 VND', 'a currency change regenerates the formatted detail');
assert.equal(formatCommissionRow({ price: '75', currency: 'USD' }).price, 75, 'the canonical numeric price is persisted');
assert.equal(mapCommissionService({ price: 75, currency: 'USD', details: { priceFormatted: '$25' } }).price, '$75', 'the public price prefers the canonical column');
assert.equal(mapCommissionService({ price: null, currency: 'USD', details: { priceFormatted: '$25' } }).price, '$25', 'a legacy formatted detail still renders when no canonical price exists');
assert.equal(/\$/.test(mapCommissionService({ price: 1500000, currency: 'VND', details: { priceFormatted: '$25' } }).price), false, 'a stale dollar string never survives a VND price');

// --- Media dimensions: payload plus mapping ---
const dimensionedPayload = mediaRowPayload({ storagePath: 'uploads/art.png', fileName: 'art.png', mimeType: 'image/png', sizeBytes: 10, sha256: 'abc', width: 640, height: 480 });
assert.equal(dimensionedPayload.width, 640, 'a measured width reaches the media row payload');
assert.equal(dimensionedPayload.height, 480, 'a measured height reaches the media row payload');
const dimensionless = [
  mediaRowPayload({ storagePath: 'uploads/clip.mp4', fileName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 10 }),
  mediaRowPayload({ storagePath: 'uploads/art.png', fileName: 'art.png', mimeType: 'image/png', sizeBytes: 10, width: 0, height: 480 }),
  mediaRowPayload({ storagePath: 'uploads/art.png', fileName: 'art.png', mimeType: 'image/png', sizeBytes: 10, width: null, height: null })
];
for (const payload of dimensionless) {
  assert.equal('width' in payload, false, 'no fake width is ever written');
  assert.equal('height' in payload, false, 'no fake height is ever written');
}
const mappedItem = formatMediaItem({ storage_path: 'uploads/art.png', width: '640', height: '480' }, () => 'https://cdn.test/art.png');
assert.equal(mappedItem.width, 640, 'a mapped item exposes a numeric width');
assert.equal(mappedItem.height, 480, 'a mapped item exposes a numeric height');
const undimensioned = formatMediaItem({ storage_path: 'uploads/clip.mp4' }, () => 'https://cdn.test/clip.mp4');
assert.equal(undimensioned.width, null, 'existing null dimensions stay safe');
assert.equal(undimensioned.height, null, 'existing null dimensions stay safe');

// --- Commission price blanks stay null, never NaN ---
assert.equal(formatCommissionRow({ slug: 'no-price', price: '' }).price, null, 'a blank price is written as null, not NaN');
assert.equal(formatCommissionRow({ slug: 'no-price', price: 'By inquiry' }).price, null, 'a non-numeric price is written as null, not NaN');

// --- A new commission service round-trips every editable field ---
const newService = {
  id: 'client-svc', dbId: null, originalUpdatedAt: null,
  slug: 'chibi-badge-set', title: 'Chibi Badge Set', description: 'Matching chibi badges.',
  thumbnail: 'https://cdn.test/badge.png', price: '45', currency: 'USD', alternatePrice: '1100000',
  includedFiles: 'PNG x3 + PSD', canvas: '1000x1000px each', delivery: '2 weeks',
  availability: 'inquiry', form: 'emotes', featured: true, published: true
};
const serviceRow = formatCommissionRow(newService, 3);
assert.equal(serviceRow.slug, 'chibi-badge-set');
assert.equal(serviceRow.title, 'Chibi Badge Set');
assert.equal(serviceRow.description, 'Matching chibi badges.');
assert.equal(serviceRow.thumbnail_path, 'https://cdn.test/badge.png');
assert.equal(serviceRow.price, 45);
assert.equal(serviceRow.currency, 'USD');
assert.equal(serviceRow.availability, 'waitlist', 'inquiry availability maps to the DB waitlist value');
assert.equal(serviceRow.form_slug, 'emotes', 'the Request button maps to the authored form');
assert.equal(serviceRow.featured, true);
assert.equal(serviceRow.published, true);
assert.equal(serviceRow.sort_order, 3);
assert.equal(serviceRow.details.includedFiles, 'PNG x3 + PSD');
assert.equal(serviceRow.details.canvas, '1000x1000px each');
assert.equal(serviceRow.details.deliveryEstimate, '2 weeks');
assert.equal(serviceRow.details.alternatePrice, '1100000');
assert.equal(serviceRow.details.formType, 'emotes');
const serviceBack = mapCommissionService({ ...serviceRow, details: serviceRow.details });
assert.equal(serviceBack.title, 'Chibi Badge Set');
assert.equal(serviceBack.description, 'Matching chibi badges.');
assert.equal(serviceBack.thumbnail, 'https://cdn.test/badge.png');
assert.equal(serviceBack.price, '$45');
assert.equal(serviceBack.currency, 'USD');
assert.equal(serviceBack.availability, 'inquiry', 'waitlist maps back to the editable inquiry value');
assert.equal(serviceBack.formType, 'emotes');
assert.equal(serviceBack.includedFiles, 'PNG x3 + PSD');
assert.equal(serviceBack.canvas, '1000x1000px each');
assert.equal(serviceBack.deliveryEstimate, '2 weeks');
assert.equal(serviceBack.alternatePrice, '1100000');
assert.equal(serviceBack.featured, true);
assert.equal(serviceBack.published, true);

// --- Portfolio block section titles survive the write boundary ---
const blockRow = formatPortfolioRow({
  slug: 'gif-gallery', blocks: [
    { id: 'b1', type: 'text', text: 'Intro', sectionTitle: 'Concept' },
    { id: 'b2', type: 'gallery', sectionTitle: 'Sketches', items: [
      { url: 'https://cdn.test/a.png', alt: 'A', caption: '' },
      { url: 'https://cdn.test/b.gif', alt: 'B', caption: 'animated' }
    ]}
  ]
}, 0);
assert.equal(blockRow.content.blocks[0].sectionTitle, 'Concept', 'block section titles are persisted in the block JSON');
assert.equal(blockRow.content.blocks[1].sectionTitle, 'Sketches');
// --- About page: skills / experience / values round-trip the full boundary ---
const aboutDraft = {
  title: 'About', content: 'Hello.', published: true,
  name: 'Crabbie', bio: 'Illustrator.', profileImage: 'https://cdn.test/me.png',
  skills: ['Illustration', 'Merch'],
  experience: [{ tag: 'EVENT', title: 'Amelodious', body: '4koma comics.' }],
  values: [{ title: 'Color', body: 'Bright palettes.' }],
  links: [{ label: 'Email', url: 'crabbie.art@gmail.com' }]
};
const aboutRow = formatPageRow('about', aboutDraft);
assert.deepEqual(aboutRow.data.skills, ['Illustration', 'Merch']);
assert.deepEqual(aboutRow.data.experience, [{ tag: 'EVENT', title: 'Amelodious', body: '4koma comics.' }]);
assert.deepEqual(aboutRow.data.values, [{ title: 'Color', body: 'Bright palettes.' }], 'creative values persist in the About page JSON');

const emptyResults = {
  portfolio: { data: [], error: null }, assets: { data: [], error: null },
  categories: { data: [], error: null }, commissions: { data: [], error: null },
  forms: { data: [], error: null }, navigation: { data: [], error: null },
  settings: { data: [], error: null }, requests: { data: [], error: null }, media: { data: [], error: null }
};
const hydration = mapAdminHydrationResults({ ...emptyResults, pages: { data: [aboutRow], error: null } });
assert.deepEqual(hydration.pages.about.values, [{ title: 'Color', body: 'Bright palettes.' }], 'hydration preserves stored creative values');
assert.deepEqual(hydration.pages.about.skills, ['Illustration', 'Merch']);
assert.deepEqual(hydration.pages.about.experience, [{ tag: 'EVENT', title: 'Amelodious', body: '4koma comics.' }]);

// A legacy record without values hydrates with null (never restored defaults);
// an explicitly stored empty array stays authoritative.
const legacyRow = formatPageRow('about', { title: 'About', content: 'x', published: true });
delete legacyRow.data.values;
const legacyHydration = mapAdminHydrationResults({ ...emptyResults, pages: { data: [legacyRow], error: null } });
assert.equal(legacyHydration.pages.about.values, null, 'legacy records surface values as absent, not as defaults');
const emptyHydration = mapAdminHydrationResults({ ...emptyResults, pages: { data: [formatPageRow('about', { title: 'About', content: 'x', published: true, values: [] })], error: null } });
assert.deepEqual(emptyHydration.pages.about.values, [], 'an explicitly empty values array stays authoritative');

console.log('Admin round-trip core tests passed.');
