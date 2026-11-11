import React, { useState } from 'react';
import { View } from 'react-native';
import { TOPICS, Topic, useHomeFeed } from '../../hooks/useHomeFeed';
import { ChipBar, EmptyState, ErrorState, Pill, SkeletonGrid, Txt } from '../../components/desktop/ui';
import { MoreSpinner, PageScroll, VideoGrid, columnsFor } from '../../components/desktop/Layout';
import { useT } from '../../components/desktop/theme';

export default function HomeScreen() {
  const t = useT();
  const [topic, setTopic] = useState<Topic>('foryou');
  const { feed, key, refresh, isNewUser } = useHomeFeed(topic);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg }}>
        <ChipBar options={TOPICS} value={topic} onChange={setTopic} style={{ flex: 1 }} />
        <Pill small icon="refresh" label="Refresh" onPress={refresh} />
      </View>
      <PageScroll
        onEnd={() => feed.hasMore && !feed.loadingMore && feed.loadMore()}
        contentStyle={{ paddingTop: 12 }}
        maxWidth={2200}
      >
        {(width) =>
          feed.loading || key == null ? (
            <SkeletonGrid cols={columnsFor(width)} width={width} />
          ) : feed.error ? (
            <ErrorState message={feed.error} onRetry={feed.refresh} />
          ) : feed.items.length === 0 ? (
            <EmptyState icon="videocam-off-outline" title="Nothing here yet" text="Try another topic above." />
          ) : (
            <View>
              {isNewUser ? (
                <Txt dim size={14} style={{ marginBottom: 16 }}>
                  Watch and subscribe, and this feed follows what you like.
                </Txt>
              ) : null}
              <VideoGrid videos={feed.items} width={width} />
              <MoreSpinner show={feed.loadingMore || feed.refreshing} />
            </View>
          )
        }
      </PageScroll>
    </View>
  );
}
