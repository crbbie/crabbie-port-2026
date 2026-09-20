/**
 * admin-media-core.js
 * Pure functions for media processing, formatting, and validation.
 */

// Explicit supported-media policy. The Storage bucket enforces the same set
// server-side (see the media deletion safety migration): the client check is
// only a fast, friendly pre-check and never a security boundary.
export const SUPPORTED_MEDIA_MIME_TYPES = Object.freeze([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif', 'image/bmp',
  'image/x-icon', 'image/vnd.microsoft.icon',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac',
  'application/pdf', 'application/zip', 'application/x-zip-compressed'
]);

export const MEDIA_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB, matches the bucket file_size_limit

export const SUPPORTED_MEDIA_EXTENSIONS = Object.freeze([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico',
  'mp4', 'webm', 'mov',
  'mp3', 'wav', 'ogg', 'm4a', 'aac',
  'pdf', 'zip'
]);

/** File chooser hints mirror the upload allowlist, including extension fallback. */
export function supportedMediaInputAccept() {
  return [...SUPPORTED_MEDIA_MIME_TYPES, ...SUPPORTED_MEDIA_EXTENSIONS.map((ext) => '.' + ext)].join(',');
}
const MIME_TYPE_BY_EXTENSION = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  pdf: 'application/pdf', zip: 'application/zip'
});

const EXECUTABLE_EXTENSIONS = /^(exe|bat|cmd|sh|ps1|msi|dll|scr|vbs|com|jar|app|deb|rpm|apk)$/i;

export function fileExtension(name) {
  const clean = String(name || '').trim().replace(/^.*[\\/]/, '');
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export function isSupportedMediaFile(file) {
  const name = file && file.name ? String(file.name) : '';
  const type = file && typeof file.type === 'string' ? file.type.toLowerCase().trim() : '';
  const extension = fileExtension(name);
  if (extension && EXECUTABLE_EXTENSIONS.test(extension)) return { supported: false, reason: 'executable' };
  // Legacy callers validate a size-only object; real browser uploads always
  // carry a name, and the bucket policy is authoritative either way.
  if (!name && !type) return { supported: true, unverified: true };
  if (type && SUPPORTED_MEDIA_MIME_TYPES.includes(type)) return { supported: true };
  if (extension && SUPPORTED_MEDIA_EXTENSIONS.includes(extension)) return { supported: true };
  return { supported: false, reason: 'unsupported' };
}

/** The content type sent to Storage: the declared type when allowed, else the
 *  extension's type, so server-side bucket MIME rules can always apply. */
export function resolveUploadContentType(file) {
  const declared = file && typeof file.type === 'string' ? file.type.toLowerCase().trim() : '';
  if (declared && SUPPORTED_MEDIA_MIME_TYPES.includes(declared)) return declared;
  const byExtension = MIME_TYPE_BY_EXTENSION[fileExtension(file && file.name)];
  return byExtension || declared || 'application/octet-stream';
}

export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_QUALITY = 70;
// Files below this size are already cheap to download; transforming them would
// only add a second failure mode.
export const THUMBNAIL_MIN_SOURCE_BYTES = 250 * 1024;

/** Supabase Image Transformation options (same object, never a new file). */
export const THUMBNAIL_TRANSFORM = Object.freeze({ width: THUMBNAIL_WIDTH, quality: THUMBNAIL_QUALITY, resize: 'cover' });

// Only still raster artwork is transformed. Animated GIF, SVG (vector), ICO,
// PDF, video and audio always render/download their canonical original.
const RASTER_THUMBNAIL_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp']);

export function canUseThumbnail(item) {
  if (!item || item.type !== 'image') return false;
  const extension = fileExtension(item.title || item.storagePath || '');
  if (!RASTER_THUMBNAIL_EXTENSIONS.includes(extension)) return false;
  const size = Number(item.sizeBytes);
  if (Number.isFinite(size) && size > 0 && size < THUMBNAIL_MIN_SOURCE_BYTES) return false;
  return true;
}

/** Thumbnail URL for grid/picker cards, or '' when the original must be used. */
export function thumbnailUrlFor(item, getRenderUrl) {
  if (typeof getRenderUrl !== 'function' || !canUseThumbnail(item)) return '';
  const path = item.storagePath || '';
  if (!path) return '';
  return getRenderUrl(path) || '';
}

/**
 * Card image sources: `src` is the small representation when one is safe,
 * `original` is always the full-resolution canonical URL (preview/download and
 * the fallback when a transformation is unavailable).
 */
export function mediaImageSources(item, { getRenderUrl, getPublicUrl } = {}) {
  const path = (item && item.storagePath) || '';
  let original = (item && item.url) || '';
  if (!original && path && typeof getPublicUrl === 'function') original = getPublicUrl(path) || '';
  const thumbnail = thumbnailUrlFor(item, getRenderUrl);
  return { src: thumbnail || original, original, isThumbnail: Boolean(thumbnail) };
}

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

export function measureImageDimensions(file, options = {}) {
  if (getMediaType(resolveUploadContentType(file), file && file.name) !== 'image') return Promise.resolve(null);
  const createObjectURL = options.createObjectURL || (globalThis.URL && globalThis.URL.createObjectURL);
  const revokeObjectURL = options.revokeObjectURL || (globalThis.URL && globalThis.URL.revokeObjectURL);
  const ImageCtor = options.ImageCtor || globalThis.Image;
  if (typeof createObjectURL !== 'function' || typeof revokeObjectURL !== 'function' || typeof ImageCtor !== 'function') return Promise.resolve(null);
  const objectUrl = createObjectURL(file);
  return new Promise((resolve) => {
    const image = new ImageCtor();
    const finish = (result) => {
      revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onload = () => {
      const width = Number(image.naturalWidth || image.width);
      const height = Number(image.naturalHeight || image.height);
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => finish(null);
    image.src = objectUrl;
  });
}

export function formatMediaItem(row = {}, getPublicUrlFn, getThumbnailUrlFn) {
  const storagePath = row.storage_path || row.storagePath || '';
  let url = row.url || '';
  if (!url && storagePath && typeof getPublicUrlFn === 'function') {
    url = getPublicUrlFn(storagePath);
  }

  const title = row.original_name || row.title || storagePath || 'Untitled';
  const mimeType = row.mime_type || row.mimeType || '';
  const sizeBytes = row.size_bytes != null ? row.size_bytes : row.sizeBytes;

  const item = {
    id: row.id || storagePath,
    storagePath,
    title,
    url,
    type: getMediaType(mimeType, title),
    size: typeof row.size === 'string' ? row.size : formatFileSize(sizeBytes),
    sizeBytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
    mimeType,
    extension: fileExtension(title || storagePath),
    sha256: row.sha256 || null,
    width: Number.isFinite(Number(row.width)) ? Number(row.width) : null,
    height: Number.isFinite(Number(row.height)) ? Number(row.height) : null,
    deletionStatus: row.deletion_status || null,
    alt: row.alt_text || row.alt || '',
    createdAt: row.created_at || row.createdAt || '',
    thumbnailUrl: ''
  };

  // Prompt 4: a small card representation of the same object, never a new file.
  item.thumbnailUrl = (getThumbnailUrlFn && canUseThumbnail(item))
    ? (getThumbnailUrlFn(storagePath, THUMBNAIL_TRANSFORM) || '')
    : '';
  return item;
}

export function validateUploadFile(file, options = {}) {
  const maxSizeBytes = options.maxSizeBytes || MEDIA_MAX_UPLOAD_BYTES;
  if (!file || typeof file !== 'object') {
    return { valid: false, error: 'No file provided.' };
  }
  if (typeof file.size === 'number' && file.size <= 0) {
    return { valid: false, error: 'File is empty or invalid.' };
  }
  if (typeof file.size === 'number' && file.size > maxSizeBytes) {
    const mb = Math.round(maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `File size exceeds ${mb}MB limit.` };
  }
  // Explicit allowlist (extensions AND declared types) instead of an
  // executable blacklist; the Storage bucket enforces the same set.
  const support = isSupportedMediaFile(file);
  if (!support.supported) {
    if (support.reason === 'executable') {
      return { valid: false, error: 'Unsupported file type. Executables are not allowed.' };
    }
    return { valid: false, error: 'Unsupported file type. Allowed: images (PNG, JPEG, GIF, WebP, SVG, AVIF, BMP, ICO), video (MP4, WebM, MOV), audio (MP3, WAV, OGG, M4A, AAC), PDF and ZIP.' };
  }
  return { valid: true };
}
