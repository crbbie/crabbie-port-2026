import assert from 'node:assert/strict';
import { mapCmsPage, mapNavigationItem, mapSiteSettings, hasSettingsKey, settingsText, cmsBrandName, cmsSeoTitle, routeTitleFor, aboutPublicModel } from './site-content-core.js';

const page = mapCmsPage({
  slug: 'about',
  title: 'About Crabbie',
  content: 'Live bio',
  data: { skills: ['Chibi', 'Art'], name: 'Crabbie Art' }
}, { title: 'Old title', content: 'Old bio' });

assert.equal(page.title, 'About Crabbie');
assert.equal(page.content, 'Live bio');
assert.equal(page.name, 'Crabbie Art');
assert.deepEqual(page.skills, ['Chibi', 'Art']);

const nav = mapNavigationItem({
  id: '123',
  title: 'My Work',
  url: '#portfolio',
  published: true,
  sort_order: 1
}, {});

assert.equal(nav.title, 'My Work');
assert.equal(nav.url, '#portfolio');
assert.equal(nav.sort_order, 1);

const settings = mapSiteSettings([
  { key: 'branding', value: { title: 'Crabbie Live', tagline: 'Magical art' } },
  { key: 'footer', value: { footer: 'Sweet candy' } }
], { branding: { title: 'Old' }, theme: {} });

assert.equal(settings.branding.title, 'Crabbie Live');
assert.equal(settings.branding.tagline, 'Magical art');
assert.equal(settings.footer.footer, 'Sweet candy');
assert.ok(settings.theme);

// Batch 4: missing key vs intentionally empty.
assert.equal(hasSettingsKey({ tagline: '' }, 'tagline'), true, 'an empty value still counts as present');
assert.equal(hasSettingsKey({}, 'tagline'), false, 'a missing key is absent');
assert.equal(settingsText({ tagline: '' }, 'tagline'), '', 'empty text is returned, not null');
assert.equal(settingsText({}, 'tagline'), null, 'a missing key returns null');
assert.equal(cmsBrandName({ branding: { title: '' } }), 'CRABBIE', 'an empty brand falls back');
assert.equal(cmsBrandName({ branding: { title: '  Mira  ' } }), 'Mira');
assert.equal(cmsSeoTitle({ seo: { title: 'My SEO' } }), 'My SEO');
assert.equal(cmsSeoTitle({ seo: {} }), '', 'a missing SEO title is empty, never hard-coded');

// Batch 4 (P2-10): the router uses the CMS baseline, never a hard-coded reset.
assert.equal(routeTitleFor('home', null, { brand: 'Mira', seoTitle: 'Mira SEO' }), 'Mira SEO');
assert.equal(routeTitleFor('home', null, { brand: 'Mira', seoTitle: '' }), 'Mira — Art made with candy, petals & the sparkliest of hearts');
assert.equal(routeTitleFor('portfolio', null, { brand: 'Mira' }), 'Portfolio — Mira');
assert.ok(!/CRABBIE/.test(routeTitleFor('portfolio', null, { brand: 'Mira' })), 'no hard-coded brand leaks into a custom brand');
assert.equal(routeTitleFor('admin', null, { brand: 'Mira', adminLabel: 'Settings' }), 'Admin · Settings — Mira');

// Batch 4 (P2-04): title, bio and content keep distinct roles.
const about = aboutPublicModel({ name: 'Crabbie', title: 'About', bio: 'Hero bio', content: 'Long body' });
assert.equal(about.headingName, 'Crabbie');
assert.equal(about.bio, 'Hero bio', 'bio stays the hero paragraph');
assert.equal(about.content, 'Long body', 'content survives beside bio');
const aboutNoName = aboutPublicModel({ name: '', title: 'About', bio: '', content: '' });
assert.equal(aboutNoName.heading, 'About', 'the CMS title backs the heading without a name');

console.log('Site content mapping tests passed.');
