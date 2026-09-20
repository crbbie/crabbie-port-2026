import assert from 'node:assert/strict';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile,
  isSupportedMediaFile,
  resolveUploadContentType,
  SUPPORTED_MEDIA_MIME_TYPES,
  canUseThumbnail,
  thumbnailUrlFor,
  mediaImageSources,
  THUMBNAIL_TRANSFORM
} from './admin-media-core.js';

// 1. sanitizeStorageFileName
{
  const filename = sanitizeStorageFileName('My Cool Illustration (Draft #1).PNG');
  assert.match(filename, /^\d+_my_cool_illustration_draft_1\.png$/);

  const pathWithDir = sanitizeStorageFileName('C:\\images\\folder/photo.jpeg');
  assert.match(pathWithDir, /^\d+_photo\.jpeg$/);

  const empty = sanitizeStorageFileName('');
  assert.match(empty, /^\d+_file$/);
}

// 2. formatFileSize
{
  assert.equal(formatFileSize(null), '—');
  assert.equal(formatFileSize(-10), '—');
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(1024), '1 KB');
  assert.equal(formatFileSize(1024 * 320), '320 KB');
  assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.5 MB');
}

// 3. getMediaType
{
  assert.equal(getMediaType('image/png', 'test.png'), 'image');
  assert.equal(getMediaType('', 'photo.JPEG'), 'image');
  assert.equal(getMediaType('video/mp4', 'demo.mp4'), 'video');
  assert.equal(getMediaType('', 'clip.webm'), 'video');
  assert.equal(getMediaType('audio/mpeg', 'theme.mp3'), 'audio');
  assert.equal(getMediaType('application/pdf', 'doc.pdf'), 'file');
}

// 4. formatMediaItem
{
  const dbRow = {
    id: 'row-123',
    storage_path: 'uploads/12345_sample.png',
    original_name: 'sample.png',
    mime_type: 'image/png',
    size_bytes: 204800,
    alt_text: 'A sample artwork',
    created_at: '2026-09-18T10:00:00Z'
  };

  const item = formatMediaItem(dbRow, (path) => `https://example.supabase.co/storage/v1/object/public/media/${path}`);
  assert.equal(item.id, 'row-123');
  assert.equal(item.storagePath, 'uploads/12345_sample.png');
  assert.equal(item.title, 'sample.png');
  assert.equal(item.url, 'https://example.supabase.co/storage/v1/object/public/media/uploads/12345_sample.png');
  assert.equal(item.type, 'image');
  assert.equal(item.size, '200 KB');
  assert.equal(item.alt, 'A sample artwork');
}

// 5. validateUploadFile
{
  assert.equal(validateUploadFile(null).valid, false);
  assert.equal(validateUploadFile({ size: 1000 }).valid, true);
  assert.equal(validateUploadFile({ size: 60 * 1024 * 1024 }).valid, false);
  assert.match(validateUploadFile({ size: 60 * 1024 * 1024 }).error, /exceeds 50MB/);
}

// 6. Explicit supported-media policy (client pre-check; bucket rules are authoritative)
{
  assert.equal(isSupportedMediaFile({ name: 'art.png', type: 'image/png' }).supported, true);
  assert.equal(isSupportedMediaFile({ name: 'art.png', type: 'application/octet-stream' }).supported, true, 'an allowed extension is enough');
  assert.equal(isSupportedMediaFile({ name: 'clip.mp4' }).supported, true);
  assert.equal(isSupportedMediaFile({ name: 'guide.pdf', type: 'application/pdf' }).supported, true);
  assert.equal(isSupportedMediaFile({ name: 'petal-pack.zip' }).supported, true, 'free-asset downloads still upload');
  assert.equal(isSupportedMediaFile({ name: 'notes.txt', type: 'text/plain' }).supported, false);
  assert.equal(isSupportedMediaFile({ name: 'page.html', type: 'text/html' }).supported, false);
  assert.equal(isSupportedMediaFile({ name: 'payload.exe' }).reason, 'executable');
  assert.equal(isSupportedMediaFile({ size: 10 }).unverified, true, 'a size-only legacy object stays valid');

  const rejected = validateUploadFile({ name: 'notes.txt', type: 'text/plain', size: 10 });
  assert.equal(rejected.valid, false);
  assert.match(rejected.error, /Allowed: images/);
  assert.equal(validateUploadFile({ name: 'petal-pack.zip', type: 'application/zip', size: 10 }).valid, true);
  assert.equal(validateUploadFile({ name: 'art.webp', size: 10 }).valid, true);
  assert.equal(validateUploadFile({ name: 'payload.exe', size: 10 }).valid, false);
  assert.match(validateUploadFile({ name: 'payload.exe', size: 10 }).error, /Executables are not allowed/i);

  assert.equal(resolveUploadContentType({ name: 'art.png', type: '' }), 'image/png');
  assert.equal(resolveUploadContentType({ name: 'pack.zip', type: 'application/zip' }), 'application/zip');
  assert.equal(resolveUploadContentType({ name: 'art.png', type: 'text/html' }), 'image/png', 'an unsupported declared type falls back to the extension');
  assert.equal(resolveUploadContentType({ name: 'blob' }), 'application/octet-stream');
  assert.ok(SUPPORTED_MEDIA_MIME_TYPES.includes('image/avif'));
  assert.ok(SUPPORTED_MEDIA_MIME_TYPES.includes('application/zip'));
}

// 7. Prompt 4: richer media item mapping from the explicit column list
{
  const dbRow = {
    id: 'media-9', storage_path: 'uploads/9_art.png', original_name: 'art.png', mime_type: 'image/png',
    size_bytes: 4 * 1024 * 1024, alt_text: 'art', created_at: '2026-01-01T00:00:00Z',
    sha256: 'deadbeef', deletion_status: 'active'
  };
  const item = formatMediaItem(dbRow, (path) => 'https://cdn/' + path, (path) => 'https://cdn/render/' + path + '?width=480');
  assert.equal(item.sizeBytes, 4 * 1024 * 1024);
  assert.equal(item.mimeType, 'image/png');
  assert.equal(item.extension, 'png');
  assert.equal(item.sha256, 'deadbeef');
  assert.equal(item.deletionStatus, 'active');
  assert.equal(item.url, 'https://cdn/uploads/9_art.png', 'the canonical original URL is unchanged');
  assert.equal(item.thumbnailUrl, 'https://cdn/render/uploads/9_art.png?width=480');
  assert.equal(item.size, '4.0 MB');
  assert.equal(THUMBNAIL_TRANSFORM.resize, 'cover');
}

// 8. Thumbnail strategy: still raster only, original everywhere else
{
  const build = (over) => Object.assign({ id: 'x', storagePath: 'uploads/x.png', title: 'x.png', url: 'https://cdn/x.png', type: 'image', sizeBytes: 3 * 1024 * 1024 }, over);
  assert.equal(canUseThumbnail(build({})), true);
  assert.equal(canUseThumbnail(build({ title: 'anim.gif' })), false, 'animated GIF keeps the original');
  assert.equal(canUseThumbnail(build({ title: 'vector.svg' })), false, 'SVG is never rasterised');
  assert.equal(canUseThumbnail(build({ title: 'small.png', sizeBytes: 1024 })), false, 'already small files use the original');
  assert.equal(canUseThumbnail(build({ title: 'clip.mp4', type: 'video' })), false);
  assert.equal(canUseThumbnail(build({ title: 'guide.pdf', type: 'file' })), false);
  assert.equal(canUseThumbnail(null), false);

  const render = (path) => 'https://cdn/render/' + path;
  assert.equal(thumbnailUrlFor(build({}), render), 'https://cdn/render/uploads/x.png');
  assert.equal(thumbnailUrlFor(build({ title: 'anim.gif' }), render), '');
  assert.equal(thumbnailUrlFor(build({}), null), '', 'no transformation support means no thumbnail URL');

  const big = mediaImageSources(build({}), { getRenderUrl: render, getPublicUrl: (path) => 'https://cdn/' + path });
  assert.equal(big.isThumbnail, true);
  assert.equal(big.src, 'https://cdn/render/uploads/x.png');
  assert.equal(big.original, 'https://cdn/x.png', 'the full original stays available');

  const gif = mediaImageSources(build({ title: 'anim.gif', url: 'https://cdn/anim.gif' }), { getRenderUrl: render, getPublicUrl: (path) => 'https://cdn/' + path });
  assert.equal(gif.isThumbnail, false);
  assert.equal(gif.src, 'https://cdn/anim.gif', 'the original is the fallback');
}


// --- Patch 4: intrinsic image measurement through an injected decoder ---
import { measureImageDimensions } from './admin-media-core.js';

{
  let revoked = null;
  const measured = await measureImageDimensions(
    { name: 'art.png', type: 'image/png', size: 12 },
    {
      createObjectURL: () => 'blob:measured',
      revokeObjectURL: (url) => { revoked = url; },
      ImageCtor: function StubImage() {
        Object.defineProperty(this, 'src', {
          set() { this.naturalWidth = 640; this.naturalHeight = 480; this.onload(); }
        });
      }
    }
  );
  assert.deepEqual(measured, { width: 640, height: 480 }, 'a decodable image reports intrinsic dimensions');
  assert.equal(revoked, 'blob:measured', 'the object URL is revoked after a successful decode');
}

{
  let createdUrls = 0;
  const nonImage = await measureImageDimensions(
    { name: 'clip.mp4', type: 'video/mp4', size: 12 },
    { createObjectURL: () => { createdUrls += 1; return 'blob:video'; }, revokeObjectURL: () => {}, ImageCtor: function () {} }
  );
  assert.equal(nonImage, null, 'non-image files are never measured');
  assert.equal(createdUrls, 0, 'no object URL is created for a non-image file');
}

{
  let revoked = null;
  const failure = await measureImageDimensions(
    { name: 'broken.png', type: 'image/png', size: 12 },
    {
      createObjectURL: () => 'blob:broken',
      revokeObjectURL: (url) => { revoked = url; },
      ImageCtor: function BrokenImage() {
        Object.defineProperty(this, 'src', { set() { this.onerror(new Error('decode failed')); } });
      }
    }
  );
  assert.equal(failure, null, 'a decode failure resolves null instead of throwing');
  assert.equal(revoked, 'blob:broken', 'a failed decode still revokes the object URL');
}

assert.equal(await measureImageDimensions({ name: 'art.png', type: 'image/png', size: 12 }, { createObjectURL: null, revokeObjectURL: null, ImageCtor: null }), null, 'a missing decoder resolves null');
assert.equal(await measureImageDimensions(null, {}), null, 'a missing file resolves null');

console.log('Admin media core tests passed.');
