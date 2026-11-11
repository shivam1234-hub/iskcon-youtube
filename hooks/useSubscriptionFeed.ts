import { useCallback, useEffect, useRef, useState } from 'react';
import { useLibrary } from '../contexts/LibraryContext';
import type { VideoResult } from '../data/types';
import { ageSeconds, getChannel } from '../utils/youtube';
import { isIskconVideo, learnFrom } from '../utils/iskcon';

/**
 * The Subscriptions feed: newest uploads of every subscribed channel, merged
 * and sorted by age. Shared by the phone and desktop Subscriptions screens.
 */
/** Channels fetched at once — enough to be quick, few enough not to look like a flood. */
const CONCURRENCY = 5;
/** Reuse a fetched feed for this long when you come back to the tab. */
const STALE_MS = 10 * 60 * 1000;

// Survives tab switches and remounts; cleared on pull-to-refresh.
let cache: { key: string; at: number; videos: VideoResult[]; failed: number } | null = null;

async function fetchAll(channelIds: string[], onProgress: (done: number) => void) {
  const results: VideoResult[][] = [];
  let failed = 0;
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < channelIds.length) {
      const id = channelIds[next++];
      try {
        const page = await getChannel(id);
        const items = page.items.map((v) => ({ ...v, channelId: v.channelId || id }));
        learnFrom(items);
        results.push(items.filter(isIskconVideo).slice(0, 15));
      } catch {
        failed++;
      }
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, channelIds.length) }, worker));
  const seen = new Set<string>();
  const videos = results
    .flat()
    .filter((v) => (seen.has(v.videoId) ? false : (seen.add(v.videoId), true)))
    .sort((a, b) => ageSeconds(a.publishedText) - ageSeconds(b.publishedText));
  return { videos, failed };
}

export function useSubscriptionFeed() {
  const { subscriptions, loaded } = useLibrary();
  const subsKey = subscriptions.map((s) => s.channelId).join(',');

  const [videos, setVideos] = useState<VideoResult[]>(cache?.key === subsKey ? cache.videos : []);
  const [failed, setFailed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const runId = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      if (!subsKey) {
        setVideos([]);
        return;
      }
      if (!force && cache && cache.key === subsKey && Date.now() - cache.at < STALE_MS) {
        setVideos(cache.videos);
        setFailed(cache.failed);
        return;
      }
      const id = ++runId.current;
      if (force) setRefreshing(true);
      else setLoading(true);
      setProgress(0);
      const res = await fetchAll(subsKey.split(','), (n) => {
        if (id === runId.current) setProgress(n);
      });
      if (id !== runId.current) return;
      cache = { key: subsKey, at: Date.now(), ...res };
      setVideos(res.videos);
      setFailed(res.failed);
      setLoading(false);
      setRefreshing(false);
    },
    [subsKey],
  );

  useEffect(() => {
    if (loaded) load(false);
  }, [loaded, load]);


  return { subscriptions, videos, failed, progress, loading, refreshing, load };
}
