import assert from 'node:assert/strict';
import handler from '../api/tiktok-oembed.js';

function mockResponse() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.body = body; return res; };
  return res;
}

const realFetch = globalThis.fetch;

// 1. URL parser/validation: only TikTok video URLs are accepted.
{
  for (const bad of ['', 'not a url', 'https://example.test/x', 'https://www.tiktok.com/@crabbie', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://evil.test/tiktok.com/video/1234567890123456789']) {
    const res = mockResponse();
    await handler({ query: { url: bad } }, res);
    assert.equal(res.statusCode, 400, 'rejects ' + JSON.stringify(bad));
  }
  const res = mockResponse();
  await handler({}, res);
  assert.equal(res.statusCode, 400, 'rejects a missing query');
}

// 2. Successful thumbnail: minimal sanitized JSON, cache headers.
{
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.ok(options && options.signal, 'the upstream request carries an abort signal');
    return {
      ok: true,
      json: async () => ({
        thumbnail_url: 'https://p16-sign.tiktokcdn.com/abc.jpg',
        title: 'A video title',
        author_name: '@crabbie',
        extra_untrusted_field: '<script>alert(1)</script>'
      })
    };
  };
  try {
    const res = mockResponse();
    await handler({ query: { url: 'https://www.tiktok.com/@crabbie/video/7301234567890123456' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      id: '7301234567890123456',
      thumbnail_url: 'https://p16-sign.tiktokcdn.com/abc.jpg',
      title: 'A video title',
      author_name: '@crabbie'
    }, 'only sanitized fields are returned');
    assert.equal(calls.length, 1, 'exactly one upstream request runs');
    assert.ok(calls[0].startsWith('https://www.tiktok.com/oembed?url='), 'the only outbound host is the fixed oEmbed endpoint (no SSRF): ' + calls[0]);
    assert.ok(calls[0].includes('7301234567890123456'), 'the validated URL travels as the oEmbed parameter');
    assert.ok(String(res.headers['cache-control']).includes('s-maxage=86400'), 'thumbnails are cached');
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 3. Fallback when the upstream request fails.
{
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const res = mockResponse();
    await handler({ query: { url: 'https://m.tiktok.com/@crabbie/video/7301234567890123456' } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.fallback, true, 'the client keeps its branded placeholder');
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 4. Fallback on non-OK upstream and on unusable payloads.
{
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    const res = mockResponse();
    await handler({ query: { url: 'https://vt.tiktok.com/abcdef123456/' } }, res);
    assert.equal(res.statusCode, 400, 'vt short links without a video id are rejected before any fetch');
  } finally {
    globalThis.fetch = realFetch;
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ thumbnail_url: 'http://insecure.test/x.jpg' }) });
  try {
    const res = mockResponse();
    await handler({ query: { url: 'https://www.tiktok.com/@crabbie/video/7301234567890123456' } }, res);
    assert.equal(res.statusCode, 502, 'a non-HTTPS thumbnail is refused');
    assert.equal(res.body.fallback, true);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('TikTok oEmbed route tests passed.');
