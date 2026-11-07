import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import VideoCard from '../../components/VideoCard';
import Avatar from '../../components/Avatar';
import SubscribeButton from '../../components/SubscribeButton';
import { Empty, ErrorView, Loading } from '../../components/States';
import { usePaged } from '../../hooks/usePaged';
import type { VideoResult } from '../../data/types';
import { ChannelInfo, channelMore, getChannel } from '../../utils/youtube';
import { C } from '../../theme/colors';
import { isHiddenChannel, isIskconVideo, learnFrom, unhideChannel } from '../../utils/iskcon';
import { useHiddenVersion } from '../../hooks/useHidden';
import { useLibrary } from '../../contexts/LibraryContext';
import { confirmHideChannel } from '../../utils/nav';
import { Ionicons } from '@expo/vector-icons';

export default function ChannelScreen() {
  const { id, title, avatar } = useLocalSearchParams<{ id: string; title?: string; avatar?: string }>();
  const navigation = useNavigation();
  const channelId = String(id ?? '');
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const { hideChannel } = useLibrary();
  useHiddenVersion();

  const videos = usePaged<VideoResult>(
    channelId || null,
    async (signal) => {
      const page = await getChannel(channelId, signal);
      setInfo(page.channel);
      return page;
    },
    channelMore,
    (v) => v.videoId,
    // Continuation rows lack the channel id; stamp it so trusted channels
    // are recognised on every page.
    (v) => isIskconVideo({ ...v, channelId: v.channelId || channelId }),
    (items) => learnFrom(items.map((v) => ({ ...v, channelId: v.channelId || channelId }))),
  );

  const name = info?.title || (title ? String(title) : '');
  useEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  // Continuation pages omit the channel name and avatar on each row.
  const items = videos.items.map((v) =>
    v.channel ? v : { ...v, channel: name, channelId, channelAvatar: info?.avatar },
  );

  const header = (
    <View>
      {info?.banner ? (
        <Image source={{ uri: info.banner }} style={styles.banner} resizeMode="cover" />
      ) : null}
      <View style={styles.head}>
        <Avatar uri={info?.avatar || (avatar ? String(avatar) : undefined)} name={name} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {[info?.handle, info?.subscribersText, info?.videoCountText].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {info?.description ? (
        <Pressable onPress={() => setDescOpen((o) => !o)}>
          <Text style={styles.desc} numberOfLines={descOpen ? undefined : 2}>
            {info.description}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.subRow}>
        {isHiddenChannel(channelId, name) ? (
          <Pressable onPress={() => unhideChannel(channelId)} style={styles.hideBtn}>
            <Ionicons name="eye-outline" size={16} color={C.text} />
            <Text style={styles.hideText}>Show this channel again</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => confirmHideChannel(name, () => hideChannel({ channelId, title: name }))}
            style={styles.hideBtn}
          >
            <Ionicons name="eye-off-outline" size={16} color={C.text} />
            <Text style={styles.hideText}>Not interested</Text>
          </Pressable>
        )}
        <SubscribeButton
          channel={{
            channelId,
            title: name,
            avatar: info?.avatar || (avatar ? String(avatar) : undefined),
            handle: info?.handle,
            subscribersText: info?.subscribersText,
          }}
        />
      </View>
      <Text style={styles.section}>Videos</Text>
    </View>
  );

  if (videos.loading) return <View style={styles.screen}><Loading /></View>;
  if (videos.error) {
    return (
      <View style={styles.screen}>
        <ErrorView message={videos.error} onRetry={videos.refresh} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(v) => v.videoId}
        renderItem={({ item }) => <VideoCard video={item} hideChannel />}
        ListHeaderComponent={header}
        onEndReached={() => videos.hasMore && videos.loadMore()}
        onEndReachedThreshold={1.2}
        ListFooterComponent={
          videos.loadingMore ? <ActivityIndicator style={{ margin: 20 }} color={C.accent} /> : null
        }
        ListEmptyComponent={<Empty icon="videocam-off-outline" title="No videos" />}
        initialNumToRender={4}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  banner: { width: '100%', aspectRatio: 6.2, backgroundColor: C.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  name: { color: C.text, fontSize: 21, fontWeight: '800' },
  meta: { color: C.textDim, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  desc: { color: C.textDim, fontSize: 13, lineHeight: 18, marginHorizontal: 14 },
  subRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  hideBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
    paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.surfaceHi,
  },
  hideText: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  section: {
    color: C.text, fontSize: 16, fontWeight: '800',
    marginHorizontal: 14, marginTop: 4, marginBottom: 10,
  },
});
