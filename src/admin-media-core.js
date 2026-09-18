/**
 * admin-media-core.js
 * Pure functions for media processing, formatting, and validation.
 */

export function sanitizeStorageFileName(originalName = 'unnamed_file') {
  const cleanName = String(originalName).trim().replace(/^.*[\\\/]/, '');
  const lastDot = cleanName.lastIndexOf('.');
  let base = lastDot > 0 ? cleanName.slice(0, lastDot) : cleanName;
  const ext = lastDot > 0 ? cleanName.slice(lastDot).toLowerCase() : '';

  const safeBase = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'file';

  return `${Date.now()}_${safeBase}${ext}`;
}

export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes)) || Number(bytes) < 0) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function getMediaType(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();

  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name)) {
    return 'image';
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(name)) {
    return 'audio';
  }
  return 'file';
}

export function formatMediaItem(row = {}, getPublicUrlFn) {
  const storagePath = row.storage_path || row.storagePath || '';
  let url = row.url || '';
  if (!url && storagePath && typeof getPublicUrlFn === 'function') {
    url = getPublicUrlFn(storagePath);
  }

  const title = row.original_name || row.title || storagePath || 'Untitled';
  const mimeType = row.mime_type || row.mimeType || '';
  const sizeBytes = row.size_bytes != null ? row.size_bytes : row.sizeBytes;

  return {
    id: row.id || storagePath,
    storagePath,
    title,
    url,
    type: getMediaType(mimeType, title),
    size: typeof row.size === 'string' ? row.size : formatFileSize(sizeBytes),
    alt: row.alt_text || row.alt || '',
    createdAt: row.created_at || row.createdAt || ''
  };
}

export function validateUploadFile(file, options = {}) {
  const maxSizeBytes = options.maxSizeBytes || 50 * 1024 * 1024; // 50MB default
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }
  if (typeof file.size === 'number' && file.size > maxSizeBytes) {
    const mb = Math.round(maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `File size exceeds ${mb}MB limit.` };
  }
  return { valid: true };
}
