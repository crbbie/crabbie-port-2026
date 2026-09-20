import assert from 'node:assert/strict';
import { mapPortfolioProject } from './portfolio-cms-core.js';

const fallback = { title: 'Prototype title', desc: 'Prototype description', cat: 'Prototype', tags: ['OLD'], credits: '', year: '', cover: '', intro: '', sketch: '', process: '', body: '', quote: '', link: '', linkLabel: '' };
const mapped = mapPortfolioProject({ slug: 'live-project', title: 'Live title', description: 'Live description', tags: ['CMS'], cover_path: 'covers/live.png', featured: true, content: { cat: 'Illustration', year: '2026', link: 'https://example.com' } }, fallback);
assert.equal(mapped.slug, 'live-project');
assert.equal(mapped.title, 'Live title');
assert.equal(mapped.desc, 'Live description');
assert.equal(mapped.cat, 'Illustration');
assert.deepEqual(mapped.tags, ['CMS']);
assert.equal(mapped.cover, 'covers/live.png');
assert.equal(mapped.featured, true);
assert.equal(mapped.year, '2026');
assert.equal(mapped.link, 'https://example.com');
assert.equal(mapped.credits, '');
console.log('Portfolio CMS mapping test passed.');
