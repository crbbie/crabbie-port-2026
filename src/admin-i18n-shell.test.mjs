import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Batch 1 Admin i18n regression guard: shell + login + shared runtime feedback.
 *
 * The dictionary lives inline in the SPA (one i18n system, no duplicate). This
 * test reads the real file, evaluates the dictionary exactly as the browser
 * does, and asserts the Batch 1 scope renders dictionary copy instead of
 * hard-coded English literals. It never asserts "every English string is a bug":
 * only the markers this batch owns are checked.
 */
const html = await readFile(new URL('../crabbie-port26.html', import.meta.url), 'utf8');

function readAdminDictionary() {
  const start = html.indexOf('var ADMIN_I18N = {');
  const end = html.indexOf('\nvar ADMIN_LANG_KEY');
  assert.ok(start !== -1 && end > start, 'the inline ADMIN_I18N literal exists');
  const literal = html.slice(start, end);
  // Keys appended after the literal (load.* feedback) count too: the same file
  // performs those assignments at boot, so the test must see them.
  const appended = (html.match(/^ADMIN_I18N\.(?:en|vi)\['[^']+'\] = .*$/gm) || []).join('\n');
  return new Function(literal + '\n' + appended + '\nreturn ADMIN_I18N;')();
}
const DICT = readAdminDictionary();
const LANGS = ['en', 'vi'];

/** Slice between two unique markers so a check can never leak across modules. */
function region(start, end) {
  const from = html.indexOf(start);
  assert.ok(from !== -1, `marker exists: ${start}`);
  const to = html.indexOf(end, from + start.length);
  assert.ok(to > from, `end marker follows start: ${end}`);
  return html.slice(from, to);
}
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- 1. Locale parity: en and vi expose the same key set, always filled -----
assert.deepEqual(Object.keys(DICT.vi).sort(), Object.keys(DICT.en).sort(), 'en and vi expose exactly the same Admin key set');
for (const lang of LANGS) {
  assert.deepEqual(Object.keys(DICT[lang]).filter((key) => typeof DICT[lang][key] !== 'string'), [], `${lang} values are all strings`);
  assert.deepEqual(Object.keys(DICT[lang]).filter((key) => DICT[lang][key].trim() === ''), [], `${lang} has no empty value`);
}

// ---- 2. Required Batch 1 keys (shared vocabulary included) ------------------
const BATCH1_KEYS = [
  'login.title', 'login.subtitle', 'login.email', 'login.password', 'login.submit', 'login.back', 'login.signingIn', 'login.welcome',
  'auth.error.emailRequired', 'auth.error.passwordRequired', 'auth.error.serviceUnavailable', 'auth.error.invalidCredentials',
  'auth.error.notAuthorized', 'auth.error.rateLimited', 'auth.error.network', 'auth.error.generic',
  'navGroup.overview', 'navGroup.content', 'navGroup.inbox', 'navGroup.pages', 'navGroup.assets',
  'aria.adminModules', 'aria.openAdminMenu', 'aria.adminLanguage', 'media.previewTitle', 'media.closePreview',
  'lang.switchedVi', 'lang.switchedEn',
  'btn.save', 'btn.saveChanges', 'btn.cancel', 'btn.close', 'btn.retry', 'btn.tryAgain', 'btn.previous', 'btn.next',
  'btn.moveUp', 'btn.moveDown', 'btn.remove', 'btn.replace', 'btn.duplicate', 'btn.delete', 'btn.clear', 'btn.select', 'btn.search',
  'label.loading', 'label.noResults', 'label.untitled', 'label.page', 'label.status', 'label.published', 'label.draft',
  'jump.showList', 'jump.hideList', 'jump.toEditor',
  'color.pickerAria', 'color.hexAria', 'color.invalid',
  'load.serviceUnavailable', 'load.failed', 'load.loading', 'load.error', 'load.errorHint', 'load.retry',
  'save.error.conflict', 'save.error.duplicateSlug', 'save.error.missingRecord', 'save.error.missingField',
  'save.error.permissionDenied', 'save.error.notReady', 'save.error.noModule', 'save.error.nothingToSave',
  'save.error.serviceUnavailable', 'save.error.protectionUnavailable', 'save.error.publicRefresh', 'save.error.busy',
  'save.error.generic', 'error.unknown'
];
for (const key of BATCH1_KEYS) {
  for (const lang of LANGS) {
    assert.equal(typeof DICT[lang][key], 'string', `${lang} defines the Batch 1 key ${key}`);
  }
}

// Distinct actions never collapse into one shared key.
assert.equal(DICT.en['btn.delete'], 'Delete');
assert.equal(DICT.en['btn.remove'], 'Remove');
assert.equal(DICT.en['btn.clear'], 'Clear');
assert.equal(new Set([DICT.en['btn.delete'], DICT.en['btn.remove'], DICT.en['btn.clear']]).size, 3, 'Delete / Remove / Clear stay separate actions in EN');
assert.equal(new Set([DICT.vi['btn.delete'], DICT.vi['btn.remove'], DICT.vi['btn.clear']]).size, 3, 'Delete / Remove / Clear stay separate actions in VI');

// ---- 3. EN keeps the exact copy that shipped before the i18n pass -----------
const EN_UNCHANGED = {
  'login.title': 'Atelier Sign In',
  'login.subtitle': 'Sign in with your administrator credentials.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign In',
  'login.back': '← Back to website',
  'login.signingIn': 'Signing in…',
  'login.welcome': 'Welcome back to Atelier!',
  'navGroup.overview': 'Overview',
  'navGroup.content': 'Content',
  'navGroup.inbox': 'Inbox',
  'navGroup.pages': 'Pages',
  'navGroup.assets': 'Assets',
  'aria.adminModules': 'Admin modules',
  'aria.openAdminMenu': 'Open admin menu',
  'aria.adminLanguage': 'Admin language',
  'media.previewTitle': 'Media preview',
  'media.closePreview': 'Close preview',
  'jump.showList': '▾ Show list',
  'jump.hideList': '▴ Hide list',
  'jump.toEditor': '↓ Editor',
  'color.invalid': 'Use a valid #RRGGBB value.',
  'lang.switchedVi': 'Admin language: Vietnamese',
  'lang.switchedEn': 'Admin language: English'
};
for (const [key, copy] of Object.entries(EN_UNCHANGED)) {
  assert.equal(DICT.en[key], copy, `en.${key} keeps the shipped English copy`);
}
assert.match(DICT.en['save.error.conflict'], /^Conflict:/, 'the stale-save conflict still reads as a conflict');
assert.match(DICT.en['save.error.duplicateSlug'], /already used/, 'the duplicate-slug conflict still names the cause');
assert.equal(DICT.en['save.error.generic'], 'Save failed: {message}', 'the generic save failure is a parameterized template');
assert.equal(DICT.en['color.pickerAria'], '{label} picker');
assert.equal(DICT.en['color.hexAria'], '{label} hex');


// ---- 3b. VI has no leftover English in the Batch 1 scope -------------------
const VI_TRANSLATED = [
  'login.title', 'login.subtitle', 'login.password', 'login.submit', 'login.back', 'login.signingIn', 'login.welcome',
  'auth.error.emailRequired', 'auth.error.passwordRequired', 'auth.error.serviceUnavailable', 'auth.error.invalidCredentials',
  'auth.error.notAuthorized', 'auth.error.rateLimited', 'auth.error.network', 'auth.error.generic',
  'navGroup.overview', 'navGroup.content', 'navGroup.inbox', 'navGroup.pages', 'navGroup.assets',
  'aria.adminModules', 'aria.openAdminMenu', 'aria.adminLanguage', 'media.previewTitle', 'media.closePreview',
  'lang.switchedVi', 'lang.switchedEn',
  'btn.retry', 'btn.tryAgain', 'btn.moveUp', 'btn.moveDown', 'btn.remove', 'btn.replace', 'btn.clear', 'btn.select',
  'label.loading', 'label.noResults', 'label.untitled', 'label.page', 'label.draft',
  'jump.showList', 'jump.hideList', 'jump.toEditor',
  'color.pickerAria', 'color.hexAria', 'color.invalid',
  'load.serviceUnavailable', 'load.failed',
  'save.error.conflict', 'save.error.duplicateSlug', 'save.error.missingRecord', 'save.error.missingField',
  'save.error.permissionDenied', 'save.error.notReady', 'save.error.noModule', 'save.error.nothingToSave',
  'save.error.serviceUnavailable', 'save.error.protectionUnavailable', 'save.error.publicRefresh', 'save.error.busy',
  'save.error.generic', 'error.unknown'
];
for (const key of VI_TRANSLATED) {
  assert.notEqual(DICT.vi[key], DICT.en[key], `vi.${key} must not reuse the English copy`);
}

// ---- 3c. Shell + login markup is dictionary-driven -------------------------
const loginMarkup = region('<div class="admin-login-shell"', '<div class="admin-shell"');
for (const [key, tail] of [
  ['login.title', '>Atelier Sign In</h2>'],
  ['login.subtitle', '>Sign in with your administrator credentials.</p>'],
  ['login.email', '>Email</label>'],
  ['login.password', '>Password</label>'],
  ['login.submit', '>Sign In</button>'],
  ['login.back', '>← Back to website</a>']
]) {
  assert.match(loginMarkup, new RegExp(`data-t="${escapeRe(key)}"[^>]*${escapeRe(tail)}`), `the login markup binds ${key} to its shipped copy`);
}

const shellMarkup = region('<div class="admin-shell"', '<footer>');
for (const attribute of ['aria.adminModules', 'aria.openAdminMenu', 'aria.adminLanguage']) {
  assert.ok(shellMarkup.includes(`data-t-aria-label="${attribute}"`), `the shell localizes ${attribute}`);
}
for (const [key, label] of [['navGroup.overview', 'Overview'], ['navGroup.content', 'Content'], ['navGroup.inbox', 'Inbox'], ['navGroup.pages', 'Pages'], ['navGroup.assets', 'Assets']]) {
  assert.match(shellMarkup, new RegExp(`data-t="${escapeRe(key)}">${label}</div>`), `the shell routing group ${label} is localized`);
}
const previewMarkup = region('<div class="adm-modal" id="adminMediaPreviewModal"', '<input type="file" id="adminGlobalFileInput"');
assert.ok(previewMarkup.includes('data-t="media.previewTitle"'), 'the media preview title is localized');
assert.ok(previewMarkup.includes('data-t="media.closePreview"'), 'the media preview close button is localized');


// ---- 4. Switching locale never dirties the draft or touches stored data ----
const setAdminLang = region('function setAdminLang(lang, announce)', "\ndocument.querySelectorAll('[data-admin-lang]')");
assert.ok(setAdminLang.includes("tAdmin(lang === 'vi' ? 'lang.switchedVi' : 'lang.switchedEn')"), 'the switch announcement is localized');
assert.equal(setAdminLang.includes('Ngôn ngữ Admin: Tiếng Việt'), false, 'no literal VI announcement remains');
assert.equal(setAdminLang.includes('Admin language: English'), false, 'no literal EN announcement remains');
assert.match(setAdminLang, /store\(ADMIN_LANG_KEY, lang\)/, 'the switch persists the locale under the language key');
assert.equal((setAdminLang.match(/store\(/g) || []).length, 1, 'switching the locale writes exactly one stored value');
assert.doesNotMatch(setAdminLang, /ADMIN_DRAFT|ADMIN_DATA|markDirty|dirtyTargets|draftRevision/, 'switching the locale never touches the draft or its dirty state');
assert.ok(html.includes("scope.querySelectorAll('[data-t-aria-label]')"), 'attribute copy is localized through the same dictionary pass');

// ---- 5. Auth failure presentation -----------------------------------------
const loginHandler = region("var loginForm = document.getElementById('adminLoginForm');", 'if(adminBurgerBtn && adminSidebar){');
for (const literal of ["'Signing in…'", 'Welcome back to Atelier!', "'Login failed'", "'Login error'", 'throw new Error(']) {
  assert.equal(loginHandler.includes(literal), false, `the login handler no longer hard-codes ${literal}`);
}
assert.ok(loginHandler.includes("tAdmin('login.signingIn')"), 'the busy label is localized');
assert.ok(loginHandler.includes("tAdmin('login.submit')"), 'the restored submit label is localized');
assert.ok(loginHandler.includes("tAdmin('login.welcome')"), 'the welcome toast is localized');
assert.ok(loginHandler.includes('adminAuthErrorText(result)'), 'every auth failure goes through one presentation mapping');
assert.ok(loginHandler.includes('showFailure(res)'), 'the login result is presented through that single mapping');
assert.ok(loginHandler.includes("{ code: 'service_unavailable'"), 'a missing auth service maps to the service-unavailable message');
assert.ok(loginHandler.includes("console.warn('Admin sign-in failed (internal detail):'"), 'raw provider text stays in the debug path');


// ---- 6. Shared load/save feedback: no English prefix string building -------
const hydrate = region('function hydrateAdminSnapshot()', '\nfunction retryAdminHydration');
assert.equal(hydrate.includes("'Admin data service is unavailable.'"), false, 'the load failure sentence is localized');
assert.ok(hydrate.includes("adminLoadErrorText('service_unavailable')") && hydrate.includes("adminLoadErrorText('hydration_failed')"), 'load failures map through stable codes');
assert.ok(hydrate.includes("console.error('Admin hydration failed:', err)"), 'the internal hydration reason stays in the console');

const startSave = region('function startAdminSave(msg, scope)', '\nasync function doSaveCommit');
assert.ok(startSave.includes("tAdmin('save.error.protectionUnavailable')"), 'missing save protection is localized');

const saveCommit = region('async function doSaveCommit(msg, scope)', '\nfunction doDiscard');
assert.ok(saveCommit.includes("adminInternalError('admin_service_unavailable', 'Admin persistence service is unavailable.')"), 'the persistence guard carries a stable code');
assert.ok(saveCommit.includes("adminInternalError('no_editable_module', 'No editable module selected.')"), 'the internal reason stays attached to a stable code');
assert.ok(saveCommit.includes("adminInternalError('nothing_to_save', 'Nothing to save.')"), 'the empty-save guard carries a stable code');

const saveError = region('function adminSaveErrorMessage(err)', '\nfunction adminSaveTransactionActive');
for (const prefix of ["'Save blocked: '", "'Conflict: '", "'Save failed: '", "'Unknown error'"]) {
  assert.equal(saveError.includes(prefix), false, `the save toast no longer concatenates ${prefix}`);
}
assert.ok(saveError.includes('adminSaveErrorText(err)'), 'the save toast is dictionary-driven');

const tAdminFmt = region('function tAdminFmt(key, params)', '\n/* Error presentation');
assert.ok(tAdminFmt.includes('formatAdminMessage'), 'the parameterized formatter comes from the shared core module');
assert.ok(html.includes('<script src="/src/admin-i18n-core.js"></script>'), 'the shared i18n core module ships with the SPA');

const discard = region('function doDiscard()', '\nfunction refreshStickySaveBar');
assert.ok(discard.includes("tAdmin('save.error.busy')"), 'the busy-discard warning is localized');
const confirmDiscard = region('function confirmDiscard(onOk)', '\nfunction confirmDelete(');
assert.ok(confirmDiscard.includes("tAdmin('save.error.busy')"), 'the pre-discard busy warning is localized');


// ---- 7. Shared jumpbar + color input copy ---------------------------------
const jumpbars = region('function injectAdminJumpbars()', '\nfunction installMediaUiDelegation');
for (const literal of ['Show list', 'Hide list', '↓ Editor']) {
  assert.equal(jumpbars.includes(literal), false, `the jump bar no longer hard-codes "${literal}"`);
}
assert.ok(jumpbars.includes("tAdmin('jump.hideList')") && jumpbars.includes("tAdmin('jump.toEditor')"), 'jump bar labels are localized');
const jumpToggle = region("if(action === 'toggle-list')", "  if(action === 'to-editor')");
assert.ok(jumpToggle.includes("tAdmin(collapsed ? 'jump.showList' : 'jump.hideList')"), 'the collapsible list label is localized');

const colorInput = region('function inputColor(label, path, opts)', '\nfunction setColorFieldInvalid');
assert.equal(colorInput.includes('Use a valid #RRGGBB value.'), false, 'the color error copy is localized');
assert.ok(colorInput.includes("tAdminFmt('color.pickerAria', { label: label })"), 'the picker aria label is parameterized');
assert.ok(colorInput.includes("tAdminFmt('color.hexAria', { label: label })"), 'the hex aria label is parameterized');
assert.ok(colorInput.includes("tAdmin('color.invalid')"), 'the invalid-color message is localized');
assert.equal(html.includes('>Use a valid #RRGGBB value.<'), false, 'no generated color error keeps the English literal');

const previewHead = region('function mgrPreviewHtml(item)', '\nfunction openMediaPreview');
assert.equal(previewHead.includes("'Media preview'"), false, 'the generated preview title is localized');
assert.equal(previewHead.includes('aria-label="Close preview"'), false, 'the generated preview close label is localized');
assert.ok(previewHead.includes("tAdmin('media.previewTitle')") && previewHead.includes("tAdmin('media.closePreview')"), 'the generated preview copy routes through the dictionary');

console.log('Admin i18n shell tests passed.');

