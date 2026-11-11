import React from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { resumePoint, useHistory } from '../contexts/HistoryContext';
import { useLibrary } from '../contexts/LibraryContext';
import { openVideo } from '../utils/nav';
import { isIskconVideo } from '../utils/iskcon';
import { thumbFor } from '../data/types';
import { EmptyState, Pill, Txt } from '../components/desktop/ui';
import { PageScroll } from '../components/desktop/Layout';
import { VideoRow } from '../components/desktop/VideoItems';
import { useT } from '../components/desktop/theme';

export default function WatchLaterScreen() {
  const t = useT();
  const { watchLater, toggleWatchLater } = useLibrary();
  const { byId } = useHistory();
  const list = watchLater.filter(isIskconVideo);
  const first = list[0];

  return (
    <PageScroll contentStyle={{ paddingTop: 24 }} maxWidth={1284}>
      {() => (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          {/* Playlist header card, as on YouTube's playlist pages. */}
          <View
            style={{
              width: 360, borderRadius: 16, padding: 24, gap: 16, overflow: 'hidden',
              backgroundColor: t.dark ? '#3a2a2a' : '#f3e6e6', position: 'sticky' as any, top: 0,
            }}
          >
            {first ? (
              <Image source={{ uri: first.thumbnail || thumbFor(first.videoId) }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }} />
            ) : (
              <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: t.chip }} />
            )}
            <Txt size={28} weight="700">Watch later</Txt>
            <Txt dim size={14}>{list.length} {list.length === 1 ? 'video' : 'videos'} · saved on this computer</Txt>
            {first ? (
              <Pill primary icon="play" label="Play" onPress={() => openVideo(first, resumePoint(byId.get(first.videoId)))} />
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
            {list.length === 0 ? (
              <EmptyState
                icon="bookmark-outline"
                title="Nothing saved"
                text={'Use a video\'s ⋯ menu, or click Save on the watch page, to keep it here.'}
                action={<Pill label="Browse videos" icon="home-outline" onPress={() => router.navigate('/')} />}
              />
            ) : (
              list.map((v) => (
                <VideoRow
                  key={v.videoId}
                  video={v}
                  thumbWidth={200}
                  onPress={(x) => openVideo(x, resumePoint(byId.get(x.videoId)))}
                  onRemove={{ label: 'Remove from Watch later', run: () => toggleWatchLater(v) }}
                />
              ))
            )}
          </View>
        </View>
      )}
    </PageScroll>
  );
}
