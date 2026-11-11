import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopBar from '../../components/TopBar';
import VideoCard from '../../components/VideoCard';
import { Chips, Empty, ErrorView, Loading } from '../../components/States';
import { TOPICS, Topic, useHomeFeed } from '../../hooks/useHomeFeed';
import { C } from '../../theme/colors';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [topic, setTopic] = useState<Topic>('foryou');
  const { feed, key, refresh: onRefresh, isNewUser } = useHomeFeed(topic);

  const header = (
    <View>
      <TopBar />
      <Chips options={TOPICS} value={topic} onChange={setTopic} />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {header}
      {feed.loading || key == null ? (
        <Loading />
      ) : feed.error ? (
        <ErrorView message={feed.error} onRetry={feed.refresh} />
      ) : (
        <FlatList
          data={feed.items}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} />}
          onEndReached={() => feed.hasMore && feed.loadMore()}
          onEndReachedThreshold={1.2}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
              progressBackgroundColor={C.surface}
            />
          }
          ListHeaderComponent={
            isNewUser ? (
              <Text style={styles.hint}>
                Watch and subscribe, and this feed follows what you like.
              </Text>
            ) : null
          }
          ListFooterComponent={
            feed.loadingMore ? <ActivityIndicator style={{ margin: 20 }} color={C.accent} /> : null
          }
          ListEmptyComponent={<Empty icon="videocam-off-outline" title="Nothing here yet" />}
          initialNumToRender={4}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hint: {
    color: C.textDim, fontSize: 12.5, lineHeight: 18,
    marginHorizontal: 14, marginBottom: 12,
  },
});
