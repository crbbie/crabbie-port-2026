import assert from 'node:assert/strict';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile
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

console.log('Admin media core tests passed.');
