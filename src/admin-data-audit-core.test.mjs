import assert from 'node:assert/strict';
import {
  findPlaceholders,
  hasPlaceholderText,
  auditPortfolioRecord,
  auditAssetRecord,
  auditCommissionRecord,
  auditPageRecord,
  auditSettingsRecord,
  auditSiteData
} from './admin-data-audit-core.js';

// 1. Placeholder detection: exact known placeholders + conservative behavior
{
  for (const known of ['[ASSET DESCRIPTION FROM CMS]', '[DATE]', '[CREDIT REQUIREMENT]', '[LICENSE CONTENT FROM CMS]', '[VERSION]', '[UPDATE NOTE]', '[TODO]', '[TBD]']) {
    assert.deepEqual(findPlaceholders('text ' + known + ' more'), [known], known);
  }
  assert.ok(hasPlaceholderText('TODO: fix me'));
  assert.ok(hasPlaceholderText('License: LICENSE CONTENT FROM CMS'));
  assert.ok(hasPlaceholderText(['a', '[VERSION]']));
  // conservative: ordinary brackets, mixed case, markdown links, punctuation
  assert.deepEqual(findPlaceholders('see [appendix] and [Info] for details'), []);
  assert.deepEqual(findPlaceholders('[README](https://example.com) guide'), []);
  assert.deepEqual(findPlaceholders('A [2024] release!'), []);
  assert.deepEqual(findPlaceholders('Just a normal sentence.'), []);
}

// 2. Portfolio: missing required detection + published-but-incomplete
{
  const sparse = {
    id: 'p1', slug: 'p1', title: 'Color Fiesta', description: '',
    category: 'illustration', tags: [], thumbnail: '', cover: '',
    blocks: [], published: true
  };
  const a = auditPortfolioRecord(sparse);
  assert.equal(a.status, 'incomplete');
  assert.ok(a.required.includes('thumbnail') && a.required.includes('cover') && a.required.includes('description'));
  assert.deepEqual(a.missing, ['thumbnail', 'cover', 'description']);
  assert.ok(a.warnings.includes('no-content-blocks'));
  assert.ok(a.warnings.includes('no-tags'));
  // published state is never modified by the audit
  assert.equal(sparse.published, true);

  // warnings only (draft with gaps but nothing required missing)
  const draft = { id: 'p2', slug: 'p2', title: 'T', description: 'd', category: 'c', thumbnail: 'u', cover: 'u', tags: ['x'], date: '2026', blocks: [{ type: 'text' }], published: false };
  const b = auditPortfolioRecord(draft);
  assert.equal(b.status, 'complete');
  assert.equal(b.missing.length, 0);

  const imageCard = auditPortfolioRecord({
    id:'p3', slug:'single-illus', title:'Single illustration', category:'illustration',
    cardMode:'image', thumbnail:'image.png', cover:'', description:'', tags:['illus'], year:'2026', blocks:[]
  });
  assert.equal(imageCard.status, 'complete', 'image-only cards do not require a project cover, description, or content blocks');
  assert.deepEqual(imageCard.required, ['title', 'slug', 'category', 'thumbnail']);
  assert.ok(!imageCard.warnings.includes('no-content-blocks'));
}

// 3. Free asset: missing download → high-priority when published
{
  const noFile = { id: 'a1', slug: 'a1', title: 'Petal Pack', description: 'desc', category: 'brushes', thumbnail: '', media: '', downloadUrl: '', fileFormat: 'PNG', license: 'CC0', availability: 'available', published: true, tags: [] };
  const a = auditAssetRecord(noFile);
  assert.equal(a.status, 'incomplete');
  assert.ok(a.missing.includes('media'));
  assert.ok(a.critical.includes('published-without-file'));
  // unpublished asset without file: missing but not critical
  const a2 = auditAssetRecord(Object.assign({}, noFile, { published: false }));
  assert.deepEqual(a2.critical, []);
  const cleared = auditAssetRecord(Object.assign({}, noFile, { media: 'stale.zip', downloadUrl: '' }));
  assert.ok(cleared.missing.includes('media'));
  assert.ok(cleared.critical.includes('published-without-file'));

  const driveOnly = auditAssetRecord(Object.assign({}, noFile, {
    thumbnail: 't.png',
    downloadUrl: '',
    showDirectDownload: false,
    driveUrl: 'https://drive.google.com/file/d/example/view',
    showDriveDownload: true
  }));
  assert.ok(!driveOnly.missing.includes('media'), 'an enabled Google Drive button satisfies the public download requirement');
  assert.ok(!driveOnly.critical.includes('published-without-file'));

  const hiddenDownloads = auditAssetRecord(Object.assign({}, noFile, {
    thumbnail: 't.png',
    downloadUrl: 'https://x/f.zip',
    showDirectDownload: false,
    driveUrl: 'https://drive.google.com/file/d/example/view',
    showDriveDownload: false
  }));
  assert.ok(hiddenDownloads.missing.includes('media'), 'stored URLs do not count when both public download buttons are disabled');

  // placeholder metadata fields are detected
  const withPlaceholders = auditAssetRecord(Object.assign({}, noFile, { thumbnail: 't.png', media: 'https://x/f.zip', downloadUrl: 'https://x/f.zip', license: '[LICENSE CONTENT FROM CMS]', credit: '[CREDIT REQUIREMENT]', version: '[VERSION]', updateNote: '[UPDATE NOTE]', dateAdded: '[DATE]' }));
  assert.equal(withPlaceholders.status, 'warning'); // file present, nothing required missing, placeholders found
  assert.deepEqual(withPlaceholders.missing, []);
  assert.ok(withPlaceholders.placeholders.includes('license') && withPlaceholders.placeholders.includes('credit') && withPlaceholders.placeholders.includes('version'));
  assert.deepEqual(withPlaceholders.critical, []);

  // complete asset
  const ok = auditAssetRecord({ id: 'a2', slug: 'a2', title: 'T', description: 'd', category: 'c', thumbnail: 't', media: 'f.zip', description2: '', fileFormat: 'ZIP', license: 'CC0', availability: 'available', published: true, tags: ['x'] });
  assert.equal(ok.status, 'complete');
}

// 4. Commission: missing form mapping is high-priority
{
  const rec = { id: 'c1', slug: 'c1', title: 'Chibi', description: 'd', price: '40', availability: 'open', form: 'does-not-exist', thumbnail: '', published: true, chips: [], includedFiles: '', delivery: '' };
  const a = auditCommissionRecord(rec, { formIds: ['illustration', 'chibi-form'] });
  assert.ok(a.critical.includes('no-form-mapping'));
  assert.ok(a.missing.includes('thumbnail'));
  assert.ok(a.missing.includes('delivery'));
  assert.equal(a.status, 'incomplete');
  assert.ok(a.warnings.includes('no-chips') && a.warnings.includes('no-included-files'));
  // priceFormatted alternative accepted
  const alt = auditCommissionRecord(Object.assign({}, rec, { form: 'illustration', price: '', priceFormatted: '$40', thumbnail: 't', delivery: '2 weeks', chips: ['x'], includedFiles: 'png' }), { formIds: ['illustration'] });
  assert.ok(!alt.missing.includes('price'));
  assert.ok(!alt.critical.includes('no-form-mapping'));
}

// 5. About page: missing contact link / raw email not clickable
{
  const ctx = { settings: { contact: { email: '', twitter: '' } } };
  const a = auditPageRecord({ title: 'About', name: 'Crabbie', bio: 'b', content: "I'm Crabbie, an illustrator. Mail me: crabbie.art@gmail.com", profileImage: '', skills: [], experience: [] }, 'about', ctx);
  assert.ok(a.warnings.includes('no-contact-link'));
  assert.ok(a.warnings.includes('raw-email-not-clickable'));
  assert.ok(a.warnings.includes('no-profile-image'));
  assert.ok(!a.missing.length);
  // with contact configured and mailto link: no contact warnings
  const b = auditPageRecord({ title: 'About', name: 'C', bio: 'b', content: 'hello [about page](https://x) mailto:me@x.dev', profileImage: 'p', skills: ['s'], experience: ['e'] }, 'about', { settings: { contact: { email: 'me@x.dev', twitter: 'https://x.com/c' } } });
  assert.ok(!b.warnings.includes('no-contact-link'));
  assert.ok(!b.warnings.includes('raw-email-not-clickable'));
}

// 6. Terms: section detection, thin content, raw email
{
  const ctx = { settings: { contact: { email: '', twitter: '' } } };
  const short = auditPageRecord({ title: 'Terms', content: '# 1. Contact\n\nDM me.\n\n# 2. Payment\n\n100% upfront.' }, 'terms', ctx);
  assert.ok(short.warnings.includes('few-sections'));
  assert.ok(short.warnings.includes('missing-section:turnaround'));
  assert.ok(short.warnings.includes('missing-section:copyright'));
  assert.ok(short.warnings.includes('thin-content'));
  // full terms: all sections found → no missing-section warnings
  const full = auditPageRecord({ title: 'Terms', content: "# 1. Contact & Work Process\nDM or email: crabbie.art@gmail.com\n\n# 2. Payment & Refund Policy\n100% upfront.\n\n# 3. Edits & Feedback\nUnlimited.\n\n# 4. Turnaround Time & Deadlines\n2-3 weeks.\n\n# 5. Files & Formats\nPNG, PSD.\n\n# 6. What I Don't Draw\nCase by case.\n\n# 7. Copyright & Usage Rights\nPersonal use only.\n\n# 8. Artist Rights\nPortfolio use." }, 'terms', ctx);
  assert.equal(full.warnings.filter((w) => String(w).startsWith('missing-section')).length, 0);
  assert.ok(!full.warnings.includes('few-sections'));
  assert.ok(full.warnings.includes('raw-email-not-clickable'));
  assert.ok(!full.warnings.includes('no-contact-method'));
}

// 7. Settings audit
{
  const s = auditSettingsRecord({ contact: { email: 'not-an-email', twitter: '' }, branding: { logo: '' }, seo: { socialImage: '' } });
  assert.ok(s.warnings.includes('bad-contact-email'));
  assert.ok(s.warnings.includes('no-logo'));
  assert.ok(s.missing.includes('contact.email') === false);
  const s2 = auditSettingsRecord({ contact: { email: 'me@x.dev', twitter: 'https://x.com/c' }, branding: { logo: 'l', heroMedia: 'h' }, seo: { socialImage: 's' } });
  assert.equal(s2.status, 'complete');
  const s3 = auditSettingsRecord({ contact: { email: 'me@x.dev', twitter: 'https://x.com/c' }, branding: { logo: 'l', heroMedia: 'h', title: '[SITE TITLE]' }, seo: { socialImage: 's' } });
  assert.ok(s3.placeholders.includes('branding.title'));
  assert.equal(s3.status, 'warning');
}

// 8. Site summary (dashboard counts, no hardcoding)
{
  const data = {
    portfolio: [{ published: true, thumbnail: '', cover: '', blocks: [], tags: [], title: 't', slug: 't', description: 'd', category: 'c' }],
    assets: [{ published: true, thumbnail: '', media: '', downloadUrl: '', title: 't', slug: 't', description: 'd', category: 'c', fileFormat: 'PNG', license: 'l', availability: 'available', tags: [] }],
    commissions: [{ published: true, thumbnail: '', form: 'nope', title: 't', slug: 't', description: 'd', price: '1', availability: 'open', chips: [], includedFiles: '', delivery: '' }],
    forms: [{ id: 'illustration' }],
    pages: { about: { title: 'About', name: 'C', bio: 'b', content: 'x' }, terms: { title: 'Terms', content: '# a\nword ' } },
    settings: { contact: {} },
    media: [{ id: 'm1' }, { id: 'm2' }]
  };
  const s = auditSiteData(data);
  assert.equal(s.portfolio.published, 1);
  assert.equal(s.portfolio.needAttention, 1);
  assert.equal(s.assets.missingFiles, 1);
  assert.equal(s.commissions.missingForms, 1);
  assert.equal(s.media.total, 2);
  assert.ok(s.about.issues > 0 && s.terms.issues > 0);
}

console.log('Admin data audit tests passed.');
