import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSubscriptionFeed } from '../../hooks/useSubscriptionFeed';
import { openChannel } from '../../utils/nav';
import { DAvatar, EmptyState, Pill, SkeletonGrid, Spinner, Txt, web } from '../../components/desktop/ui';
import { PageScroll, VideoGrid, columnsFor } from '../../components/desktop/Layout';
import { useT } from '../../components/desktop/theme';

export default function SubscriptionsScreen() {
  const t = useT();
  const { subscriptions, videos, failed, progress, loading, refreshing, load } = useSubscriptionFeed();

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon="albums-outline"
        title="No subscriptions yet"
        text="Click Subscribe on any channel or video. Their newest uploads will show up here."
        action={<Pill label="Go to Home" icon="home-outline" onPress={() => router.navigate('/')} />}
      />
    );
  }

  return (
    <PageScroll contentStyle={{ paddingTop: 16 }} maxWidth={2200}>
      {(width) => (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Txt size={20} weight="700" style={{ flex: 1 }}>Latest</Txt>
            <Pill small icon="refresh" label={refreshing ? 'Refreshing…' : 'Refresh'} onPress={() => load(true)} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
            {subscriptions.map((s) => (
              <Pressable
                key={s.channelId}
                onPress={() => openChannel(s)}
                style={({ hovered }: any) =>
                  web({
                    width: 96, alignItems: 'center', gap: 8, paddingVertical: 8, borderRadius: 12,
                    cursor: 'pointer', backgroundColor: hovered ? t.hover : 'transparent',
                  })
                }
              >
                <DAvatar uri={s.avatar} name={s.title} size={56} />
                <Txt size={12} numberOfLines={1} style={{ maxWidth: 84 }}>{s.title}</Txt>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ height: 1, backgroundColor: t.border, marginBottom: 24 }} />
          {failed > 0 && !loading ? (
            <Txt dim size={13} style={{ marginBottom: 16 }}>
              {failed} {failed === 1 ? 'channel' : 'channels'} could not be loaded. Click Refresh to retry.
            </Txt>
          ) : null}
          {loading ? (
            <View>
              <Spinner pad={16} label={`Checking channels… ${progress}/${subscriptions.length}`} />
              <SkeletonGrid cols={columnsFor(width)} width={width} rows={2} />
            </View>
          ) : videos.length === 0 ? (
            <EmptyState icon="videocam-off-outline" title="No recent uploads found" />
          ) : (
            <VideoGrid videos={videos} width={width} />
          )}
        </View>
      )}
    </PageScroll>
  );
}
