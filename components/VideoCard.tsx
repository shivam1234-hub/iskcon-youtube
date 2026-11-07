import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoResult, formatDuration, thumbFor } from '../data/types';
import { useHistory } from '../contexts/HistoryContext';
import { useLibrary } from '../contexts/LibraryContext';
import { openChannel, openVideo, showVideoMenu } from '../utils/nav';
import { isHiddenChannel } from '../utils/iskcon';
import { useHiddenVersion } from '../hooks/useHidden';
import { C } from '../theme/colors';
import Avatar from './Avatar';

interface Props {
  video: VideoResult;
  /** Full-width thumbnail (feeds) or a thumbnail-left row (Up next, library). */
  variant?: 'large' | 'compact';
  /** Overrides the default open-the-watch-screen behaviour (the watch screen swaps in place). */
  onPress?: (v: VideoResult) => void;
  /** Extra destructive entry for the long-press menu, e.g. "Remove from history". */
  onRemove?: { label: string; run: () => void };
  hideChannel?: boolean;
}

function Thumb({ video, progress, large }: { video: VideoResult; progress: number; large: boolean }) {
  return (
    <View style={large ? styles.thumbLarge : styles.thumbCompact}>
      <Image
        source={{ uri: video.thumbnail || thumbFor(video.videoId) }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      {video.isLive ? (
        <View style={[styles.badge, { backgroundColor: C.live }]}>
          <Text style={styles.badgeText}>LIVE</Text>
        </View>
      ) : video.durationSec != null ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatDuration(video.durationSec)}</Text>
        </View>
      ) : null}
      {progress > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

function VideoCard({ video, variant = 'large', onPress, onRemove, hideChannel }: Props) {
  const { byId } = useHistory();
  const { isSaved, toggleWatchLater, hideChannel: hideThisChannel } = useLibrary();
  useHiddenVersion();

  const watched = byId.get(video.videoId);
  const duration = video.durationSec ?? watched?.durationSec ?? null;
  const progress = watched && duration ? watched.positionSec / duration : 0;

  const meta = [hideChannel ? null : video.channel, video.viewsText, video.publishedText]
    .filter(Boolean)
    .join(' · ');

  const press = () => (onPress ? onPress(video) : openVideo(video));
  const longPress = () =>
    showVideoMenu(video, {
      saved: isSaved(video.videoId),
      toggleSave: () => toggleWatchLater(video),
      hideChannel: () => hideThisChannel({ channelId: video.channelId, title: video.channel }),
      onRemove,
    });

  // Hidden after this list was fetched: drop the row immediately.
  if (isHiddenChannel(video.channelId, video.channel)) return null;

  if (variant === 'compact') {
    return (
      <Pressable
        onPress={press}
        onLongPress={longPress}
        style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
      >
        <Thumb video={video} progress={progress} large={false} />
        <View style={styles.compactBody}>
          <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.meta} numberOfLines={2}>{meta}</Text>
        </View>
        <Pressable onPress={longPress} hitSlop={10} style={styles.more}>
          <Ionicons name="ellipsis-vertical" size={16} color={C.textDim} />
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={press}
      onLongPress={longPress}
      style={({ pressed }) => [styles.large, pressed && styles.pressed]}
    >
      <Thumb video={video} progress={progress} large />
      <View style={styles.largeBody}>
        {!hideChannel && (
          <Pressable
            onPress={() =>
              video.channelId &&
              openChannel({ channelId: video.channelId, title: video.channel, avatar: video.channelAvatar })
            }
            hitSlop={6}
          >
            <Avatar uri={video.channelAvatar} name={video.channel} size={36} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
        <Pressable onPress={longPress} hitSlop={10} style={styles.more}>
          <Ionicons name="ellipsis-vertical" size={16} color={C.textDim} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default memo(VideoCard);

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  large: { marginBottom: 18 },
  thumbLarge: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface },
  largeBody: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingTop: 10 },
  compact: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 6 },
  thumbCompact: {
    width: 160, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: C.surface,
  },
  compactBody: { flex: 1, paddingTop: 1 },
  title: { color: C.text, fontSize: 14.5, fontWeight: '600', lineHeight: 19 },
  meta: { color: C.textDim, fontSize: 12, marginTop: 3, lineHeight: 16 },
  more: { paddingTop: 2, paddingLeft: 2 },
  badge: {
    position: 'absolute', right: 6, bottom: 6,
    backgroundColor: C.overlay, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  progressTrack: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#ffffff55',
  },
  progressFill: { height: 3, backgroundColor: C.accent },
});
