import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import VideoCard from '../components/VideoCard';
import { Empty } from '../components/States';
import { resumePoint, useHistory } from '../contexts/HistoryContext';
import { useLibrary } from '../contexts/LibraryContext';
import { openVideo } from '../utils/nav';
import { C } from '../theme/colors';
import { isIskconVideo } from '../utils/iskcon';

export default function WatchLaterScreen() {
  const { watchLater, toggleWatchLater } = useLibrary();
  const { byId } = useHistory();
  return (
    <View style={styles.screen}>
      <FlatList
        data={watchLater.filter(isIskconVideo)}
        keyExtractor={(v) => v.videoId}
        renderItem={({ item }) => (
          <VideoCard
            video={item}
            variant="compact"
            onPress={(v) => openVideo(v, resumePoint(byId.get(v.videoId)))}
            onRemove={{ label: 'Remove from Watch later', run: () => toggleWatchLater(item) }}
          />
        )}
        contentContainerStyle={{ paddingTop: 6 }}
        ListEmptyComponent={
          <Empty
            icon="bookmark-outline"
            title="Nothing saved"
            text="Long-press any video, or tap Save on the watch screen, to keep it here."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
});
