import assert from 'node:assert/strict';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile,
  isSupportedMediaFile,
  resolveUploadContentType,
  SUPPORTED_MEDIA_MIME_TYPES
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

console.log('Admin media core tests passed.');
