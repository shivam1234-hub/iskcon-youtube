import React from 'react';
import {
  FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopBar from '../../components/TopBar';
import VideoCard from '../../components/VideoCard';
import Avatar from '../../components/Avatar';
import { Empty, Loading } from '../../components/States';
import { openChannel } from '../../utils/nav';
import { C } from '../../theme/colors';
import { useSubscriptionFeed } from '../../hooks/useSubscriptionFeed';

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const { subscriptions, videos, failed, progress, loading, refreshing, load } = useSubscriptionFeed();

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
