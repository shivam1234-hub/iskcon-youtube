'use strict';

/**
 * YouTube data fetches for the renderer (utils/ytFetch.web.ts).
 *
 * utils/youtube.ts reads youtube.com pages, youtubei/v1 and suggestqueries
 * straight from the client. In a browser renderer those are cross-origin and
 * CORS blocks the response, so the renderer asks the main process, which has
 * no CORS. Only these hosts are reachable, so page script can't turn this into
 * a general-purpose proxy.
 */
const { session } = require('electron');

const TIMEOUT_MS = 25000;
const ALLOWED_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'suggestqueries.google.com']);
// Headers the renderer may set; anything else (Cookie, Host...) is dropped.
const ALLOWED_HEADERS = new Set(['user-agent', 'accept-language', 'content-type', 'accept']);

let ses = null;

async function request(req) {
  if (!req || typeof req.url !== 'string') return null;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v;
  }
  // Its own cookie jar: the data fetches never share state with the player.
  if (!ses) ses = session.fromPartition('persist:yt-data');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await ses.fetch(url.toString(), {
      method,
      headers,
      body: method === 'POST' && typeof req.body === 'string' ? req.body : undefined,
      redirect: 'follow',
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { request };
