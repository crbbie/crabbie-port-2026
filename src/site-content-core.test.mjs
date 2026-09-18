import assert from 'node:assert/strict';
import { mapCmsPage, mapNavigationItem, mapSiteSettings } from './site-content-core.js';

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

console.log('Site content mapping tests passed.');
