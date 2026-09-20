import assert from 'node:assert/strict';
import { renderRichText, renderRichInline, normalizeRichTextSize } from './public-richtext-core.js';

assert.equal(normalizeRichTextSize('large'), 'large');
assert.equal(normalizeRichTextSize('small'), 'small');
assert.equal(normalizeRichTextSize('huge'), 'normal', 'unknown sizes fall back to normal');
assert.equal(normalizeRichTextSize(null), 'normal');

// Bold + italic, paragraphs, line breaks.
assert.equal(
  renderRichText('Hello **bold** and *italic*', 'normal'),
  '<p class="cms rt-size-normal">Hello <strong>bold</strong> and <em>italic</em></p>'
);
assert.equal(
  renderRichText('First para\n\nSecond para', 'large'),
  '<p class="cms rt-size-large">First para</p><p class="cms rt-size-large">Second para</p>',
  'blank lines become paragraphs'
);
assert.equal(
  renderRichText('line one\nline two', 'small'),
  '<p class="cms rt-size-small">line one<br>line two</p>',
  'single breaks stay breaks'
);
assert.equal(renderRichText('', 'normal'), '', 'empty text renders nothing');
assert.equal(renderRichText('   \n  ', 'normal'), '', 'whitespace-only renders nothing');

// XSS safety: escape first, transform after.
assert.equal(
  renderRichText('<script>alert(1)</script> **bold**', 'normal'),
  '<p class="cms rt-size-normal">&lt;script&gt;alert(1)&lt;/script&gt; <strong>bold</strong></p>',
  'authored HTML is escaped, allowed tokens still transform'
);
assert.equal(
  renderRichText('[x](javascript:alert(1))', 'normal'),
  '<p class="cms rt-size-normal">[x](javascript:alert(1))</p>',
  'no link syntax exists, so no URL vector exists'
);
assert.ok(!renderRichText('<img src=x onerror=alert(1)>', 'x').includes('<img'), 'no raw tags survive');

// Unmatched markers stay literal.
assert.equal(
  renderRichText('a * lone star', 'normal'),
  '<p class="cms rt-size-normal">a * lone star</p>'
);

// Inline variant has no wrapper.
assert.equal(renderRichInline('Hi **there**'), 'Hi <strong>there</strong>');
assert.equal(renderRichInline('<b>raw</b>'), '&lt;b&gt;raw&lt;/b&gt;', 'inline output is escaped too');

console.log('Public rich text core tests passed.');
