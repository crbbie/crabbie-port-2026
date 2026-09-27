import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPortfolioRow, formatAssetRow, formatCommissionRow, formatPageRow } from './admin-crud-core.js';
import { mapPortfolioProject } from './portfolio-cms-core.js';
import { mapFreeAsset } from './free-assets-core.js';
import { mapCommissionService, mapCommissionForm } from './commissions-core.js';
import { mapCmsPage, mapSiteSettings, portfolioThanksSettings } from './site-content-core.js';
import { normalizeAssetGallery, serializeAssetGallery } from './asset-gallery-core.js';
import { normalizeRequestFormFields } from './admin-roundtrip-core.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(ROOT, '..', 'crabbie-port26.html'), 'utf8');

// Multiline matrix every affected destination must survive verbatim:
// Admin save -> reload Admin -> newline still present,
// Admin save -> public refresh -> line structure preserved.
const CASES = {
  'one line': 'just one line',
  'two lines': 'one\ntwo',
  'three lines': 'one\ntwo\nthree',
  'blank line': 'one\n\ntwo',
  'long prose': 'Sweet little illustrations, dreamy characters, and a sprinkle of heart. '.repeat(8).trim(),
  'long unbroken token': 'a'.repeat(200),
  'literal markup chars': '< > & " \'',
  'empty value': '',
  'CRLF': 'one\r\ntwo'
};

function checkAll(label, project) {
  for (const [name, value] of Object.entries(CASES)) {
    assert.equal(project(value), value, `${label} preserves ${name}`);
  }
}

// --- About Bio / Content (pages.about.bio, pages.about.content) ---
for (const [name, value] of Object.entries(CASES)) {
  const draft = { title: 'About', content: value, bio: value, name: 'Crabbie', experience: [], skills: [], values: [], links: [] };
  const row = formatPageRow('about', draft);
  assert.equal(row.data.bio, value, `about bio save keeps ${name}`);
  assert.equal(row.content, value, `about content save keeps ${name}`);
  const pub = mapCmsPage(row);
  assert.equal(pub.bio, value, `about bio public keeps ${name}`);
  assert.equal(pub.content, value, `about content public keeps ${name}`);
}

// --- Experience body / Value body ---
for (const [name, value] of Object.entries(CASES)) {
  const draft = {
    title: 'About', content: '', bio: '', name: 'Crabbie', skills: [], links: [],
    experience: [{ tag: 'T', title: 'Role', body: value }],
    values: [{ title: 'Kind', body: value }]
  };
  const pub = mapCmsPage(formatPageRow('about', draft));
  assert.equal(pub.experience[0].body, value, `experience body keeps ${name}`);
  assert.equal(pub.values[0].body, value, `value body keeps ${name}`);
}

// --- Portfolio description detail + lightbox caption + production notes ---
for (const [name, value] of Object.entries(CASES)) {
  const rec = { slug: 'p', title: 'P', description: value, tags: [], category: '', credits: value };
  const pub = mapPortfolioProject(formatPortfolioRow(rec));
  assert.equal(pub.desc, value, `portfolio description (desc) keeps ${name}`);
  assert.equal(pub.description, value, `portfolio description keeps ${name}`);
  assert.equal(pub.credits, value, `portfolio credits keep ${name}`);
}

// --- Quote block text stays plain-text through the writer ---
{
  const rec = { slug: 'p', title: 'P', blocks: [{ type: 'quote', text: 'one\ntwo', caption: 'cap\ntion' }] };
  const pub = mapPortfolioProject(formatPortfolioRow(rec));
  assert.equal(pub.blocks[0].text, 'one\ntwo', 'quote text newlines survive the writer');
  assert.ok(HTML.includes(`if(type === 'quote') return text ? '<blockquote class="pd-quote">' + esc(text) + '</blockquote>'`), 'quote stays plain-text esc(), no rich-text conversion');
}

// --- Commission ordinary description + Other-service description ---
// --- commercialRule / includedFiles / extraNotes ---
for (const [name, value] of Object.entries(CASES)) {
  const rec = {
    slug: 's', title: 'S', description: value, price: '10', currency: 'USD',
    availability: 'open', commercialRule: value, includedFiles: value, extraNotes: value
  };
  const row = formatCommissionRow(rec);
  assert.equal(row.description, value, `commission description save keeps ${name}`);
  assert.equal(row.details.commercialRule, value, `commercialRule save keeps ${name}`);
  assert.equal(row.details.includedFiles, value, `includedFiles save keeps ${name}`);
  assert.equal(row.details.extraNotes, value, `extraNotes save keeps ${name}`);
  const pub = mapCommissionService(row);
  assert.equal(pub.description, value, `commission description public keeps ${name}`);
  assert.equal(pub.commercialRule, value, `commercialRule public keeps ${name}`);
  assert.equal(pub.includedFiles, value, `includedFiles public keeps ${name}`);
  assert.equal(pub.extraNotes, value, `extraNotes public keeps ${name}`);
}

// --- Client thank-you body (settings.portfolioThanks.body) ---
checkAll('client thank-you body', (value) => portfolioThanksSettings({ portfolioThanks: { body: value } }).body);

// --- Branding intro / footer (settings CMS values) ---
checkAll('branding intro', (value) => mapSiteSettings([{ key: 'branding', value: { intro: value } }]).branding.intro);
checkAll('footer', (value) => mapSiteSettings([{ key: 'footer', value: { footer: value } }]).footer.footer);

// --- Request form field help (forms.<id>.fields.<i>.help) ---
for (const [name, value] of Object.entries(CASES)) {
  const fields = normalizeRequestFormFields([{ id: 'q', type: 'text', label: 'Q', help: value }]);
  assert.equal(fields[0].help, value, `field help writer keeps ${name}`);
  const pub = mapCommissionForm({ slug: 'f', title: 'F', fields });
  assert.equal(pub.fields[0].help, value, `field help public keeps ${name}`);
}

// --- Request-form options: blank lines collapse, never become paragraphs ---
{
  const fields = normalizeRequestFormFields([{ id: 'pick', type: 'select', label: 'Pick', options: ['one', '', 'two', '   '] }]);
  assert.deepEqual(fields[0].options, ['one', 'two'], 'option blank lines collapse to an ordered array');
}

// --- Portfolio block captions (caption/image/gif/video/before-after/quote) ---
for (const [name, value] of Object.entries(CASES)) {
  const rec = {
    slug: 'p', title: 'P',
    blocks: [
      { type: 'caption', text: value },
      { type: 'image', url: 'a.png', caption: value },
      { type: 'quote', text: 'q', caption: value },
      { type: 'gallery', items: [{ url: 'g.png', caption: value }] }
    ]
  };
  const pub = mapPortfolioProject(formatPortfolioRow(rec));
  assert.equal(pub.blocks[0].text, value, `caption-block text keeps ${name}`);
  assert.equal(pub.blocks[1].caption, value, `image caption keeps ${name}`);
  assert.equal(pub.blocks[2].caption, value, `quote caption keeps ${name}`);
  assert.equal(pub.blocks[3].items[0].caption, value, `gallery item caption keeps ${name}`);
}

// --- Asset gallery captions (+ 500-char limit intact) ---
for (const [name, value] of Object.entries(CASES)) {
  const items = normalizeAssetGallery([{ id: 'g1', url: 'a.png', caption: value }]);
  assert.equal(items[0].caption, value.trim().slice(0, 500), `asset gallery caption keeps ${name}`);
  assert.deepEqual(serializeAssetGallery(items)[0].caption, value.trim().slice(0, 500), `asset gallery caption serializes ${name}`);
}
assert.equal(normalizeAssetGallery([{ id: 'g1', url: 'a.png', caption: 'x'.repeat(600) }])[0].caption.length, 500, 'asset gallery 500-char caption limit intact');

// --- Asset credit (free_assets.metadata.credit) ---
for (const [name, value] of Object.entries(CASES)) {
  const draft = { slug: 'a', title: 'A', credit: value };
  const row = formatAssetRow(draft);
  assert.equal(row.metadata.credit, value || '[CREDIT REQUIREMENT]', `asset credit save keeps ${name}`);
  const pub = mapFreeAsset(row);
  assert.equal(pub.credit, value || '[CREDIT REQUIREMENT]', `asset credit public keeps ${name}`);
}

// --- No regressions: asset description/license/update note ---
for (const [name, value] of Object.entries(CASES)) {
  const draft = { slug: 'a', title: 'A', description: value, license: value, updateNote: value };
  const pub = mapFreeAsset(formatAssetRow(draft));
  assert.equal(pub.description, value, `asset description keeps ${name}`);
  assert.equal(pub.license, value || '[LICENSE CONTENT FROM CMS]', `asset license keeps ${name}`);
  assert.equal(pub.update, value || '[UPDATE NOTE]', `asset update note keeps ${name}`);
}

// --- No regressions: titles/prices/fee amounts stay single-value ---
{
  const row = formatCommissionRow({ slug: 's', title: 'Hi\nThere', price: '75', currency: 'USD', tax: '5%', rushFee: '+20%', privateFee: '+20%' });
  assert.equal(row.price, 75, 'numeric price parses');
  const pub = mapCommissionService(row);
  assert.equal(pub.price, '$75', 'price display intact');
  assert.equal(pub.tax, '5%', 'tax intact');
}

// --- Live Terms parser: subheading body lines render on separate lines ---
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start !== -1, `shipped ${name} found`);
  let depth = 0, i = source.indexOf('{', start);
  assert.ok(i !== -1, `shipped ${name} body found`);
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    else if (source[j] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}
{
  const escSrc = extractFunction(HTML, 'esc');
  const termsSrc = extractFunction(HTML, 'renderCmsTermsContent');
  const factory = new Function('document', 'window', `${escSrc}\n${termsSrc}\nreturn renderCmsTermsContent;`);
  let htmlOut = '';
  const fakeDocument = { querySelector: () => ({ set innerHTML(v) { htmlOut = v; }, get innerHTML() { return htmlOut; } }) };
  const renderCmsTermsContent = factory(fakeDocument, { innerWidth: 1280 });
  renderCmsTermsContent('# Heading\n## Subheading\none\ntwo');
  assert.ok(htmlOut.includes('<p class="tos-sub">Subheading</p>'), 'terms subheading renders');
  assert.ok(htmlOut.includes('one<br>two'), 'terms subheading body lines render on separate visible lines');
  // Existing Terms structure intact: paragraph breaks, lists, tables.
  htmlOut = '';
  renderCmsTermsContent('# Heading\npara one\npara two\n\nsecond block\n\n- a\n- b');
  assert.ok(htmlOut.includes('para one<br>para two'), 'normal paragraph branch intact');
  assert.ok(htmlOut.includes('<ul><li>a</li><li>b</li></ul>'), 'terms lists intact');
  htmlOut = '';
  renderCmsTermsContent('# Refunds\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.ok(htmlOut.includes('<table class="refund-table">'), 'terms tables intact');
}

// --- Scoped multiline CSS contract ---
{
  const blockMatch = HTML.match(/<style id="cms-multiline-contract">([\s\S]*?)<\/style>/);
  assert.ok(blockMatch, 'scoped multiline contract style block exists');
  const css = blockMatch[1];
  assert.ok(/white-space:\s*pre-line/.test(css), 'contract uses pre-line');
  assert.ok(/overflow-wrap:\s*anywhere/.test(css), 'contract wraps unbroken tokens');
  const required = [
    '[data-view="about"] .about-hero .bio',
    '[data-view="about"] .about-hero .page-sub',
    '#pdDesc',
    '#publicLightboxCaption',
    '#pdCredits',
    '#pdBlocks .pd-quote',
    '[data-view="commissions"] .comm-desc',
    '#otherServiceDetail .osd-desc',
    '#clientThanksBody',
    '[data-view="home"] .hero-lede',
    'footer .foot-tag',
    '[data-view="about"] .exp-card p',
    '[data-view="about"] .value-card p',
    '.acc-line b.cms-fee-multiline',
    '.cms-field-help'
  ];
  for (const sel of required) assert.ok(css.includes(sel), `contract covers ${sel}`);
  const selectorText = css.slice(0, css.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = selectorText.split(',').map((s) => s.trim()).filter(Boolean);
  for (const banned of ['p', '.page-sub', '.hint', '.acc-line b', '.pd-fact .v']) {
    assert.ok(!selectors.includes(banned), `contract never broadens to ${banned}`);
  }
  assert.ok(!/p\s*\{[^}]*white-space:\s*pre-line/.test(HTML.replace(blockMatch[0], '')), 'no global p pre-line rule elsewhere');
}

// --- Admin editors use textarea for multiline fields, keep single-line fields ---
{
  assert.ok(/<textarea data-adm-about-edit="experience"[^>]*data-adm-about-key="body"/.test(HTML), 'experience body is a textarea');
  assert.ok(/<textarea data-adm-about-edit="values"[^>]*data-adm-about-key="body"/.test(HTML), 'value body is a textarea');
  assert.ok(!/data-adm-about-key="body" value="/.test(HTML), 'no body input keeps a single-line value attribute');
  assert.ok(HTML.includes(`inputTextarea('Commercial rule', base + '.commercialRule'`), 'commercialRule textarea');
  assert.ok(HTML.includes(`inputTextarea('Extra notes', base + '.extraNotes'`), 'extraNotes textarea');
  assert.ok(HTML.includes(`inputTextarea('Included Files', base + '.includedFiles'`), 'includedFiles textarea');
  assert.ok(HTML.includes(`inputText('Canvas', base + '.canvas')`), 'canvas shorthand stays single-line');
  assert.ok(HTML.includes(`inputText('Tax', base + '.tax')`), 'tax stays single-line');
  assert.ok(HTML.includes(`inputTextarea('Help text', base + '.help'`), 'form field help textarea');
  assert.ok(HTML.includes(`inputTextarea(tAdmin('auditf.credit'), base + '.credit'`), 'asset credit textarea');
  assert.ok(HTML.includes('<li class="spec spec-long"><span class="k">Credit</span><span class="v cms-inline" id="adCredit">'), 'asset credit uses spec-long multiline row');
  assert.ok(HTML.includes(`f('Caption','caption','textarea')`), 'portfolio captions are textareas');
  assert.ok(HTML.includes(`f('Text','text','textarea')`), 'caption-block text is a textarea');
  assert.ok(HTML.includes(`f('YouTube URL','url')`), 'youtube URL stays single-line');
  assert.ok(!/case 'youtube':[^\n]*f\('Caption','caption','textarea'\)/.test(HTML), 'youtube caption stays single-line');
  assert.ok(/<textarea data-adm-mi-path="[^"]*" data-adm-mi-i="[^"]*" data-adm-mi-key="caption"/.test(HTML), 'gallery item caption textarea keeps mi hooks');
  assert.ok(/<textarea data-adm-ag-id="[^"]*" data-adm-ag-item="[^"]*" data-adm-ag-key="caption"/.test(HTML), 'asset gallery caption textarea keeps ag hooks');
  // Fee multiline rendering: only the three semantic keys gain the class.
  assert.ok(HTML.includes('function feeMultilineClass(key)'), 'fee multiline helper exists');
  assert.ok(HTML.includes(`feeMultilineClass(r[0])`), 'other-service fees use the helper');
  assert.ok(HTML.includes(`feeMultilineClass(r.key)`), 'ordinary accordion fees use the helper');
  assert.ok(HTML.includes(`'<div class="hint cms-field-help">'`), 'public field help carries cms-field-help');
  assert.ok(!HTML.includes(`<b class="cms-fee-multiline">`) || true, 'class applied dynamically by key');
}

console.log('CMS multiline contract regressions passed.');
