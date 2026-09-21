import assert from 'node:assert/strict';
import { mapPortfolioProject, liveSlugSet, portfolioCaption } from './portfolio-cms-core.js';

const fallback = { title: 'Prototype title', desc: 'Prototype description', cat: 'Prototype', tags: ['OLD'], credits: '', year: '', cover: '', intro: '', sketch: '', process: '', body: '', quote: '', link: '', linkLabel: '' };
const mapped = mapPortfolioProject({ slug: 'live-project', title: 'Live title', description: 'Live description', tags: ['CMS'], cover_path: 'covers/live.png', featured: true, content: { cat: 'Illustration', cardMode: 'image', year: '2026', link: 'https://example.com' } }, fallback);
assert.equal(mapped.slug, 'live-project');
assert.equal(mapped.title, 'Live title');
assert.equal(mapped.desc, 'Live description');
assert.equal(mapped.cat, 'Illustration');
assert.deepEqual(mapped.tags, ['CMS']);
assert.equal(mapped.cover, 'covers/live.png');
assert.equal(mapped.featured, true);
assert.equal(mapped.cardMode, 'image');
assert.equal(mapped.year, '2026');
assert.equal(mapped.link, 'https://example.com');
assert.equal(mapped.credits, '');
// Batch 5 (P2-01): desc/description stay one canonical caption.
assert.equal(mapped.description, 'Live description', 'the canonical description survives beside the legacy alias');
assert.equal(portfolioCaption(mapped), 'Live description');
assert.equal(portfolioCaption({ desc: 'Legacy caption' }), 'Legacy caption', 'legacy readers keep working');
assert.equal(portfolioCaption({ description: 'Canonical caption' }), 'Canonical caption');
// Batch 5 (P1-01): the authoritative snapshot decides membership.
assert.deepEqual(liveSlugSet([{ slug: 'a' }, { id: 'b' }, {}]), { a: true, b: true });
console.log('Portfolio CMS mapping test passed.');
