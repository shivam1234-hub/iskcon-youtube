import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoCard from '../components/VideoCard';
import ChannelRow from '../components/ChannelRow';
import { Chips, Empty, ErrorView, Loading } from '../components/States';
import { usePaged } from '../hooks/usePaged';
import type { SearchItem } from '../data/types';
import { SearchSort, SearchType, search, searchMore } from '../utils/youtube';
import { C } from '../theme/colors';
import { iskconQuery, isIskconChannel, isIskconVideo, learnFrom } from '../utils/iskcon';

type Filter = 'all' | 'video' | 'channel' | 'date' | 'views' | 'short' | 'long';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'video', label: 'Videos' },
  { key: 'channel', label: 'Channels' },
  { key: 'date', label: 'Newest' },
  { key: 'views', label: 'Most viewed' },
  { key: 'short', label: 'Under 4 min' },
  { key: 'long', label: 'Over 20 min' },
];

/** Server-side sort/type for each chip; length chips filter what comes back. */
const QUERY: Record<Filter, { sort: SearchSort; type: SearchType }> = {
  all: { sort: 'relevance', type: 'all' },
  video: { sort: 'relevance', type: 'video' },
  channel: { sort: 'relevance', type: 'channel' },
  date: { sort: 'date', type: 'video' },
  views: { sort: 'views', type: 'video' },
  short: { sort: 'relevance', type: 'video' },
  long: { sort: 'relevance', type: 'video' },
};

/** Length chips, applied on top of the ISKCON rule. */
function keep(filter: Filter, item: SearchItem): boolean {
  if (item.kind !== 'video') return true;
  const d = item.durationSec;
  if (filter === 'short') return d != null && d < 240;
  if (filter === 'long') return d != null && d > 1200;
  return true;
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q: string }>();
  const query = String(q ?? '');
  const [filter, setFilter] = useState<Filter>('all');

  const results = usePaged<SearchItem>(
    query ? `${query}|${QUERY[filter].sort}|${QUERY[filter].type}` : null,
    (signal) => search(iskconQuery(query), QUERY[filter], signal),
    searchMore,
    (i) => (i.kind === 'video' ? i.videoId : `c:${i.channelId}`),
    (i) => (i.kind === 'video' ? isIskconVideo(i) && keep(filter, i) : isIskconChannel(i)),
    learnFrom,
  );

  const shown = results.items;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={23} color={C.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/search', params: { q: query } })}
          style={styles.queryBox}
        >
          <Text style={styles.queryText} numberOfLines={1}>{query}</Text>
        </Pressable>
      </View>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />

      {results.loading ? (
        <Loading />
      ) : results.error ? (
        <ErrorView message={results.error} onRetry={results.refresh} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => (i.kind === 'video' ? i.videoId : `c:${i.channelId}`)}
          renderItem={({ item }) =>
            item.kind === 'channel' ? <ChannelRow channel={item} /> : <VideoCard video={item} />
          }
          // Length filters drop rows client-side; keep paging so they fill up.
          onEndReached={() => results.hasMore && results.loadMore()}
          onEndReachedThreshold={1.2}
          ListFooterComponent={
            results.loadingMore ? (
              <ActivityIndicator style={{ margin: 20 }} color={C.accent} />
            ) : results.hasMore && shown.length < 6 ? (
              <Pressable onPress={results.loadMore} style={styles.more}>
                <Text style={styles.moreText}>Load more</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <Empty
              icon="search-outline"
              title="No results found"
              text="Try different keywords."
            />
          }
          keyboardShouldPersistTaps="handled"
          initialNumToRender={4}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, height: 56 },
  iconBtn: { padding: 6 },
  queryBox: {
    flex: 1, backgroundColor: C.surfaceHi, borderRadius: 20,
    paddingHorizontal: 16, height: 40, justifyContent: 'center',
  },
  queryText: { color: C.text, fontSize: 15.5 },
  more: { alignItems: 'center', padding: 18 },
  moreText: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
