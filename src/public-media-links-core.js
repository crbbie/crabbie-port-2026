/**
 * public-media-links-core.js
 * Recognizes authored YouTube / TikTok video URLs and derives safe local
 * preview data. No network calls, no scraping, no secrets, no fake thumbnails:
 * YouTube thumbnails come from the official i.ytimg.com pattern, TikTok links
 * become branded link cards because no secret-less thumbnail API exists.
 */

export function youtubeVideoId(url) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (err) { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
    else {
      const match = parsed.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
      if (match) id = match[2];
    }
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function tiktokVideoId(url) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (err) { return null; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (host !== 'tiktok.com' && host !== 'vt.tiktok.com') return null;
  const match = parsed.pathname.match(/\/video\/(\d{6,25})/);
  return match ? match[1] : null;
}

/** 'youtube' | 'tiktok' | null — never claims a normal external link is a video. */
export function videoLinkKind(url) {
  if (youtubeVideoId(url)) return 'youtube';
  if (tiktokVideoId(url)) return 'tiktok';
  return null;
}

/** Data only: callers own escaping and markup. */
export function videoLinkPreview(url, label) {
  const ytId = youtubeVideoId(url);
  if (ytId) {
    return {
      kind: 'youtube',
      id: ytId,
      thumbnailUrl: 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg',
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + ytId,
      href: url,
      label: label || 'Watch on YouTube'
    };
  }
  const ttId = tiktokVideoId(url);
  if (ttId) {
    return {
      kind: 'tiktok',
      id: ttId,
      thumbnailUrl: '',
      embedUrl: '',
      href: url,
      label: label || 'Watch on TikTok'
    };
  }
  return null;
}
