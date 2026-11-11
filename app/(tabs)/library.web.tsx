import React from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resumePoint, useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { VideoResult } from '../../data/types';
import { openChannel, openVideo } from '../../utils/nav';
import { isIskconVideo, listHiddenChannels, unhideChannel } from '../../utils/iskcon';
import { useHiddenVersion } from '../../hooks/useHidden';
import { DAvatar, EmptyState, Pill, SubscribePill, Txt, web } from '../../components/desktop/ui';
import { PageScroll, columnsFor } from '../../components/desktop/Layout';
import { VideoTile } from '../../components/desktop/VideoItems';
import { toast } from '../../components/desktop/overlays';
import { ThemeMode, useT, useTheme } from '../../components/desktop/theme';

function Shelf({
  title, icon, videos, width, href, empty,
}: { title: string; icon: any; videos: VideoResult[]; width: number; href: string; empty: string }) {
  const { byId } = useHistory();
  const cols = columnsFor(width, 220, 6);
  const w = Math.floor((width - 16 * (cols - 1)) / cols);
  return (
    <View style={{ marginBottom: 32 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <Ionicons name={icon} size={24} color={useT().text} />
        <Txt size={20} weight="700" style={{ flex: 1 }}>{title}</Txt>
        <Pill small label="View all" onPress={() => router.navigate(href as any)} />
      </View>
      {videos.length === 0 ? (
        <Txt dim size={14}>{empty}</Txt>
      ) : (
        <View style={{ flexDirection: 'row', gap: 16, overflow: 'hidden' }}>
          {videos.slice(0, cols).map((v) => (
            <View key={v.videoId} style={{ width: w }}>
              <VideoTile video={v} onPress={(x) => openVideo(x, resumePoint(byId.get(x.videoId)))} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function HiddenChannels() {
  const t = useT();
  useHiddenVersion();
  const hidden = listHiddenChannels();
  return (
    <View style={{ maxWidth: 820 }}>
      <Txt size={36} weight="700">Hidden channels</Txt>
      <Txt dim size={14} style={{ marginTop: 8, marginBottom: 24, lineHeight: 20 }}>
        Videos from these channels are never shown. Choose "Not interested in this channel" in a video's ⋯ menu to add one.
      </Txt>
      {hidden.length === 0 ? (
        <EmptyState icon="eye-off-outline" title="No hidden channels" />
      ) : (
        hidden.map((c) => (
          <View
            key={c.channelId || c.title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border }}
          >
            <DAvatar name={c.title || c.channelId} size={40} />
            <Txt size={16} numberOfLines={1} style={{ flex: 1 }}>{c.title || c.channelId}</Txt>
            <Pill
              small
              icon="eye-outline"
              label="Show again"
              onPress={() => {
                unhideChannel(c.channelId || `name:${c.title}`);
                toast(`${c.title || 'Channel'} will be shown again`);
              }}
            />
          </View>
        ))
      )}
    </View>
  );
}

function SettingRow({
  icon, label, hint, right, onPress,
}: { icon: any; label: string; hint?: string; right?: React.ReactNode; onPress?: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }: any) =>
        web({
          flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 16,
          borderRadius: 12, cursor: onPress ? 'pointer' : 'default',
          backgroundColor: hovered && onPress ? t.hover : 'transparent',
        })
      }
    >
      <Ionicons name={icon} size={24} color={t.text} />
      <View style={{ flex: 1 }}>
        <Txt size={16}>{label}</Txt>
        {hint ? <Txt dim size={13} style={{ marginTop: 4, lineHeight: 18 }}>{hint}</Txt> : null}
      </View>
      {right}
    </Pressable>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: t.chipHover, true: t.link }}
      thumbColor="#ffffff"
      {...({ activeThumbColor: '#ffffff' } as any)}
    />
  );
}

function Settings() {
  const t = useT();
  const { mode, setMode } = useTheme();
  const { backgroundPlay, autoplay, update } = useSettings();
  const { history, clear } = useHistory();
  const { recentSearches, clearSearches } = useLibrary();
  const modes: { key: ThemeMode; label: string }[] = [
    { key: 'system', label: 'Use device theme' },
    { key: 'dark', label: 'Dark theme' },
    { key: 'light', label: 'Light theme' },
  ];
  const version = (window as any).desktop?.version;
  return (
    <View style={{ maxWidth: 820 }}>
      <Txt size={36} weight="700" style={{ marginBottom: 24 }}>Settings</Txt>

      <Txt size={14} weight="500" dim style={{ marginLeft: 16, marginBottom: 4 }}>APPEARANCE</Txt>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
        {modes.map((m) => (
          <Pill key={m.key} small primary={mode === m.key} label={m.label} onPress={() => setMode(m.key)} />
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: t.border, marginVertical: 16 }} />
      <Txt size={14} weight="500" dim style={{ marginLeft: 16, marginBottom: 4 }}>PLAYBACK</Txt>
      <SettingRow
        icon="albums-outline"
        label="Keep playing when minimised"
        hint="Turn off to pause the video when the window is minimised. Float puts the video in a small window that stays on top of other apps."
        right={<Toggle value={backgroundPlay} onChange={(v) => update({ backgroundPlay: v })} />}
      />
      <SettingRow
        icon="play-forward-outline"
        label="Autoplay next video"
        hint="When a video ends, the first Up next video starts"
        right={<Toggle value={autoplay} onChange={(v) => update({ autoplay: v })} />}
      />

      <View style={{ height: 1, backgroundColor: t.border, marginVertical: 16 }} />
      <Txt size={14} weight="500" dim style={{ marginLeft: 16, marginBottom: 4 }}>HISTORY</Txt>
      <SettingRow
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
      <SettingRow
        icon="list-outline"
        label="Recent searches"
        hint="See, rerun or remove past searches"
        onPress={() => router.navigate('/search')}
      />
      <SettingRow
        icon="search-outline"
        label="Clear search history"
        hint={`${recentSearches.length} searches`}
        onPress={() => {
          clearSearches();
          toast('Search history cleared');
        }}
      />

      <View style={{ height: 1, backgroundColor: t.border, marginVertical: 16 }} />
      <Txt size={14} weight="500" dim style={{ marginLeft: 16, marginBottom: 8 }}>KEYBOARD SHORTCUTS</Txt>
      {[
        ['Ctrl + K  or  /', 'Search'],
        ['K  or  Space', 'Play / pause'],
        ['J  /  L', 'Back / forward 10 seconds'],
        ['←  /  →', 'Back / forward 5 seconds'],
        ['F', 'Full screen'],
        ['M', 'Mute'],
        ['Shift + N', 'Next video'],
        ['Alt + ←  or  Backspace', 'Go back'],
        ['Media keys', 'Play / pause, next video'],
      ].map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 }}>
          <Txt size={14} weight="500" style={{ width: 220 }}>{k}</Txt>
          <Txt dim size={14}>{v}</Txt>
        </View>
      ))}
      {version ? <Txt mute size={12} style={{ marginTop: 24, marginLeft: 16 }}>Version {version}</Txt> : null}
    </View>
  );
}

export default function LibraryScreen() {
  const t = useT();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { history } = useHistory();
  const { watchLater, subscriptions } = useLibrary();
  useHiddenVersion();

  return (
    <PageScroll contentStyle={{ paddingTop: 24 }} maxWidth={view ? 1284 : 2200}>
      {(width) =>
        view === 'hidden' ? (
          <HiddenChannels />
        ) : view === 'settings' ? (
          <Settings />
        ) : (
          <View>
            <Txt size={36} weight="700" style={{ marginBottom: 24 }}>You</Txt>
            <Shelf title="History" icon="time-outline" href="/history" width={width} videos={history.filter(isIskconVideo)} empty="Videos you watch will show up here." />
            <Shelf title="Watch later" icon="bookmark-outline" href="/watch-later" width={width} videos={watchLater.filter(isIskconVideo)} empty="Save videos to watch them later." />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              <Ionicons name="albums-outline" size={24} color={t.text} />
              <Txt size={20} weight="700" style={{ flex: 1 }}>Subscriptions</Txt>
              <Txt dim size={14}>{subscriptions.length}</Txt>
            </View>
            {subscriptions.length === 0 ? (
              <Txt dim size={14}>You haven't subscribed to any channels.</Txt>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {subscriptions.map((s) => (
                  <Pressable
                    key={s.channelId}
                    onPress={() => openChannel(s)}
                    style={({ hovered }: any) =>
                      web({
                        width: 300, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                        borderRadius: 12, cursor: 'pointer', backgroundColor: hovered ? t.hover : t.chip,
                      })
                    }
                  >
                    <DAvatar uri={s.avatar} name={s.title} size={48} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt size={14} weight="500" numberOfLines={1}>{s.title}</Txt>
                      {s.subscribersText ? <Txt dim size={12} numberOfLines={1}>{s.subscribersText}</Txt> : null}
                    </View>
                    <SubscribePill small channel={s} />
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 40 }}>
              <Pill icon="eye-off-outline" label="Hidden channels" onPress={() => router.navigate('/library?view=hidden' as any)} />
              <Pill icon="settings-outline" label="Settings" onPress={() => router.navigate('/library?view=settings' as any)} />
            </View>
          </View>
        )
      }
    </PageScroll>
  );
}
