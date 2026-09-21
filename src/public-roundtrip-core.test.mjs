import assert from 'node:assert/strict';
import {
  COMMISSION_FEE_FIELDS,
  cleanFeeValue,
  commissionFeeRows,
  visibleCmsValue,
  aboutHeading,
  aboutHeadingName,
  profileImageAlt,
  contactFieldState
} from './public-roundtrip-core.js';
import { formatCommissionRow } from './admin-crud-core.js';
import { aboutPublicModel } from './site-content-core.js';

// --- P2-06: keyed fee rows ---------------------------------------------------
const onlyTax = commissionFeeRows({ tax: '5%' });
assert.deepEqual(onlyTax, [{ key: 'tax', label: 'Tax', value: '5%' }], 'only Tax: one row, correct label<->value');

const trio = commissionFeeRows({ tax: '5%', rush: '+20%', privateFee: '+20%' });
assert.deepEqual(trio.map((r) => r.key), ['tax', 'rush', 'privateFee'], 'sparse keys keep stable identity, never index positions');
assert.equal(trio.find((r) => r.key === 'rush').value, '+20%');

const full = commissionFeeRows({
  deliveryEstimate: '2 weeks', includedFiles: 'PNG', canvas: 'A4',
  commercialRule: 'x2', extraCharacter: '+50%', backgroundRule: 'varies',
  tax: '5%', rush: '+20%', privateFee: '+20%'
});
assert.equal(full.length, 9, 'a full fee set still renders every row');
assert.equal(full[0].key, 'deliveryEstimate');

assert.deepEqual(commissionFeeRows({}), [], 'empty fees render no junk rows');
assert.deepEqual(commissionFeeRows({ tax: '', rush: null, privateFee: '  ' }), [], 'blank fees are dropped');
assert.deepEqual(commissionFeeRows(null), [], 'missing service renders nothing');
assert.equal(cleanFeeValue('undefined'), '', 'sentinel strings are treated as empty');
assert.equal(COMMISSION_FEE_FIELDS.length, 9);

// --- P2-06 roundtrip: admin save -> details -> hydration -> public rows ------
import { createRequire } from 'node:module';
const sparsePayload = formatCommissionRow({
  slug: 'sparse', title: 'Sparse', price: '70', currency: 'USD',
  tax: '5%', rushFee: '', privateFee: ''
}, 0);
assert.equal(sparsePayload.details.tax, '5%');
assert.equal(sparsePayload.details.rush, '', 'an explicitly cleared fee persists as empty, not the default');
assert.equal(sparsePayload.details.privateFee, '', 'an explicitly cleared fee persists as empty');
const sparseRows = commissionFeeRows({
  tax: sparsePayload.details.tax,
  rush: sparsePayload.details.rush,
  privateFee: sparsePayload.details.privateFee,
  deliveryEstimate: sparsePayload.details.deliveryEstimate
});
assert.deepEqual(sparseRows.map((r) => r.key), ['tax'], 'reload renders only the surviving fee under its own label');
void createRequire;

// --- P2-02: contact presence semantics ---------------------------------------
assert.deepEqual(contactFieldState({ email: '' }, 'email'), { present: true, value: '' }, 'present-with-empty means clear');
assert.deepEqual(contactFieldState({ email: 'a@b.test' }, 'email'), { present: true, value: 'a@b.test' });
assert.deepEqual(contactFieldState({}, 'email'), { present: false, value: '' }, 'a missing key leaves public alone');
assert.deepEqual(contactFieldState(null, 'email'), { present: false, value: '' });
assert.deepEqual(contactFieldState({ twitter: '' }, 'twitter'), { present: true, value: '' }, 'same pattern holds for twitter');

// --- P2-04: about title drives the heading -----------------------------------
assert.equal(aboutHeading({ name: 'Crabbie', title: 'My Atelier Story' }), 'My Atelier Story', 'a custom Title controls the heading');
assert.equal(aboutHeading({ name: 'Crabbie', title: 'About' }), "Hello, I'm Crabbie.", 'the generic title keeps the Name greeting');
assert.equal(aboutHeading({ name: '', title: 'About' }), 'About');
assert.equal(aboutHeading({ name: '', title: '' }), 'About');
assert.equal(aboutHeadingName({ name: 'Crabbie', title: 'X' }), 'Crabbie');
const model = aboutPublicModel({ name: 'Crabbie', title: 'My Atelier Story', bio: 'b', content: 'c' });
assert.equal(model.heading, 'My Atelier Story', 'core model and renderer agree');
assert.equal(aboutPublicModel({ name: 'Crabbie', title: 'About', bio: 'b', content: 'c' }).heading, "Hello, I'm Crabbie.");
assert.equal(aboutPublicModel({ name: '', title: 'About', bio: '', content: '' }).heading, 'About');

// --- NEW-P2-02: profile image alt ---------------------------------------------
assert.equal(profileImageAlt({ name: 'Crabbie', title: 'About' }), 'Crabbie', 'alt prefers the normalized name');
assert.equal(profileImageAlt({ name: '', title: 'My Story' }), 'My Story');
assert.equal(profileImageAlt({ name: '', title: '' }), 'Crabbie', 'a sane fallback when no author name exists');

// --- P2-07: link-only markdown survives ---------------------------------------
assert.equal(visibleCmsValue('[Read guide](https://example.test/guide)'), '[Read guide](https://example.test/guide)', 'a link-only markdown value is real content');
assert.equal(
  visibleCmsValue('See [my process](https://example.com/process) for details'),
  'See [my process](https://example.com/process) for details',
  'a sentence with a markdown link is kept'
);
assert.equal(visibleCmsValue('[VERSION]'), '', 'a real placeholder token is still blanked');
assert.equal(visibleCmsValue('[CREDIT REQUIREMENT]'), '', 'a multi-word placeholder is still blanked');
assert.equal(visibleCmsValue('[Read guide]'), '[Read guide]', 'ordinary mixed-case brackets are not placeholders');
assert.equal(visibleCmsValue('Just text'), 'Just text');
assert.equal(visibleCmsValue(''), '');

console.log('Public roundtrip core tests passed.');
