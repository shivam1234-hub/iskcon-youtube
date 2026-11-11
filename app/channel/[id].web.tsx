import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePaged } from '../../hooks/usePaged';
import { useHiddenVersion } from '../../hooks/useHidden';
import { useLibrary } from '../../contexts/LibraryContext';
import type { VideoResult } from '../../data/types';
import { ChannelInfo, channelMore, getChannel } from '../../utils/youtube';
import { isHiddenChannel, isIskconVideo, learnFrom, unhideChannel } from '../../utils/iskcon';
import { confirmHideChannel } from '../../utils/nav';
import { DAvatar, EmptyState, ErrorState, Pill, SkeletonGrid, SubscribePill, Txt, web } from '../../components/desktop/ui';
import { MoreSpinner, PageScroll, VideoGrid, columnsFor } from '../../components/desktop/Layout';
import { toast } from '../../components/desktop/overlays';
import { useT } from '../../components/desktop/theme';

export default function ChannelScreen() {
  const t = useT();
  const { id, title, avatar } = useLocalSearchParams<{ id: string; title?: string; avatar?: string }>();
  const channelId = String(id ?? '');
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const { hideChannel } = useLibrary();
  useHiddenVersion();

  // Same list + ISKCON filter as the phone's channel screen.
  const videos = usePaged<VideoResult>(
    channelId || null,
    async (signal) => {
      const page = await getChannel(channelId, signal);
      setInfo(page.channel);
      return page;
    },
    channelMore,
    (v) => v.videoId,
    (v) => isIskconVideo({ ...v, channelId: v.channelId || channelId }),
    (items) => learnFrom(items.map((v) => ({ ...v, channelId: v.channelId || channelId }))),
  );

  const name = info?.title || (title ? String(title) : '');
  const pic = info?.avatar || (avatar ? String(avatar) : undefined);
  const items = videos.items.map((v) =>
    v.channel ? v : { ...v, channel: name, channelId, channelAvatar: info?.avatar },
  );
  const hidden = isHiddenChannel(channelId, name);

  return (
    <PageScroll
      maxWidth={1284}
      contentStyle={{ paddingTop: 8 }}
      onEnd={() => videos.hasMore && !videos.loadingMore && videos.loadMore()}
    >
      {(width) => (
        <View>
          {info?.banner ? (
            <Image source={{ uri: info.banner }} style={{ width: '100%', aspectRatio: 6.2, borderRadius: 16, backgroundColor: t.skeleton }} resizeMode="cover" />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 24 }}>
            <DAvatar uri={pic} name={name} size={160} />
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Txt size={36} weight="700" numberOfLines={2}>{name || ' '}</Txt>
              <Txt dim size={14} numberOfLines={1}>
                {[info?.handle, info?.subscribersText, info?.videoCountText].filter(Boolean).join(' • ')}
              </Txt>
              {info?.description ? (
                <Pressable onPress={() => setDescOpen((o) => !o)} style={web({ cursor: 'pointer', maxWidth: 760 })}>
                  <Txt dim size={14} numberOfLines={descOpen ? undefined : 1} style={{ lineHeight: 20 }}>
                    {info.description}
                  </Txt>
                  <Txt size={14} weight="500" style={{ marginTop: 2 }}>{descOpen ? 'Show less' : '...more'}</Txt>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <SubscribePill
                  channel={{ channelId, title: name, avatar: pic, handle: info?.handle, subscribersText: info?.subscribersText }}
                />
                {hidden ? (
                  <Pill icon="eye-outline" label="Show this channel again" onPress={() => unhideChannel(channelId)} />
                ) : (
                  <Pill
                    icon="eye-off-outline"
                    label="Not interested"
                    onPress={() =>
                      confirmHideChannel(name, () => {
                        hideChannel({ channelId, title: name });
                        toast(`${name || 'Channel'} won't be shown any more`);
                      })
                    }
                  />
                )}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 16, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <View style={{ paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderBottomColor: t.text }}>
              <Txt size={16} weight="500">Videos</Txt>
            </View>
          </View>
          <View style={{ marginTop: 24 }}>
            {videos.loading ? (
              <SkeletonGrid cols={columnsFor(width, 250, 4)} width={width} rows={2} />
            ) : videos.error ? (
              <ErrorState message={videos.error} onRetry={videos.refresh} />
            ) : hidden ? (
              <EmptyState icon="eye-off-outline" title="This channel is hidden" text="Click “Show this channel again” to see its videos." />
            ) : items.length === 0 ? (
              <EmptyState icon="videocam-off-outline" title="No videos" />
            ) : (
              <VideoGrid videos={items} width={width} hideChannel minTile={250} />
            )}
            <MoreSpinner show={videos.loadingMore} />
          </View>
        </View>
      )}
    </PageScroll>
  );
}
