import assert from 'node:assert/strict';
import {
  normalizePersonProfileUrl,
  normalizePerson,
  validatePersonForSave,
  isCreditVisiblePerson,
  isThankYouPerson,
  normalizePeopleIds,
  resolveProjectPeople,
  normalizeCreditLabel,
  creditLabelForProject,
  projectCreditStrip,
  joinCreditNames,
  normalizeThanksSettings,
  validateThanksSettings,
  thankYouList,
  thankYouPresentation,
  initialsForName,
  formatPersonRow,
  mapPersonRow,
  PEOPLE_CREDIT_LABEL_DEFAULT
} from './people-core.js';

const person = (over = {}) => ({
  id: 'p1', display_name: 'Crabbie Client', avatar_path: 'media/a.png',
  avatar_alt: '', profile_url: 'https://example.com/u', kind: 'client',
  published: true, show_in_thank_you: true, sort_order: 0, ...over
});

// URL attacks
assert.equal(normalizePersonProfileUrl(''), '');
assert.equal(normalizePersonProfileUrl(null), '');
assert.equal(normalizePersonProfileUrl('http://example.com'), '');
assert.equal(normalizePersonProfileUrl('javascript:alert(1)'), '');
assert.equal(normalizePersonProfileUrl('data:text/html,hi'), '');
assert.equal(normalizePersonProfileUrl('blob:https://x'), '');
assert.equal(normalizePersonProfileUrl('mailto:a@b.c'), '');
assert.equal(normalizePersonProfileUrl('//example.com/x'), '');
assert.equal(normalizePersonProfileUrl('/relative/path'), '');
assert.equal(normalizePersonProfileUrl('#hash'), '');
assert.equal(normalizePersonProfileUrl('https://user:pass@example.com/'), '');
assert.equal(normalizePersonProfileUrl('not a url'), '');
assert.ok(normalizePersonProfileUrl('https://example.com/u').startsWith('https://'));

// normalization/defaults
assert.equal(normalizePerson({ kind: 'CLIENT' }).kind, 'client');
assert.equal(normalizePerson({ kind: 'weird' }).kind, 'other');
assert.equal(normalizePerson({ display_name: '  A  ' }).displayName, 'A');

// validation: empty name, bad url, thank-you needs avatar
assert.ok(!validatePersonForSave({ display_name: '' }).ok);
assert.ok(!validatePersonForSave(person({ profile_url: 'http://x.com' })).ok);
assert.ok(!validatePersonForSave(person({ avatar_path: '' })).ok);
assert.ok(validatePersonForSave(person({ avatar_path: '', show_in_thank_you: false })).ok);
assert.ok(!validatePersonForSave(person({ avatar_alt: 'x'.repeat(241) })).ok);
// new people records do not require slugs
assert.ok(validatePersonForSave(person({})).ok);

// visibility: publication vs thank-you independently
assert.ok(isCreditVisiblePerson(person()));
assert.ok(!isCreditVisiblePerson(person({ published: false })));
assert.ok(!isCreditVisiblePerson(person({ display_name: '  ' })));
assert.ok(isCreditVisiblePerson(person({ show_in_thank_you: false }))); // credits only
assert.ok(isThankYouPerson(person()));
assert.ok(!isThankYouPerson(person({ show_in_thank_you: false })));
assert.ok(!isThankYouPerson(person({ published: false })));
assert.ok(!isThankYouPerson(person({ avatar_path: '' })));

// ordered references: dedupe, empty selection, missing/unpublished filtering
assert.deepEqual(normalizePeopleIds(['a', 'b', 'a', ' ', null]), ['a', 'b']);
assert.deepEqual(normalizePeopleIds(null), []);
const byId = {
  a: normalizePerson(person({ id: 'a', display_name: 'A' })),
  b: normalizePerson(person({ id: 'b', display_name: 'B', published: false })),
};
assert.deepEqual(resolveProjectPeople(['a', 'b', 'missing', 'a'], byId).map((p) => p.id), ['a']);
// person edits resolve everywhere (no copied data): same object reference
assert.equal(resolveProjectPeople(['a'], byId)[0].displayName, 'A');

// labels: default/override, max length, generic credits preserved
assert.equal(creditLabelForProject({}), PEOPLE_CREDIT_LABEL_DEFAULT);
assert.equal(creditLabelForProject({ peopleCreditLabel: '' }), 'With');
assert.equal(creditLabelForProject({ peopleCreditLabel: 'Client:' }), 'Client:');
assert.equal(normalizeCreditLabel('x'.repeat(200)).length, 80);
const strip = projectCreditStrip({ content: { peopleCreditLabel: '' }, peopleIds: ['a'] }, byId);
assert.equal(strip.label, 'With');
assert.equal(strip.people.length, 1);
assert.equal(projectCreditStrip({ content: {}, peopleIds: [] }, byId), null);
assert.equal(projectCreditStrip({ content: {}, peopleIds: ['b', 'missing'] }, byId), null);

// joining
assert.equal(joinCreditNames([]), '');
assert.equal(joinCreditNames(['A']), 'A');
assert.equal(joinCreditNames(['A', 'B']), 'A & B');
assert.equal(joinCreditNames(['A', 'B', 'C']), 'A, B & C');

// thanks settings: defaults, empty body stays empty, blank heading error
assert.deepEqual(normalizeThanksSettings(null).heading, 'Made with lovely people ♡');
assert.equal(normalizeThanksSettings({ enabled: true, heading: 'H', body: '' }).body, '');
assert.ok(!validateThanksSettings({ enabled: true, heading: '  ' }).ok);
assert.ok(validateThanksSettings({ enabled: false, heading: '' }).ok);

// thank-you list ordering + counts 0,1,2-5,6,100+
assert.deepEqual(thankYouList([]), []);
const many = Array.from({ length: 100 }, (_, i) => person({ id: 'p' + i, display_name: 'N' + i, sort_order: 100 - i }));
assert.equal(thankYouList(many).length, 100);
assert.equal(thankYouList(many)[0].displayName, 'N99');
assert.equal(thankYouPresentation(0), 'hidden');
assert.equal(thankYouPresentation(1), 'static');
assert.equal(thankYouPresentation(5), 'static');
assert.equal(thankYouPresentation(6), 'marquee');
assert.equal(thankYouPresentation(6, { reducedMotion: true }), 'static-scroll');
assert.equal(thankYouPresentation(30, { coarsePointer: true }), 'static-scroll');

// initials incl. non-Latin, no layout-shift fallback
assert.equal(initialsForName('Crabbie Pie'), 'CP');
assert.equal(initialsForName('  '), '♡');
assert.ok(initialsForName('Nguyễn Văn').length <= 2);

// save/hydrate roundtrip shapes
const row = formatPersonRow({ displayName: 'A', avatar: 'media/a.png', profileUrl: 'https://example.com', kind: 'studio', published: true, showInThankYou: true }, 3);
assert.equal(row.display_name, 'A');
assert.equal(row.sort_order, 3);
assert.throws(() => formatPersonRow({ displayName: '' }), /display name/i);
assert.throws(() => formatPersonRow({ displayName: 'A', profileUrl: 'http://x' }), /https/);
const mapped = mapPersonRow({ id: 'x', display_name: ' X ', avatar_path: 'a', avatar_alt: 'b', profile_url: 'https://e.com', kind: 'ARTIST', published: 1, show_in_thank_you: 1, sort_order: 2, updated_at: 't' });
assert.equal(mapped.displayName, 'X');
assert.equal(mapped.kind, 'artist');
assert.equal(mapped.originalUpdatedAt, 't');

console.log('people-core tests passed');
