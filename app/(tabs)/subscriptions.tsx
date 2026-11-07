import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopBar from '../../components/TopBar';
import VideoCard from '../../components/VideoCard';
import Avatar from '../../components/Avatar';
import { Empty, Loading } from '../../components/States';
import { useLibrary } from '../../contexts/LibraryContext';
import type { VideoResult } from '../../data/types';
import { ageSeconds, getChannel } from '../../utils/youtube';
import { openChannel } from '../../utils/nav';
import { C } from '../../theme/colors';
import { isIskconVideo, learnFrom } from '../../utils/iskcon';

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

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar title="Subscriptions" />
      {subscriptions.length === 0 ? (
        <Empty
          icon="albums-outline"
          title="No subscriptions yet"
          text="Tap Subscribe on any channel or video. Their newest uploads will show up here."
        />
      ) : (
        <FlatList
          data={loading ? [] : videos}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={C.accent}
              colors={[C.accent]}
              progressBackgroundColor={C.surface}
            />
          }
          ListHeaderComponent={
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.strip}
              >
                {subscriptions.map((s) => (
                  <Pressable key={s.channelId} onPress={() => openChannel(s)} style={styles.sub}>
                    <Avatar uri={s.avatar} name={s.title} size={54} />
                    <Text style={styles.subName} numberOfLines={1}>{s.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {failed > 0 && !loading && (
                <Text style={styles.warn}>
                  {failed} {failed === 1 ? 'channel' : 'channels'} could not be loaded. Pull down to retry.
                </Text>
              )}
              {loading && (
                <Loading label={`Checking channels… ${progress}/${subscriptions.length}`} />
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? null : <Empty icon="videocam-off-outline" title="No recent uploads found" />
          }
          initialNumToRender={4}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  strip: { paddingHorizontal: 12, paddingVertical: 8, gap: 14 },
  sub: { width: 64, alignItems: 'center', gap: 5 },
  subName: { color: C.textDim, fontSize: 11 },
  warn: { color: C.textMute, fontSize: 12, marginHorizontal: 14, marginBottom: 10 },
});
