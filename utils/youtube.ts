import type { ChannelResult, SearchItem, VideoResult } from '../data/types';
import { httpGetJson, httpGetText, httpPostJson } from './ytFetch';

/**
 * Keyless YouTube data: search, video details + related, channel pages and
 * search suggestions.
 *
 * Every desktop page embeds an `ytInitialData` blob with everything it shows
 * plus continuation tokens, and also ships the innertube key needed to fetch
 * the next page. No Data API key, no quota.
 *
 * A desktop User-Agent is required: the mobile pages ship a different shape
 * with no ytInitialData.
 *
 * YouTube currently renders lists in two shapes and moves surfaces between
 * them without notice: the older `videoRenderer` (search) and the newer
 * `lockupViewModel` (related videos, channel grids). Both are parsed
 * everywhere so a migration on their side does not empty a screen on ours.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };

/** Fallback only; the version the page itself reports is preferred. */
const DEFAULT_CLIENT_VERSION = '2.20261030.02.00';

export interface Session {
  apiKey: string;
  clientVersion: string;
}

export interface Page<T> {
  items: T[];
  /** Pass back to the matching `*More` function; null when exhausted. */
  continuation: string | null;
  session: Session | null;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function walk(node: any, visit: (n: any) => void) {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, visit);
  } else if (node && typeof node === 'object') {
    visit(node);
    for (const k in node) walk(node[k], visit);
  }
}

function durationToSec(t: string | undefined): number | null {
  if (!t) return null;
  const parts = t.trim().split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

const runsText = (o: any): string =>
  o?.simpleText ?? o?.content ?? (o?.runs ?? []).map((r: any) => r.text).join('');

const lastUrl = (thumbs: any[] | undefined): string | undefined => {
  const u = thumbs?.[thumbs.length - 1]?.url;
  if (!u) return undefined;
  return u.startsWith('//') ? `https:${u}` : u;
};

function readSession(html: string): Session | null {
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  if (!key) return null;
  const ver = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  return { apiKey: key, clientVersion: ver ?? DEFAULT_CLIENT_VERSION };
}

function extractJson(html: string, varName: string): any | null {
  // Anchored on the terminator YouTube actually emits; a lazy match on `};`
  // alone stops inside string values that contain the same characters.
  const re = new RegExp(`${varName}\\s*=\\s*(\\{.+?\\});\\s*(?:var |</script>)`, 's');
  const m = html.match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// The transport lives in ./ytFetch (plain fetch on the phone; the Electron
// main process on desktop, where a browser renderer would hit CORS). All the
// parsing below is shared.
async function getPage(url: string, signal?: AbortSignal): Promise<string> {
  return httpGetText(url, HEADERS, signal);
}

async function innertube(
  endpoint: 'search' | 'browse' | 'next',
  session: Session,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<any> {
  return httpPostJson(
    `https://www.youtube.com/youtubei/v1/${endpoint}?key=${session.apiKey}&prettyPrint=false`,
    { ...HEADERS, 'Content-Type': 'application/json' },
    JSON.stringify({
      context: {
        client: { clientName: 'WEB', clientVersion: session.clientVersion, hl: 'en', gl: 'US' },
      },
      ...body,
    }),
    signal,
  );
}

// ---------------------------------------------------------------------------
// Item parsers
// ---------------------------------------------------------------------------

/** Search sometimes ships a bare "5.3M"; give it the unit every other surface has. */
function withViews(t: string): string | undefined {
  if (!t) return undefined;
  return /view|watching/i.test(t) ? t : `${t} views`;
}

function parseVideoRenderer(vr: any): VideoResult | null {
  if (!vr?.videoId) return null;
  const owner = vr.ownerText ?? vr.longBylineText ?? vr.shortBylineText;
  const badges: any[] = vr.badges ?? [];
  const isLive =
    badges.some((b) => b?.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW') ||
    (vr.thumbnailOverlays ?? []).some(
      (o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE',
    );
  return {
    videoId: vr.videoId,
    title: runsText(vr.title),
    channel: runsText(owner),
    channelId: owner?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
    channelAvatar: lastUrl(
      vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails,
    ),
    durationSec: durationToSec(vr.lengthText?.simpleText),
    publishedText: vr.publishedTimeText?.simpleText,
    viewsText: withViews(runsText(vr.shortViewCountText) || runsText(vr.viewCountText)),
    thumbnail: lastUrl(vr.thumbnail?.thumbnails),
    isLive,
  };
}

/**
 * The newer list item. Its metadata is a set of untyped text rows, so each
 * part is classified by its wording: "1.2M views" / "3 days ago" / anything
 * else is the channel name (present only where the channel is not implied).
 */
function parseLockup(l: any): VideoResult | null {
  if (!l?.contentId || l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const meta = l.metadata?.lockupMetadataViewModel;
  const rows: any[] = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];

  let channel = '';
  let viewsText: string | undefined;
  let publishedText: string | undefined;
  for (const row of rows) {
    for (const part of row?.metadataParts ?? []) {
      const t: string = part?.text?.content ?? '';
      if (!t) continue;
      if (/\b(views?|watching)\b/i.test(t) || part?.leadingIcon?.name === 'PLAY_ARROW_OUTLINED') {
        viewsText = /view|watching/i.test(t) ? t : `${t} views`;
      } else if (/\bago\b|^Streamed|^Premier/i.test(t)) {
        publishedText = t;
      } else if (!channel) {
        channel = t;
      }
    }
  }

  let durationSec: number | null = null;
  let isLive = false;
  walk(l.contentImage, (n) => {
    const b = n.thumbnailBadgeViewModel;
    if (!b?.text) return;
    if (/^LIVE$/i.test(b.text) || b.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE') isLive = true;
    const d = durationToSec(b.text);
    if (d != null && durationSec == null) durationSec = d;
  });

  const avatarVm = meta?.image?.decoratedAvatarViewModel;
  const browse =
    avatarVm?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint;

  return {
    videoId: l.contentId,
    title: meta?.title?.content ?? '',
    channel,
    channelId: browse?.browseId,
    channelAvatar: lastUrl(avatarVm?.avatar?.avatarViewModel?.image?.sources),
    durationSec,
    publishedText,
    viewsText,
    thumbnail: lastUrl(l.contentImage?.thumbnailViewModel?.image?.sources),
    isLive,
  };
}

function parseChannelRenderer(cr: any): ChannelResult | null {
  if (!cr?.channelId) return null;
  // YouTube puts the @handle in subscriberCountText and the count in
  // videoCountText on some layouts; normalise by content.
  const a = runsText(cr.subscriberCountText);
  const b = runsText(cr.videoCountText);
  const handle = [a, b].find((t) => t.startsWith('@'));
  const subs = [a, b].find((t) => /subscriber/i.test(t));
  return {
    channelId: cr.channelId,
    title: runsText(cr.title),
    avatar: lastUrl(cr.thumbnail?.thumbnails),
    handle,
    subscribersText: subs,
  };
}

/**
 * Pull every video (and optionally channel) out of a blob, in page order,
 * plus the longest continuation token — a page ships several (filter chips,
 * shelves, the search box) and the list's own "load more" token is reliably
 * the longest.
 */
function harvest(
  data: any,
  opts: { channels?: boolean; skipVideoId?: string } = {},
): { items: SearchItem[]; continuation: string | null } {
  const items: SearchItem[] = [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  if (opts.skipVideoId) seen.add(opts.skipVideoId);

  walk(data, (n) => {
    const v = n.videoRenderer
      ? parseVideoRenderer(n.videoRenderer)
      : n.lockupViewModel
        ? parseLockup(n.lockupViewModel)
        : null;
    if (v && v.title && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      items.push({ kind: 'video', ...v });
    }
    if (opts.channels && n.channelRenderer) {
      const c = parseChannelRenderer(n.channelRenderer);
      if (c && !seen.has(c.channelId)) {
        seen.add(c.channelId);
        items.push({ kind: 'channel', ...c });
      }
    }
    const tok = n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (tok) tokens.push(tok);
  });

  tokens.sort((a, b) => b.length - a.length);
  return { items, continuation: tokens[0] ?? null };
}

const onlyVideos = (items: SearchItem[]): VideoResult[] =>
  items
    .filter((i): i is { kind: 'video' } & VideoResult => i.kind === 'video')
    .map(({ kind, ...v }) => v);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchSort = 'relevance' | 'date' | 'views';
export type SearchType = 'all' | 'video' | 'channel';

/**
 * YouTube's `sp` filter parameter is a base64 protobuf: field 1 = sort order,
 * field 2 = a nested filter whose field 2 is the result type. Precomputed for
 * every combination offered.
 */
const SP: Record<SearchSort, Record<SearchType, string>> = {
  relevance: { all: '', video: 'EgIQAQ%3D%3D', channel: 'EgIQAg%3D%3D' },
  date: { all: 'CAI%3D', video: 'CAISAhAB', channel: 'CAISAhAC' },
  views: { all: 'CAM%3D', video: 'CAMSAhAB', channel: 'CAMSAhAC' },
};

export async function search(
  query: string,
  opts: { sort?: SearchSort; type?: SearchType } = {},
  signal?: AbortSignal,
): Promise<Page<SearchItem>> {
  const sp = SP[opts.sort ?? 'relevance'][opts.type ?? 'all'];
  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en` +
    (sp ? `&sp=${sp}` : '');
  const html = await getPage(url, signal);
  const data = extractJson(html, 'ytInitialData');
  if (!data) throw new Error('Could not read YouTube results');
  const { items, continuation } = harvest(data, { channels: true });
  return { items, continuation, session: readSession(html) };
}

export async function searchMore(
  session: Session,
  continuation: string,
  signal?: AbortSignal,
): Promise<Page<SearchItem>> {
  const data = await innertube('search', session, { continuation }, signal);
  const { items, continuation: next } = harvest(data, { channels: true });
  return { items, continuation: next, session };
}

/** Typeahead suggestions — the endpoint YouTube's own search box uses. */
export async function suggest(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query.trim()) return [];
  const json = await httpGetJson(
    `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(query)}`,
    signal,
  );
  return Array.isArray(json?.[1]) ? json[1].map(String) : [];
}

// ---------------------------------------------------------------------------
// Video details + related ("Up next")
// ---------------------------------------------------------------------------

export interface VideoDetails {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  channelAvatar?: string;
  subscribersText?: string;
  viewCount: number | null;
  /** ISO date, when the page carries one. */
  publishDate?: string;
  description: string;
  lengthSec: number | null;
  related: VideoResult[];
  continuation: string | null;
  session: Session | null;
}

export async function getVideo(videoId: string, signal?: AbortSignal): Promise<VideoDetails> {
  const html = await getPage(`https://www.youtube.com/watch?v=${videoId}&hl=en`, signal);
  const data = extractJson(html, 'ytInitialData');
  const player = extractJson(html, 'ytInitialPlayerResponse');
  if (!data && !player) throw new Error('Could not read this video');

  const vd = player?.videoDetails ?? {};
  const micro = player?.microformat?.playerMicroformatRenderer ?? {};

  let owner: any = null;
  walk(data, (n) => {
    if (!owner && n.videoOwnerRenderer) owner = n.videoOwnerRenderer;
  });

  // Only the secondary column is related videos; the primary column also
  // holds lockups (end screens, shelves) that are not "up next".
  const secondary = data?.contents?.twoColumnWatchNextResults?.secondaryResults ?? data;
  const { items, continuation } = harvest(secondary, { skipVideoId: videoId });

  return {
    videoId,
    title: vd.title || runsText(micro.title),
    channel: vd.author || runsText(owner?.title),
    channelId: vd.channelId ?? owner?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
    channelAvatar: lastUrl(owner?.thumbnail?.thumbnails),
    subscribersText: owner?.subscriberCountText?.simpleText,
    viewCount: vd.viewCount ? Number(vd.viewCount) : null,
    publishDate: micro.publishDate ?? micro.uploadDate,
    description: vd.shortDescription ?? '',
    lengthSec: vd.lengthSeconds ? Number(vd.lengthSeconds) : null,
    related: onlyVideos(items),
    continuation,
    session: readSession(html),
  };
}

export async function relatedMore(
  session: Session,
  continuation: string,
  signal?: AbortSignal,
): Promise<Page<VideoResult>> {
  const data = await innertube('next', session, { continuation }, signal);
  const { items, continuation: next } = harvest(data);
  return { items: onlyVideos(items), continuation: next, session };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface ChannelInfo extends ChannelResult {
  description?: string;
  banner?: string;
}

export interface ChannelPage extends Page<VideoResult> {
  channel: ChannelInfo;
}

/** Accepts a UC… id or an @handle. */
export async function getChannel(idOrHandle: string, signal?: AbortSignal): Promise<ChannelPage> {
  const path = idOrHandle.startsWith('@')
    ? `/${encodeURIComponent(idOrHandle)}`
    : `/channel/${idOrHandle}`;
  const html = await getPage(`https://www.youtube.com${path}/videos?hl=en`, signal);
  const data = extractJson(html, 'ytInitialData');
  if (!data) throw new Error('Could not read this channel');

  const meta = data.metadata?.channelMetadataRenderer ?? {};
  let header: any = null;
  walk(data.header, (n) => {
    if (!header && n.pageHeaderViewModel) header = n.pageHeaderViewModel;
  });

  let handle: string | undefined;
  let subscribersText: string | undefined;
  let videoCountText: string | undefined;
  for (const row of header?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
    for (const part of row?.metadataParts ?? []) {
      const t: string = part?.text?.content ?? '';
      if (t.startsWith('@')) handle = t;
      else if (/subscriber/i.test(t)) subscribersText = t;
      else if (/video/i.test(t)) videoCountText = t;
    }
  }

  // Only the selected tab's grid: other tabs and the chip bar carry their own
  // continuations, and taking one of those returns an empty next page.
  const tabs: any[] = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const selected =
    tabs.find((t) => t?.tabRenderer?.selected)?.tabRenderer?.content ?? data.contents;
  const { items, continuation } = harvest(selected);

  const avatar =
    lastUrl(meta.avatar?.thumbnails) ??
    lastUrl(header?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources);
  const title: string = meta.title ?? runsText(header?.title?.dynamicTextViewModel?.text);
  const channelId: string = meta.externalId ?? (idOrHandle.startsWith('UC') ? idOrHandle : '');

  return {
    channel: {
      channelId,
      title,
      avatar,
      banner: lastUrl(header?.banner?.imageBannerViewModel?.image?.sources),
      handle,
      subscribersText,
      videoCountText,
      description: meta.description,
    },
    items: onlyVideos(items).map((v) => ({
      ...v,
      channel: v.channel || title,
      channelId: v.channelId ?? channelId,
      channelAvatar: v.channelAvatar ?? avatar,
    })),
    continuation,
    session: readSession(html),
  };
}

export async function channelMore(
  session: Session,
  continuation: string,
  signal?: AbortSignal,
): Promise<Page<VideoResult>> {
  const data = await innertube('browse', session, { continuation }, signal);
  const { items, continuation: next } = harvest(data);
  return { items: onlyVideos(items), continuation: next, session };
}

// ---------------------------------------------------------------------------
// Shorts
// ---------------------------------------------------------------------------
// Shorts arrive as `shortsLockupViewModel`: id, title and view count only.
// Search results carry no channel at all; the Shorts screen looks the channel
// up (getVideo) when a Short comes on screen and re-checks it then.

function parseShortsLockup(s: any): VideoResult | null {
  const reel = s?.onTap?.innertubeCommand?.reelWatchEndpoint;
  const videoId: string | undefined =
    reel?.videoId ?? (typeof s?.entityId === 'string' ? s.entityId.replace(/^shorts-shelf-item-/, '') : undefined);
  const title: string = s?.overlayMetadata?.primaryText?.content ?? '';
  if (!videoId || !title) return null;
  return {
    videoId,
    title,
    channel: '',
    durationSec: null,
    viewsText: s?.overlayMetadata?.secondaryText?.content,
    thumbnail:
      reel?.thumbnail?.thumbnails?.[0]?.url ??
      lastUrl(s?.thumbnail?.sources) ??
      `https://i.ytimg.com/vi/${videoId}/frame0.jpg`,
  };
}

function harvestShorts(data: any): VideoResult[] {
  const out: VideoResult[] = [];
  const seen = new Set<string>();
  walk(data, (n) => {
    if (!n.shortsLockupViewModel) return;
    const v = parseShortsLockup(n.shortsLockupViewModel);
    if (v && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push(v);
    }
  });
  return out;
}

/** YouTube's own "Shorts" search filter (type = 9). */
const SP_SHORTS = 'EgIQCQ%3D%3D';

export async function searchShorts(query: string, signal?: AbortSignal): Promise<VideoResult[]> {
  const html = await getPage(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=${SP_SHORTS}`,
    signal,
  );
  const data = extractJson(html, 'ytInitialData');
  if (!data) throw new Error('Could not read YouTube results');
  return harvestShorts(data);
}

/** A channel's Shorts tab, newest first; every item carries the channel. */
export async function channelShorts(channelId: string, signal?: AbortSignal): Promise<VideoResult[]> {
  const html = await getPage(`https://www.youtube.com/channel/${channelId}/shorts?hl=en`, signal);
  const data = extractJson(html, 'ytInitialData');
  if (!data) throw new Error('Could not read this channel');
  const meta = data.metadata?.channelMetadataRenderer ?? {};
  const tabs: any[] = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const selected = tabs.find((t) => t?.tabRenderer?.selected)?.tabRenderer?.content;
  // No selected Shorts tab means YouTube redirected to the home tab: the
  // channel has no Shorts, and the home tab's shelves are not its own.
  if (!selected || !/shorts/i.test(tabs.find((t) => t?.tabRenderer?.selected)?.tabRenderer?.title ?? '')) {
    return [];
  }
  const avatar = lastUrl(meta.avatar?.thumbnails);
  return harvestShorts(selected).map((v) => ({
    ...v,
    channel: meta.title ?? '',
    channelId: meta.externalId ?? channelId,
    channelAvatar: avatar,
  }));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Rough age in seconds from YouTube's relative wording, for sorting a merged
 * subscription feed newest-first. Unknown text sorts last.
 */
export function ageSeconds(text: string | undefined): number {
  if (!text) return Number.MAX_SAFE_INTEGER;
  const m = text.match(/(\d+)\s*(seconds?|sec|minutes?|min|hours?|hr|days?|d\b|weeks?|wk|months?|mo|years?|yr|y\b)/i);
  if (!m) return Number.MAX_SAFE_INTEGER - 1;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const unit =
    u.startsWith('s') ? 1
      : u.startsWith('mi') ? 60
        : u.startsWith('h') ? 3600
          : u.startsWith('d') ? 86400
            : u.startsWith('w') ? 604800
              : u.startsWith('mo') ? 2592000
                : 31536000;
  return n * unit;
}

/** 1834180821 -> "1.8B views" */
export function compactViews(n: number | null): string {
  if (n == null) return '';
  const fmt = (v: number, s: string) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${s}`;
  const short =
    n >= 1e9 ? fmt(n / 1e9, 'B')
      : n >= 1e6 ? fmt(n / 1e6, 'M')
        : n >= 1e3 ? fmt(n / 1e3, 'K')
          : String(n);
  return `${short} ${n === 1 ? 'view' : 'views'}`;
}

export function formatPublishDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Player embed
// ---------------------------------------------------------------------------

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/**
 * `playsinline` and `rel=0` keep playback inside the WebView instead of
 * bouncing to the YouTube app. `enablejsapi=1` is what lets us command the
 * player (pause on leave, play/pause from PiP and the notification) — without
 * it the iframe ignores postMessage.
 *
 * Never load this straight into a WebView as its top-level document — see
 * {@link youtubeEmbedHtml}.
 */
export const embedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&fs=1&enablejsapi=1&autoplay=1`;

/**
 * Injected into the wrapper document to pause playback. The player lives in a
 * cross-origin iframe, so postMessage is the only channel in, and id/channel
 * MUST match the 'listening' handshake or the player ignores the command.
 */
export const PAUSE_SCRIPT = `
  (function () {
    try {
      var f = document.querySelector('iframe');
      if (f && f.contentWindow) {
        f.contentWindow.postMessage(JSON.stringify({
          event: 'command', func: 'pauseVideo', args: [], id: 1, channel: 'widget'
        }), '*');
      }
    } catch (e) {}
    true;
  })();
`;

export const PLAY_SCRIPT = `
  (function () {
    try {
      var f = document.querySelector('iframe');
      if (f && f.contentWindow) {
        f.contentWindow.postMessage(JSON.stringify({
          event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget'
        }), '*');
      }
    } catch (e) {}
    true;
  })();
`;

/**
 * Origin the WebView presents itself as while hosting the embed.
 *
 * 1. The embed refuses a request with no `Referer` ("Video player
 *    configuration error"), and a top-level navigation sends none — so the
 *    player has to sit in an iframe inside a page that has an origin.
 * 2. That origin must be a real third-party site: youtube.com reads as a
 *    self-embed and fails with "This video is unavailable".
 *
 * Nothing is ever fetched from this domain; it is only an identity.
 */
export const YOUTUBE_EMBED_ORIGIN = 'https://vanitube.app';

/**
 * A minimal page hosting the embed in an iframe, for WebView's
 * `{ html, baseUrl }` source. Reports readiness, play state, position,
 * duration, player errors and fullscreen changes back over postMessage.
 *
 * Deliberately ASCII-only: Hermes stores any string constant containing a
 * non-ASCII character as UTF-16.
 */
export function youtubeEmbedHtml(videoId: string, startSec = 0, extraParams = ''): string {
  const url = (startSec > 0
    ? `${embedUrl(videoId)}&start=${Math.floor(startSec)}`
    : embedUrl(videoId)) + extraParams;
  const src = url.replace(/&/g, '&amp;');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #000; overflow: hidden; }
      iframe { display: block; border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowfullscreen
    ></iframe>
    <script>
      var f = document.querySelector('iframe');
      function tell(msg) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      }
      function listen() {
        try {
          f.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
        } catch (e) {}
      }
      f.addEventListener('load', function () {
        tell('ready');
        listen();
        setTimeout(listen, 500);
        setTimeout(listen, 1500);
      });
      f.addEventListener('error', function () { tell('error'); });

      var lastSent = -1;
      var sentDuration = false;
      window.addEventListener('message', function (e) {
        try {
          var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (!d) return;
          if (d.event === 'onError') { tell('playerError:' + d.info); return; }
          if (!d.info) return;
          var st = d.info.playerState;
          if (st === 1) tell('state:playing');
          else if (st === 2) tell('state:paused');
          else if (st === 0) tell('state:ended');
          var t = d.info.currentTime;
          if (typeof t === 'number' && Math.abs(t - lastSent) >= 1) {
            lastSent = t;
            tell('time:' + Math.floor(t));
          }
          var dur = d.info.duration;
          if (typeof dur === 'number' && dur > 0 && !sentDuration) {
            sentDuration = true;
            tell('dur:' + Math.floor(dur));
          }
        } catch (err) {}
      });

      function onFsChange() {
        var el = document.fullscreenElement || document.webkitFullscreenElement;
        tell(el ? 'fullscreen:on' : 'fullscreen:off');
      }
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
    </script>
  </body>
</html>`;
}
