import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChannelResult, VideoResult } from '../data/types';

/**
 * ISKCON-only content filter. EVERY list the app shows goes through this:
 * home feed, topic chips, search, Up next, channel pages, subscriptions,
 * history and Watch later. There is deliberately no setting to turn it off.
 *
 * A video is shown only if:
 *   1. it is not blocked (serials, episodes, promos, Shorts outside the
 *      Shorts tab, TV channels,
 *      status/reel/remix clips, films), AND
 *   2. it comes from a trusted ISKCON channel below, OR its title/channel
 *      names something unmistakably ISKCON (ISKCON, Prabhupada, Hare Krishna,
 *      Mayapur, an ISKCON guru...).
 *
 * Generic words like "Krishna", "Radha", "Gita", "bhajan" or "kirtan" are NOT
 * enough on their own: that is exactly how TV serials ("RadhaKrishn" on
 * Star Bharat) and unrelated bhakti channels slip in.
 */

/** Official ISKCON temple, media and guru channels (ids looked up 2026-11-06). */
const TRUSTED: [string, string][] = [
  ['UCxoZSTfGpj67R7CUUopv86A', 'Srila Prabhupada Lectures'],
  ['UCDTX-lo7YZCg_P28_Mo4NOg', 'The Acharya'],
  ['UCQ7xTD6qcU8xtkgG7-hL3GQ', 'Vanimedia Prabhupada'],
  ['UCCALb-FthGAwr5b9HDR0Ogw', 'Srila Prabhupada Teachings'],
  ['UC-Ajeil3NjKKgeN9-fxeWwQ', 'Prabhupada Memories'],
  ['UCj7T-FkT33nH7ZG4VqVaVfA', 'Bhaktivedanta Book Trust'],
  ['UCypj9Vvizo4cCERfDFIG3zw', 'Mayapur TV'],
  ['UCdYy78yFUqU8XmbgoMqQeyA', 'Mayapur TV - English'],
  ['UC4mjwXdDLZ_iDysNToElEtw', 'Mayapur TV - Hindi'],
  ['UCxY22GmVyLwQ0PyxaIdFctA', 'ISKCON Mayapur'],
  ['UCzN7cEEDufL4W-lg-p-8kFA', 'Kirtan Mayapur'],
  ['UCKsPhfStsvK9NKPjXj0DLvg', 'Radha Gopinath Media - ISKCON Desire Tree'],
  ['UCuyNwFU3fCEhRi3OPk3WvXw', 'RG Media'],
  ['UCyF-6S2Z8NHNwlnIHKWAraw', 'ISKCON Chowpatty Hindi'],
  ['UCZ8S3qwowiFztAQBRTawWfA', 'Hare Krsna TV'],
  ['UCAA6IsLVfbHrP1I_lzxv09Q', 'ISKCON Vrindavan'],
  ['UC1vJ4RlWSHP6n0xL2G1tkYQ', 'ISKCON Juhu Mumbai'],
  ['UCxPrcWdZqlotspjMCTs6kRA', 'ISKCON Navi Mumbai'],
  ['UCt8rtuZMlfSCMcb2ZxMgubA', 'ISKCON Delhi'],
  ['UChWqU4PXRLrL4SlOwgRNa9w', 'ISKCON Dwarka'],
  ['UCuirvO7R7VK16rTwdgHR9fg', 'ISKCON Noida'],
  ['UC4HsD5v-9ib6FBFoIX9vE_w', 'ISKCON NVCC Pune'],
  ['UCFcKlA6WzJGPF0M3ika-Bmw', 'ISKCON Ujjain'],
  ['UCDV_sYpz7cfHR6gd_oVXtTQ', 'ISKCON Bhaktivedanta Manor'],
  ['UCzywp4-atthpp2FEKnhivYQ', 'Radhanath Swami'],
  ['UCUZTWReIbBYqOFL9TyKFblg', 'HH Radhanath Swami Media Services'],
  ['UChphslaY9GHwg1fKjngCJIg', 'Radhanath Swami Media'],
  ['UCcINSh7PGNE_7wEXKeLFOiw', 'Jayapataka Swami'],
  ['UCWDm3A9Y_LYQSmw5EvZ6kIQ', 'The Victory Flag (Jayapataka Swami)'],
  ['UCsdDftx_W6Hi3DWNsZRJvIA', 'Lokanath Swami'],
  ['UCNEHle-sOFgchr-94Pxx3vg', 'Zoom Japa Talks (Lokanath Swami)'],
  ['UCYgPxZOYIUCr9l6b23BU3uw', 'Gopal Krishna Goswami'],
  ['UC7wHMnwgzY11p6-6sp4njrQ', 'Bhakti Charu Swami'],
  ['UCSTz9B0VBboVjUxWTZEeOtg', 'Indradyumna Swami'],
  ['UChsO6bC-R60j13bXejvzDxA', 'Sacinandana Swami'],
  ['UCYSvmuqB8zax0hyPkzYd5aQ', 'Bhakti Vikasa Swami'],
  ['UCnPGve3EAiGCw_CHuGbF9IA', 'Bhakti Vikasa Swami English'],
  ['UC8M2t-ln7lq5Pvmkm0izPsg', 'Niranjana Swami'],
  ['UC1fi12IBsyyqRc5kAF-iCHg', 'Romapada Swami'],
  ['UC2825KTrZp-Tciln-B5lSQA', 'Vaisesika Dasa'],
  ['UCz22l7kbce-uFJAoaZqxD1A', 'Gaur Gopal Das'],
  ['UCVBohU3S3fKk-pagBqYsfaQ', 'My Ashraya (Amogh Lila Prabhu)'],
  ['UCnD3dRJRtzt5bbkIxE8LVVA', 'Chaitanya Charan'],
  ['UCQidfTbPXE9z_GQShqa9cjg', 'Gaura Vani'],
  ['UCMhMOiv7TftjZCr-hdpwJpg', 'Madhavas Rock Band'],
  ['UCDJVpt2p_KivFy4Bfms64Ew', 'Jahnavi Harrison'],
  // ISKCON's own news service (iskconnews.org); the only channel allowed past
  // the NEWS block below.
  ['UCvGFcGHY8-m3Dp-l5InP67g', 'ISKCON News'],
];

export const TRUSTED_IDS = new Set(TRUSTED.map(([id]) => id));
export const TRUSTED_CHANNELS = TRUSTED.map(([channelId, title]) => ({ channelId, title }));

/** Lowercase, strip diacritics (ā→a, ṣ→s, ṛ→r), collapse spaces. */
function norm(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Any one of these marks a video as ISKCON. Matched on normalised text. */
const STRONG = [
  // Deliberately NOT generic Gaudiya words (srila, gaudiya, mahaprabhu,
  // nityananda): other lineages use them too, and the ask is ISKCON only.
  'iskcon', 'iskon', 'prabhupad', 'hare krishna', 'hare krsna', 'harekrishna',
  'harekrsna', 'bhaktivedanta', 'mayapur', 'mahamantra', 'maha mantra', 'maha-mantra',
  'radhanath', 'jayapataka', 'lokanath swami', 'gaur gopal', 'amogh lila',
  'chaitanya charan', 'bhakti charu', 'indradyumna', 'sacinandana', 'bhakti vikasa',
  'gopal krishna goswami', 'romapada', 'niranjana swami', 'vaisesika', 'radha gopinath',
  'radha rasbihari', 'radha govinda', 'madhavas', 'gaura vani', 'jahnavi harrison',
  // Devanagari
  'इस्कॉन', 'इस्कोन', 'प्रभुपाद', 'हरे कृष्ण', 'मायापुर', 'महामंत्र',
].map(norm);

/**
 * Respectful forms of address used for ISKCON speakers ("HG Kartikeya
 * Prabhu", "Radhanath Maharaj"). On their own they are too common (Shivaji
 * Maharaj serials, "Prabhu ji" film songs), so they count only together with
 * a devotional subject from TOPIC below.
 */
const HONORIFIC: RegExp[] = [
  /\bprabhu ?ji\b/, /\bprabhu\b/, /\bmaharaj(a|ji)?\b/, /\bswami\b/, /\bgoswami\b/, /\bgosvami\b/,
  /\bdasa?\b/, /\bdasi\b/, /\bhg\b/, /\bhh\b/, /\bh\.g\./, /\bh\.h\./,
  /his grace/, /his holiness/, /her grace/,
  /प्रभुजी/, /प्रभु जी/, /महाराज/, /स्वामी/, /गोस्वामी/, /दास/,
];

const TOPIC = [
  'krishna', 'krsna', 'gita', 'bhagavat', 'srimad', 'radha', 'gaura', 'gauranga', 'chaitanya',
  'caitanya', 'nitai', 'nityananda', 'vrindavan', 'vrndavan', 'vrindavana', 'japa', 'kirtan',
  'bhakti', 'bhakta', 'devotee', 'devotion', 'govinda', 'gopal', 'narasimha', 'nrsimha',
  'jagannath', 'rupa goswami', 'rupa gosvami', 'sanatana', 'goswamis', 'gosvamis', 'vaishnav',
  'vaisnav', 'holy name', 'harinam', 'damodar', 'ekadashi', 'janmashtami', 'tulasi', 'tulsi',
  'nectar of devotion', 'sb ', 'bg ', 'cc ', 'lecture', 'class', 'katha', 'seminar',
  'कृष्ण', 'गीता', 'भागवत', 'राधा', 'चैतन्य', 'वृंदावन', 'वृन्दावन', 'कीर्तन', 'भक्ति', 'जप',
].map(norm);

/**
 * Popular speakers and TV figures outside ISKCON, so the honorific rule
 * above cannot let them in.
 */
const NOT_ISKCON = [
  'premanand', 'aniruddhacharya', 'bageshwar', 'dhirendra', 'devkinandan', 'devki nandan',
  'jaya kishori', 'indresh', 'pundrik', 'shivaji', 'chhatrapati', 'sai baba', 'asaram',
  'rampal', 'morari bapu', 'rajan ji', 'chitralekha', 'sant ', 'radha soami', 'radhasoami',
  'brahma kumari', 'bk shivani', 'sadhguru', 'osho', 'ramdev', 'sri sri ravi', 'keshava maharaj',
  'narayan maharaj', 'gaudiya math', 'premanandji', 'kripalu', 'jagadguru',
].map(norm);

/** Never shown, whatever channel or keyword. */
const BLOCK: RegExp[] = [
  /\bserials?\b/, /\bepisodes?\b/, /\bepi\b/, /\bep\s?\.?\s?\d/, /\bfull ep\b/,
  /\bpromo\b/, /\bprecap\b/, /\brecap\b/, /\bupcoming\b/,
  /star ?bharat/, /star ?plus/, /hotstar/, /colors ?tv/, /\bsony\b/, /\bzee\b/,
  /swastik/, /\bradhakrishn\b/, /\bweb ?series\b/, /\btv show\b/,
  /\bstatus\b/, /\bwhatsapp\b/,
  /\bdj\b/, /\bremix\b/, /\blofi\b/, /\blo-fi\b/, /\bslowed\b/, /\breverb\b/, /\b8d\b/,
  /\btrailer\b/, /\bteaser\b/, /\bmovie\b/, /\bfilm\b/, /\bbigg boss\b/,
  /\bprank\b/, /\bmeme\b/, /\broast\b/, /\bfunny\b/, /\bcomedy\b/,
  // The 1971 Bollywood film "Hare Rama Hare Krishna" and its hit song.
  /dum maro dum/, /zeenat/, /dev anand/,
  /धारावाहिक/, /एपिसोड/, /सीरियल/,
  // The user asked for no Mataji videos at all, on any channel.
  /\bmata ?ji\b/, /\bmataji'?s\b/, /माताजी/, /माता जी/,
];

/**
 * News and current-affairs content. Titles like "ISKCON vs ISKCON: who owns
 * ...? | Reporter Uncut | News 24" name ISKCON, so the strong-term rule let
 * them in, and learnFrom() then trusted the whole news channel. Matched on
 * title and channel name. Unlike BLOCK, a channel in TRUSTED (by id only, not
 * a learned one) is exempt, so ISKCON News still shows.
 */
const NEWS: RegExp[] = [
  /\bnews ?\d*\b/, /\breporters?\b/, /\buncut\b/, /\bbreaking\b/, /\bheadlines?\b/,
  /\bprime time\b/, /\bbulletin\b/, /\blive updates?\b/,
  /\bpress conference\b/, /\bsupreme court\b/, /\bhigh court\b/,
  /\barrest(ed)?\b/, /\bbjp\b/, /\bcongress party\b/, /\bmaneka\b/,
  /\baaj ?tak\b/, /\bndtv\b/, /\babp\b/, /\btv ?9\b/, /\bindia ?tv\b/, /\bindia today\b/, /\brepublic\b/,
  /\bibc ?24\b/, /\bnews ?18\b/, /\btimes now\b/, /\blallantop\b/, /\bbbc\b/, /\bdainik\b/,
  /\bbharat ?24\b/, /\bjagran\b/, /\bamar ujala\b/,
  // Controversy / current-affairs wording.
  /\bcontroversy\b/, /\bcontroversial\b/, /\brow\b/, /\bscam\b/, /\bexpos(e|es|ed)\b/,
  /\bcomplaint\b/, /\bprotests?\b/, /\bblackmail\b/, /\ballegations?\b/, /\blawsuit\b/,
  /\bdark side\b/, /\binsults?\b/, /\bwhy i left\b/, /\bfumes\b/, /\bjre\b/, /\bjoe rogan\b/,
  /\bfroze\b/, /\bmoratorium\b/, /\breality\b/,
  /\bpolice\b/, /\bban\b/, /\bbanned\b/, /\bu-turn\b/, /\bfda\b/, /\bvs\b/,
  /न्यूज़/, /न्यूज/, /समाचार/, /खबर/, /ख़बर/, /ब्रेकिंग/, /রিপোর্ট/, /নিউজ/, /সংবাদ/,
];

/** News-outlet style channel names (checked on the channel name only). */
const NEWS_CHANNEL: RegExp[] = [
  // Not a bare "tv": many devotional channels are called "... TV".
  /\botv\b/, /\bkalinga tv\b/, /\bntt\b/, /\bcapital gate\b/, /\btoday\b/, /\bpost\b/,
  /\btimes\b/, /\bexpress\b/, /\bherald\b/, /\btribune\b/, /\bchronicle\b/, /\bkhabar\b/,
  /\bsamachar\b/,
  /\bstruggle for truth\b/,
];

function isNews(v: { title?: string; channel?: string; channelId?: string }): boolean {
  if (v.channelId && TRUSTED_IDS.has(v.channelId)) return false;
  const ch = norm(v.channel);
  const text = `${norm(v.title)} | ${ch}`;
  return NEWS.some((re) => re.test(text)) || NEWS_CHANNEL.some((re) => re.test(ch));
}

/**
 * Keeps Shorts out of the ordinary feeds (they get their own tab). Not
 * applied on the Shorts tab itself.
 */
const SHORT_FORMAT: RegExp[] = [/#shorts?\b/, /\bshorts\b/, /\breels?\b/];

/** Clips under a minute stay out of the ordinary feeds too. */
const MIN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Channels the user marked "Not interested"
// ---------------------------------------------------------------------------

export interface HiddenChannel {
  channelId: string;
  title: string;
}

const HIDDEN_KEY = 'hidden_channels_v1';
const hidden = new Map<string, HiddenChannel>();
const hiddenNames = new Set<string>();
let hiddenVersion = 0;
const listeners = new Set<() => void>();

function hiddenChanged(save: boolean) {
  hiddenNames.clear();
  for (const c of hidden.values()) if (c.title) hiddenNames.add(norm(c.title).trim());
  hiddenVersion++;
  for (const l of listeners) l();
  if (save) AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden.values()])).catch(() => {});
}

AsyncStorage.getItem(HIDDEN_KEY)
  .then((raw) => {
    if (!raw) return;
    for (const c of JSON.parse(raw) as HiddenChannel[]) hidden.set(c.channelId, c);
    hiddenChanged(false);
  })
  .catch(() => {});

export function hideChannel(c: HiddenChannel): void {
  if (!c.channelId && !c.title) return;
  hidden.set(c.channelId || `name:${c.title}`, c);
  hiddenChanged(true);
}

export function unhideChannel(key: string): void {
  hidden.delete(key);
  hiddenChanged(true);
}

export const listHiddenChannels = (): HiddenChannel[] => [...hidden.values()];
export const subscribeHidden = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const hiddenSnapshot = () => hiddenVersion;

/**
 * Matched by id, and by name as a fallback: a few listings (some continuation
 * pages) carry the channel name but no id.
 */
export function isHiddenChannel(channelId: string | undefined, name?: string): boolean {
  if (channelId && hidden.has(channelId)) return true;
  return !!name && hiddenNames.has(norm(name).trim());
}

function isBlocked(v: VideoResult, short = false): boolean {
  if (isHiddenChannel(v.channelId, v.channel)) return true;
  const text = `${norm(v.title)} | ${norm(v.channel)}`;
  if (!short) {
    if (v.durationSec != null && v.durationSec < MIN_SECONDS && !v.isLive) return true;
    if (SHORT_FORMAT.some((re) => re.test(text))) return true;
  }
  if (isNews(v)) return true;
  return BLOCK.some((re) => re.test(text)) || NOT_ISKCON.some((k) => text.includes(k));
}

/** "HG Kartikeya Prabhu | Rupa Goswami": a devotee speaker on a devotional subject. */
function isDevoteeTalk(text: string): boolean {
  return HONORIFIC.some((re) => re.test(text)) && TOPIC.some((k) => text.includes(k));
}

function hasStrong(text: string): boolean {
  return STRONG.some((k) => text.includes(k));
}

// ---------------------------------------------------------------------------
// Learned channels
// ---------------------------------------------------------------------------
// Many genuine ISKCON speakers' channels title some videos without the word
// ISKCON ("Japa Motivation #033 | Kartikeya Das"). Once a channel has shown a
// clearly ISKCON video, its other videos are allowed too (still minus the
// block list). Persisted, so the app gets better the more it is used.

const LEARNED_KEY = 'iskcon_learned_channels_v1';
const learned = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

AsyncStorage.getItem(LEARNED_KEY)
  .then((raw) => {
    if (raw) for (const id of JSON.parse(raw)) learned.add(id);
  })
  .catch(() => {});

function persistLearned() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(LEARNED_KEY, JSON.stringify([...learned])).catch(() => {});
  }, 1000);
}

/**
 * Call on every batch BEFORE filtering it, so a channel proven ISKCON by one
 * video in the batch lets its neighbours in the same batch through.
 */
export function learnFrom(items: readonly any[]): void {
  let added = false;
  for (const v of items) {
    if (!v || v.kind === 'channel' || !v.channelId || learned.has(v.channelId)) continue;
    if (isBlocked(v)) continue;
    if (hasStrong(`${norm(v.title)} | ${norm(v.channel)}`)) {
      learned.add(v.channelId);
      added = true;
    }
  }
  if (added) persistLearned();
}

export function isTrustedChannel(channelId: string | undefined): boolean {
  return !!channelId && (TRUSTED_IDS.has(channelId) || learned.has(channelId));
}

/** THE rule. Every video list in the app is filtered with this. */
export function isIskconVideo(v: VideoResult): boolean {
  if (!v?.videoId || isBlocked(v)) return false;
  if (isTrustedChannel(v.channelId)) return true;
  const text = `${norm(v.title)} | ${norm(v.channel)}`;
  return hasStrong(text) || isDevoteeTalk(text);
}

/**
 * The Shorts tab's rule: everything above (block list, Mataji, hidden
 * channels, non-ISKCON speakers) except the "no Shorts" part. A Short from a
 * search has no channel yet, so it must earn its place by its title; it is
 * checked again once the channel is known.
 */
export function isIskconShort(v: VideoResult): boolean {
  if (!v?.videoId || isBlocked(v, true)) return false;
  if (isTrustedChannel(v.channelId)) return true;
  const text = `${norm(v.title)} | ${norm(v.channel)}`;
  return hasStrong(text) || isDevoteeTalk(text);
}

/** Channels in search results / subscriptions. */
export function isIskconChannel(c: Pick<ChannelResult, 'channelId' | 'title'>): boolean {
  if (isHiddenChannel(c.channelId, c.title)) return false;
  const t = norm(c.title);
  if ([...BLOCK, ...SHORT_FORMAT].some((re) => re.test(t))) return false;
  if (isNews({ channel: c.title, channelId: c.channelId })) return false;
  if (isTrustedChannel(c.channelId)) return true;
  if (BLOCK.some((re) => re.test(t)) || NOT_ISKCON.some((k) => t.includes(k))) return false;
  // "Kartikeya Das", "HH Bhakti ... Swami": a devotee's own channel. Its
  // videos are still filtered one by one when opened.
  return hasStrong(t) || HONORIFIC.some((re) => re.test(t));
}

/**
 * Searches are steered toward ISKCON before they reach YouTube, so the
 * filter has relevant results to keep. A query that already names something
 * ISKCON is sent as typed.
 */
export function iskconQuery(q: string): string {
  const t = q.trim();
  return hasStrong(norm(t)) ? t : `${t} iskcon`;
}

/** For typeahead: put "iskcon" first so completions stay on ISKCON. */
export function iskconSuggestPrefix(q: string): string {
  const t = q.trimStart();
  return hasStrong(norm(t)) ? t : `iskcon ${t}`;
}

/** Plain-text check (suggestions, recent searches). */
export function isIskconText(t: string): boolean {
  const n = norm(t);
  return hasStrong(n) && ![...BLOCK, ...SHORT_FORMAT, ...NEWS].some((re) => re.test(n));
}

// ---------------------------------------------------------------------------
// Hindi first
// ---------------------------------------------------------------------------
// The main viewer prefers Hindi. Lists keep their order otherwise; Hindi
// items simply move ahead of the rest (a stable sort).

const HINDI_CHANNELS = new Set([
  'UC4mjwXdDLZ_iDysNToElEtw', // Mayapur TV - Hindi
  'UCyF-6S2Z8NHNwlnIHKWAraw', // ISKCON Chowpatty Hindi
]);
export const HINDI_CHANNEL_IDS = [...HINDI_CHANNELS];

const DEVANAGARI = /[ऀ-ॿ]/;
/** Hindi written in Latin letters ("Krishna ki leela kaise samjhe"). */
const HINGLISH = /\b(hai|hain|kaise|kya|kyun|kyon|ki|ka|ke|aur|nahi|nahin|bhagwan|jeevan|mein|apne|kare|karen|karna|sabse|kaun)\b/g;

export function isHindi(v: { title?: string; channel?: string; channelId?: string }): boolean {
  const text = `${v.title ?? ''} ${v.channel ?? ''}`;
  if (DEVANAGARI.test(text) || /\bhindi\b/i.test(text)) return true;
  if (v.channelId && HINDI_CHANNELS.has(v.channelId)) return true;
  return (text.toLowerCase().match(HINGLISH)?.length ?? 0) >= 2;
}

export function hindiFirst<T>(items: T[]): T[] {
  const hi: T[] = [];
  const rest: T[] = [];
  for (const i of items) {
    const a = i as any;
    (a && a.kind !== 'channel' && isHindi(a) ? hi : rest).push(i);
  }
  return [...hi, ...rest];
}

/** Suggestions are asked for as "iskcon ..."; show them without that prefix. */
export function cleanSuggestion(s: string): string {
  return s.replace(/^\s*(iskcon|iskon)\s+/i, '').trim() || s;
}
