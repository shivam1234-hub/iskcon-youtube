import React from 'react';
import {
  Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopBar from '../../components/TopBar';
import Avatar from '../../components/Avatar';
import { useHistory, resumePoint } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { VideoResult, formatDuration, thumbFor } from '../../data/types';
import { openChannel, openVideo } from '../../utils/nav';
import { C } from '../../theme/colors';
import { isIskconVideo, listHiddenChannels, unhideChannel } from '../../utils/iskcon';
import { useHiddenVersion } from '../../hooks/useHidden';

function Shelf({
  title,
  videos,
  onSeeAll,
  progressOf,
  onPlay,
}: {
  title: string;
  videos: VideoResult[];
  onSeeAll: () => void;
  progressOf?: (v: VideoResult) => number;
  onPlay: (v: VideoResult) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
          <Text style={styles.seeAllText}>View all</Text>
        </Pressable>
      </View>
      {videos.length === 0 ? (
        <Text style={styles.emptyLine}>Nothing yet</Text>
      ) : (
        <FlatList
          horizontal
          data={videos.slice(0, 12)}
          keyExtractor={(v) => v.videoId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
          renderItem={({ item }) => {
            const p = progressOf?.(item) ?? 0;
            return (
              <Pressable onPress={() => onPlay(item)} style={styles.tile}>
                <View style={styles.tileThumb}>
                  <Image
                    source={{ uri: item.thumbnail || thumbFor(item.videoId) }}
                    style={StyleSheet.absoluteFill}
                  />
                  {item.durationSec != null && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{formatDuration(item.durationSec)}</Text>
                    </View>
                  )}
                  {p > 0 && (
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.min(100, p * 100)}%` }]} />
                    </View>
                  )}
                </View>
                <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.tileMeta} numberOfLines={1}>{item.channel}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function Row({
  icon, label, hint, right, onPress,
}: {
  icon: any; label: string; hint?: string; right?: React.ReactNode; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <Ionicons name={icon} size={22} color={C.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { history, byId, clear } = useHistory();
  const { watchLater, subscriptions, recentSearches, clearSearches } = useLibrary();
  const { backgroundPlay, autoplay, update } = useSettings();
  useHiddenVersion();
  const hiddenChannels = listHiddenChannels();

  const progressOf = (v: VideoResult) => {
    const h = byId.get(v.videoId);
    const d = v.durationSec ?? h?.durationSec;
    return h && d ? h.positionSec / d : 0;
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar title="You" />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <Shelf
          title="History"
          videos={history.filter(isIskconVideo)}
          onSeeAll={() => router.push('/history')}
          progressOf={progressOf}
          onPlay={(v) => openVideo(v, resumePoint(byId.get(v.videoId)))}
        />
        <Shelf
          title="Watch later"
          videos={watchLater.filter(isIskconVideo)}
          onSeeAll={() => router.push('/watch-later')}
          progressOf={progressOf}
          onPlay={(v) => openVideo(v, resumePoint(byId.get(v.videoId)))}
        />

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Channels</Text>
            <Text style={styles.count}>{subscriptions.length}</Text>
          </View>
          {subscriptions.length === 0 ? (
            <Text style={styles.emptyLine}>You haven't subscribed to any channels</Text>
          ) : (
            subscriptions.map((s) => (
              <Pressable key={s.channelId} onPress={() => openChannel(s)} style={styles.channel}>
                <Avatar uri={s.avatar} name={s.title} size={38} />
                <Text style={styles.channelName} numberOfLines={1}>{s.title}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.textMute} />
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Hidden channels</Text>
            <Text style={styles.count}>{hiddenChannels.length}</Text>
          </View>
          {hiddenChannels.length === 0 ? (
            <Text style={styles.emptyLine}>
              Long-press a video and choose "Not interested in this channel" to hide it.
            </Text>
          ) : (
            hiddenChannels.map((c) => (
              <View key={c.channelId || c.title} style={styles.channel}>
                <Ionicons name="eye-off-outline" size={20} color={C.textMute} />
                <Text style={styles.channelName} numberOfLines={1}>{c.title || c.channelId}</Text>
                <Pressable
                  onPress={() => unhideChannel(c.channelId || `name:${c.title}`)}
                  style={styles.seeAll}
                >
                  <Text style={styles.seeAllText}>Show again</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginHorizontal: 14, marginBottom: 4 }]}>Settings</Text>
          <Row
            icon="albums-outline"
            label="Keep playing when I leave"
            hint="Pressing Home shrinks the video into a floating window that keeps playing over other apps. YouTube's player always stops when the screen locks."
            right={
              <Switch
                value={backgroundPlay}
                onValueChange={(v) => update({ backgroundPlay: v })}
                trackColor={{ false: C.surfaceHi, true: C.accent + '88' }}
                thumbColor={backgroundPlay ? C.accent : C.textDim}
              />
            }
          />
          <Row
            icon="play-forward-outline"
            label="Autoplay next video"
            hint="When a video ends, the first Up next video starts"
            right={
              <Switch
                value={autoplay}
                onValueChange={(v) => update({ autoplay: v })}
                trackColor={{ false: C.surfaceHi, true: C.accent + '88' }}
                thumbColor={autoplay ? C.accent : C.textDim}
              />
            }
          />
          <Row
            icon="trash-outline"
            label="Clear watch history"
            hint={`${history.length} videos`}
            onPress={() =>
              Alert.alert('Clear watch history?', 'Resume positions are lost too.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clear },
              ])
            }
          />
          <Row
            icon="search-outline"
            label="Clear search history"
            hint={`${recentSearches.length} searches`}
            onPress={clearSearches}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  section: { marginTop: 14 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, marginBottom: 10,
  },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  count: { color: C.textMute, fontSize: 13, fontWeight: '700' },
  seeAll: {
    borderWidth: 1, borderColor: C.border, borderRadius: 16,
    paddingHorizontal: 12, minHeight: 30, justifyContent: 'center',
  },
  seeAllText: { color: C.text, fontSize: 12.5, fontWeight: '700' },
  emptyLine: { color: C.textMute, fontSize: 13, marginHorizontal: 14 },
  tile: { width: 160 },
  tileThumb: {
    width: 160, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: C.surface,
  },
  tileTitle: { color: C.text, fontSize: 12.5, fontWeight: '600', marginTop: 6, lineHeight: 16 },
  tileMeta: { color: C.textDim, fontSize: 11, marginTop: 2 },
  badge: {
    position: 'absolute', right: 4, bottom: 5, backgroundColor: C.overlay,
    borderRadius: 3, paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#ffffff55' },
  fill: { height: 3, backgroundColor: C.accent },
  channel: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  channelName: { flex: 1, color: C.text, fontSize: 14.5, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  rowLabel: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  rowHint: { color: C.textDim, fontSize: 11.5, marginTop: 3, lineHeight: 16 },
  footer: { color: C.textMute, fontSize: 11.5, marginHorizontal: 14, marginTop: 18, lineHeight: 16 },
});
