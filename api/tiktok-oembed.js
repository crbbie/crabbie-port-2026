/** TikTok oEmbed thumbnail proxy.
 *
 * The browser must never fabricate TikTok thumbnails, and TikTok offers no
 * secret-less client thumbnail pattern (unlike YouTube i.ytimg.com). This
 * endpoint resolves a real thumbnail server-side through TikTok's public
 * oEmbed endpoint and returns minimal sanitized JSON for the card enhancer.
 *
 * SSRF safety: only URLs that parse as TikTok videos are accepted, and the
 * only outbound request ever made is to the fixed TikTok oEmbed host with
 * the validated URL as its `url` parameter. Arbitrary hosts, paths, and
 * methods are impossible by construction. No secrets are used or exposed.
 */
import { tiktokVideoId } from '../src/public-media-links-core.js';

const OEMBED_ENDPOINT = 'https://www.tiktok.com/oembed';
const FETCH_TIMEOUT_MS = 8000;

function pickString(value) {
  return typeof value === 'string' ? value : '';
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (err) {
    return false;
  }
}

export default async function handler(request, response) {
  const raw = request && request.query && typeof request.query.url === 'string'
    ? request.query.url
    : '';
  const videoId = tiktokVideoId(raw);
  if (!videoId) {
    response.status(400).send({ error: 'A valid TikTok video URL is required.' });
    return;
  }
  let upstream;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      upstream = await fetch(OEMBED_ENDPOINT + '?url=' + encodeURIComponent(raw), {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'crabbie-portfolio-oembed/1.0' }
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    response.status(502).send({ error: 'TikTok thumbnail unavailable.', fallback: true });
    return;
  }
  if (!upstream || !upstream.ok) {
    response.status(502).send({ error: 'TikTok thumbnail unavailable.', fallback: true });
    return;
  }
  let data = null;
  try {
    data = await upstream.json();
  } catch (err) {
    data = null;
  }
  const thumbnailUrl = data ? pickString(data.thumbnail_url) : '';
  if (!thumbnailUrl || !isHttpsUrl(thumbnailUrl)) {
    response.status(502).send({ error: 'TikTok thumbnail unavailable.', fallback: true });
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  response.status(200).send({
    id: videoId,
    thumbnail_url: thumbnailUrl,
    title: pickString(data.title).slice(0, 200),
    author_name: pickString(data.author_name).slice(0, 120)
  });
}
