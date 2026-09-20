/**
 * check-security-headers.mjs
 * Static review of the deployment headers: they must exist, keep the SPA
 * rewrites, and never claim a Content-Security-Policy that the application
 * cannot satisfy yet (inline scripts/styles plus the runtime CDN imports).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const headerMap = {};
for (const entry of config.headers || []) {
  for (const header of entry.headers || []) headerMap[header.key.toLowerCase()] = header.value;
}

assert.equal(headerMap['x-content-type-options'], 'nosniff');
assert.match(headerMap['referrer-policy'] || '', /strict-origin/);
assert.match(headerMap['permissions-policy'] || '', /geolocation=\(\)/);
assert.match(headerMap['x-frame-options'] || '', /SAMEORIGIN/);
assert.equal(config.headers.length, 1, 'one catch-all header rule');
assert.equal(config.headers[0].source, '/(.*)');

assert.equal(config.rewrites.length, 3, 'the SPA rewrites must survive the header change');
assert.deepEqual(config.rewrites.map((entry) => entry.source), ['/', '/admin', '/admin/:path*']);

// A CSP is intentionally NOT shipped yet: the admin page still has inline
// scripts/styles and loads tus-js-client from a CDN. Shipping a strict policy
// here would break the application, so it stays an explicit follow-up.
assert.equal(headerMap['content-security-policy'], undefined, 'no half-tested CSP: see the documented follow-up');

console.log('Security header check passed (nosniff, referrer, permissions, frame options; CSP is a documented follow-up).');
