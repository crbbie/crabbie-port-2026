import assert from 'node:assert/strict';
import { mapCommissionService, mapCommissionForm } from './commissions-core.js';

const fallbackService = {
  id: 'static-emote',
  name: 'Static Emote / Badge',
  formType: 'emotes',
  formLabel: 'Emotes / Badges',
  availability: 'open',
  price: '$25',
  priceNote: 'each',
  previewLabel: 'STATIC EMOTE / BADGE PREVIEW',
  chips: ['Static', 'Emote / Badge', 'Each']
};

const liveRow = {
  slug: 'static-emote',
  title: 'Updated Static Emote',
  description: 'Updated description from Supabase',
  price: 35,
  currency: 'USD',
  availability: 'waitlist',
  form_slug: 'emotes',
  details: {
    formLabel: 'Emotes / Badges',
    priceNote: 'per badge',
    chips: ['Badge', 'Custom']
  }
};

const mappedService = mapCommissionService(liveRow, fallbackService);
assert.equal(mappedService.id, 'static-emote');
assert.equal(mappedService.name, 'Updated Static Emote');
assert.equal(mappedService.description, 'Updated description from Supabase');
assert.equal(mappedService.availability, 'inquiry'); // waitlist in DB -> inquiry in UI
assert.equal(mappedService.price, '$35');
assert.equal(mappedService.priceNote, 'per badge');
assert.deepEqual(mappedService.chips, ['Badge', 'Custom']);

const liveFormRow = {
  slug: 'emotes',
  title: 'Emotes Form',
  description: 'Description',
  fields: [{ id: 'name', type: 'text', label: 'Name' }],
  published: true
};

const mappedForm = mapCommissionForm(liveFormRow, {});
assert.equal(mappedForm.slug, 'emotes');
assert.equal(mappedForm.title, 'Emotes Form');
assert.equal(mappedForm.fields.length, 1);

// Batch 3 (P1-04): every supported currency renders its real symbol.
assert.equal(mapCommissionService({ slug: 's', title: 'S', price: 50, currency: 'EUR', details: {} }).price, '€50');
assert.equal(mapCommissionService({ slug: 's', title: 'S', price: 50, currency: 'GBP', details: {} }).price, '£50');
assert.equal(mapCommissionService({ slug: 's', title: 'S', price: 5000, currency: 'JPY', details: {} }).price, '¥5000');
assert.equal(mapCommissionService({ slug: 's', title: 'S', price: 1500000, currency: 'VND', details: {} }).price, '1500000 VND');

console.log('Commission CMS mapping tests passed.');
