import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from '../contexts/HistoryContext';
import { useLibrary } from '../contexts/LibraryContext';
import { usePaged } from './usePaged';
import type { VideoResult } from '../data/types';
import {
  Page, Session, getChannel, getVideo, relatedMore, search, searchMore,
} from '../utils/youtube';
import { HINDI_CHANNEL_IDS, TRUSTED_CHANNELS, isIskconChannel, isIskconVideo, learnFrom } from '../utils/iskcon';

/**
 * The Home feed: topic chips and the "For you" mix. Shared by the phone
 * screen (app/(tabs)/index.tsx) and the desktop one (index.web.tsx).
 */

function shuffle<T>(a: T[]): T[] {
  return [...a].sort(() => Math.random() - 0.5);
}

export type Topic =
  | 'foryou' | 'prabhupada' | 'kirtan' | 'gita' | 'bhagavatam' | 'japa' | 'bhajan'
  | 'katha' | 'festival' | 'mayapur' | 'vrindavan' | 'darshan' | 'prasadam';

/** Every chip is an ISKCON search, and its results still pass the ISKCON filter. */
export const TOPICS: { key: Topic; label: string; query?: string }[] = [
  { key: 'foryou', label: 'For you' },
  { key: 'prabhupada', label: 'Srila Prabhupada', query: 'Srila Prabhupada hindi' },
  { key: 'kirtan', label: 'Kirtan', query: 'ISKCON kirtan' },
  { key: 'gita', label: 'Bhagavad-gita', query: 'Bhagavad Gita class ISKCON hindi' },
  { key: 'bhagavatam', label: 'Bhagavatam', query: 'Srimad Bhagavatam katha ISKCON hindi' },
  { key: 'japa', label: 'Japa', query: 'Hare Krishna mahamantra japa ISKCON' },
  { key: 'bhajan', label: 'Bhajans', query: 'ISKCON bhajan hindi' },
  { key: 'katha', label: 'Katha', query: 'ISKCON katha hindi' },
  { key: 'festival', label: 'Festivals', query: 'ISKCON festival hindi' },
  { key: 'mayapur', label: 'Mayapur', query: 'ISKCON Mayapur' },
  { key: 'vrindavan', label: 'Vrindavan', query: 'ISKCON Vrindavan' },
  { key: 'darshan', label: 'Darshan', query: 'ISKCON darshan' },
  { key: 'prasadam', label: 'Prasadam', query: 'ISKCON prasadam recipe hindi' },
];

const videosOf = (p: Page<any>): Page<VideoResult> => ({
  ...p,
  items: p.items.filter((i) => i.kind === 'video').map(({ kind, ...v }: any) => v),
});

/** Round-robin merge, so no single source floods the top of the feed. */
function interleave(lists: VideoResult[][]): VideoResult[] {
  const out: VideoResult[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const v = l[i];
      if (v && !seen.has(v.videoId)) {
        seen.add(v.videoId);
        out.push(v);
      }
    }
  }
  return out;
}

export function useHomeFeed(topic: Topic) {
  const { history, loaded: historyLoaded } = useHistory();
  const { subscriptions, loaded: subsLoaded } = useLibrary();

  // The "For you" seeds are captured once (and again on pull-to-refresh), not
  // derived live — otherwise every video you watch would reshuffle the feed
  // under you when you come back.
  const [seed, setSeed] = useState<{ videos: string[]; channels: string[]; n: number } | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;

  const takeSeed = useCallback(() => {
    // Only ISKCON items can seed the feed: Up next for a stray video would
    // pull its whole neighbourhood in (the filter would still catch it, but
    // there would be little left to show).
    const subs = subsRef.current.filter((c) => isIskconChannel(c)).map((c) => c.channelId);
    const trusted = [
      // Hindi channels always seed the feed.
      ...shuffle(HINDI_CHANNEL_IDS),
      ...shuffle(TRUSTED_CHANNELS.map((c) => c.channelId)),
    ].filter((id, i, a) => !subs.includes(id) && a.indexOf(id) === i);
    setSeed((prev) => ({
      videos: historyRef.current.filter(isIskconVideo).slice(0, 2).map((h) => h.videoId),
      // Rotate through subscriptions and the trusted ISKCON channels.
      channels: [...shuffle(subs).slice(0, 3), ...trusted.slice(0, 4)],
      n: (prev?.n ?? 0) + 1,
    }));
  }, []);

  useEffect(() => {
    if (historyLoaded && subsLoaded && !seed) takeSeed();
  }, [historyLoaded, subsLoaded, seed, takeSeed]);

  // Which endpoint the "For you" continuation belongs to.
  const moreMode = useRef<'related' | 'search'>('related');

  const current = TOPICS.find((t) => t.key === topic)!;
  const key =
    topic === 'foryou'
      ? seed
        ? `foryou:${seed.n}`
        : null
      : `topic:${topic}`;

  const feed = usePaged<VideoResult>(
    key,
    async (signal) => {
      if (topic !== 'foryou') {
        moreMode.current = 'search';
        return videosOf(await search(current.query!, { type: 'video' }, signal));
      }
      const s = seed!;
      const [related, uploads] = await Promise.all([
        Promise.all(s.videos.map((id) => getVideo(id, signal).catch(() => null))),
        Promise.all(s.channels.map((id) => getChannel(id, signal).catch(() => null))),
      ]);
      const lists = [
        ...related.filter(Boolean).map((r) => r!.related),
        ...uploads.filter(Boolean).map((c) => c!.items.slice(0, 8)),
      ];
      const merged = interleave(lists);
      const firstRelated = related.find((r) => r && r.session && r.continuation);
      if (merged.length > 0) {
        moreMode.current = 'related';
        return {
          items: merged,
          session: firstRelated?.session ?? null,
          continuation: firstRelated?.continuation ?? null,
        };
      }
      moreMode.current = 'search';
      return videosOf(await search('ISKCON kirtan hindi', { type: 'video' }, signal));
    },
    async (session: Session, cont: string, signal) =>
      moreMode.current === 'related'
        ? relatedMore(session, cont, signal)
        : videosOf(await searchMore(session, cont, signal)),
    (v) => v.videoId,
    isIskconVideo,
    learnFrom,
  );

  const refresh = useCallback(() => {
    if (topic === 'foryou') takeSeed();
    else feed.refresh();
  }, [topic, takeSeed, feed.refresh]);

  const isNewUser = topic === 'foryou' && history.length === 0 && subscriptions.length === 0;

  return { feed, key, refresh, isNewUser };
}
