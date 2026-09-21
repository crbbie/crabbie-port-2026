import assert from 'node:assert/strict';
import { youtubeVideoId, tiktokVideoId, videoLinkKind, videoLinkPreview } from './public-media-links-core.js';

// --- YouTube: every common authored form is recognized ---
assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');

// --- YouTube: non-videos and malformed input never produce an id ---
assert.equal(youtubeVideoId('https://www.youtube.com/@crabbie'), null);
assert.equal(youtubeVideoId('https://www.youtube.com/playlist?list=PL123'), null);
assert.equal(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null, 'no lookalike host');
assert.equal(youtubeVideoId('https://youtube.com/watch?v=short'), null, 'invalid id length');
assert.equal(youtubeVideoId('not a url'), null);
assert.equal(youtubeVideoId(''), null);
assert.equal(youtubeVideoId(null), null);
assert.equal(youtubeVideoId('javascript:alert(1)'), null);

// --- TikTok: standard video URLs are recognized ---
assert.equal(tiktokVideoId('https://www.tiktok.com/@user/video/7301234567890123456'), '7301234567890123456');
assert.equal(tiktokVideoId('https://tiktok.com/@user/video/7301234567890123456?lang=en'), '7301234567890123456');
assert.equal(tiktokVideoId('https://m.tiktok.com/@user/video/7301234567890123456'), '7301234567890123456');
assert.equal(tiktokVideoId('https://www.tiktok.com/@user'), null, 'profile pages are not videos');
assert.equal(tiktokVideoId('https://example.com/@user/video/7301234567890123456'), null);

// --- Kind detection never misclassifies ordinary links ---
assert.equal(videoLinkKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
assert.equal(videoLinkKind('https://www.tiktok.com/@user/video/7301234567890123456'), 'tiktok');
assert.equal(videoLinkKind('https://example.com/portfolio'), null);
assert.equal(videoLinkKind('https://x.com/crbbie'), null);

// --- Preview data: real derived thumbnails only, never faked ---
const yt = videoLinkPreview('https://youtu.be/dQw4w9WgXcQ', 'Process video');
assert.equal(yt.kind, 'youtube');
assert.equal(yt.thumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
assert.equal(yt.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
assert.equal(yt.label, 'Process video');

const tt = videoLinkPreview('https://www.tiktok.com/@user/video/7301234567890123456');
assert.equal(tt.kind, 'tiktok');
assert.equal(tt.thumbnailUrl, '', 'TikTok never fakes a thumbnail URL');
assert.equal(tt.embedUrl, '', 'no secret-less TikTok embed is claimed');

assert.equal(videoLinkPreview('https://example.com/page'), null);

console.log('Public media links core tests passed.');
