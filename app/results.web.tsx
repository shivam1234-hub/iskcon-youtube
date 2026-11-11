import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePaged } from '../hooks/usePaged';
import type { ChannelResult, SearchItem } from '../data/types';
import { SearchSort, SearchType, search, searchMore } from '../utils/youtube';
import { iskconQuery, isHiddenChannel, isIskconChannel, isIskconVideo, learnFrom } from '../utils/iskcon';
import { openChannel } from '../utils/nav';
import { useHiddenVersion } from '../hooks/useHidden';
import { ChipBar, DAvatar, EmptyState, ErrorState, Pill, Spinner, SubscribePill, Txt, web } from '../components/desktop/ui';
import { MoreSpinner, PageScroll } from '../components/desktop/Layout';
import { VideoRow } from '../components/desktop/VideoItems';
import { useT } from '../components/desktop/theme';

type Filter = 'all' | 'video' | 'channel' | 'date' | 'views' | 'short' | 'long';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'video', label: 'Videos' },
  { key: 'channel', label: 'Channels' },
  { key: 'date', label: 'Newest' },
  { key: 'views', label: 'Most viewed' },
  { key: 'short', label: 'Under 4 minutes' },
  { key: 'long', label: 'Over 20 minutes' },
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

function keep(filter: Filter, item: SearchItem): boolean {
  if (item.kind !== 'video') return true;
  const d = item.durationSec;
  if (filter === 'short') return d != null && d < 240;
  if (filter === 'long') return d != null && d > 1200;
  return true;
}

function ChannelResultRow({ channel }: { channel: ChannelResult }) {
  const t = useT();
  useHiddenVersion();
  if (isHiddenChannel(channel.channelId, channel.title)) return null;
  return (
    <Pressable
      onPress={() => openChannel(channel)}
      style={({ hovered }: any) =>
        web({ flexDirection: 'row', alignItems: 'center', gap: 16, cursor: 'pointer', borderRadius: 12, paddingVertical: 8,
          backgroundColor: hovered ? t.hover : 'transparent' })
      }
    >
      <View style={{ width: 360, alignItems: 'center' }}>
        <DAvatar uri={channel.avatar} name={channel.title} size={136} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={18} numberOfLines={1}>{channel.title}</Txt>
        <Txt dim size={12} numberOfLines={1} style={{ marginTop: 4 }}>
          {[channel.handle, channel.subscribersText].filter(Boolean).join(' • ')}
        </Txt>
      </View>
      <SubscribePill channel={channel} />
    </Pressable>
  );
}

export default function ResultsScreen() {
  const { q } = useLocalSearchParams<{ q: string }>();
  const query = String(q ?? '');
  const [filter, setFilter] = useState<Filter>('all');

  // Exactly the phone's pipeline: ISKCON-steered query, filtered results.
  const results = usePaged<SearchItem>(
    query ? `${query}|${QUERY[filter].sort}|${QUERY[filter].type}` : null,
    (signal) => search(iskconQuery(query), QUERY[filter], signal),
    searchMore,
    (i) => (i.kind === 'video' ? i.videoId : `c:${i.channelId}`),
    (i) => (i.kind === 'video' ? isIskconVideo(i) && keep(filter, i) : isIskconChannel(i)),
    learnFrom,
  );

  return (
    <PageScroll
      contentStyle={{ paddingTop: 12 }}
      maxWidth={1096}
      onEnd={() => results.hasMore && !results.loadingMore && results.loadMore()}
    >
      {() => (
        <View>
          <ChipBar options={FILTERS} value={filter} onChange={setFilter} style={{ marginBottom: 24 }} />
          {results.loading ? (
            <Spinner />
          ) : results.error ? (
            <ErrorState message={results.error} onRetry={results.refresh} />
          ) : results.items.length === 0 ? (
            <EmptyState icon="search-outline" title="No results found" text="Try different keywords or remove search filters." />
          ) : (
            <View style={{ gap: 16 }}>
              {results.items.map((item) =>
                item.kind === 'channel' ? (
                  <ChannelResultRow key={`c:${item.channelId}`} channel={item} />
                ) : (
                  <VideoRow key={item.videoId} video={item} />
                ),
              )}
              <MoreSpinner show={results.loadingMore} />
              {!results.loadingMore && results.hasMore && results.items.length < 6 ? (
                <View style={{ alignItems: 'center', padding: 16 }}>
                  <Pill label="Load more" onPress={results.loadMore} />
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
    </PageScroll>
  );
}
