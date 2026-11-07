import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Image, Pressable, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VideoResult } from '../../data/types';
import {
  PAUSE_SCRIPT, PLAY_SCRIPT, YOUTUBE_EMBED_ORIGIN, channelShorts, getVideo, searchShorts,
  youtubeEmbedHtml,
} from '../../utils/youtube';
import {
  HINDI_CHANNEL_IDS, TRUSTED_CHANNELS, hindiFirst, isIskconChannel, isIskconShort, isHiddenChannel, learnFrom,
} from '../../utils/iskcon';
import { useLibrary } from '../../contexts/LibraryContext';
import { useHiddenVersion } from '../../hooks/useHidden';
import { confirmHideChannel, openChannel, shareVideo } from '../../utils/nav';
import { ErrorView } from '../../components/States';
import { C } from '../../theme/colors';

/**
 * ISKCON Shorts: a vertical, swipe-one-at-a-time feed like YouTube's.
 *
 * Sources are mixed: the Shorts tab of trusted ISKCON channels (and the
 * user's subscriptions), plus YouTube's Shorts search for ISKCON topics.
 * Every Short passes isIskconShort; search Shorts have no channel, so the
 * channel is looked up when the Short comes on screen and the Short is
 * skipped if the channel turns out to be hidden or not ISKCON.
 *
 * Only the Short on screen has a player; the rest are still thumbnails.
 */

const TOPICS = [
  'iskcon hindi katha', 'iskcon bhajan hindi', 'प्रभुपाद', 'इस्कॉन कीर्तन', 'हरे कृष्ण इस्कॉन',
  'iskcon hindi pravachan',
  'iskcon kirtan', 'srila prabhupada', 'hare krishna kirtan iskcon', 'iskcon darshan',
  'iskcon mayapur', 'iskcon vrindavan', 'radhanath swami', 'iskcon bhajan',
  'bhagavad gita iskcon', 'iskcon harinam', 'gaur nitai iskcon', 'iskcon aarti',
];

/** Loops like YouTube Shorts; no on-screen controls (tap pauses instead). */
const SHORT_PARAMS = (id: string) => `&controls=0&loop=1&playlist=${id}&modestbranding=1&iv_load_policy=3`;

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

type Source = { kind: 'channel'; id: string } | { kind: 'search'; q: string };

/** Channels first and often: their Shorts are the safest. One search per two channels. */
function buildSources(channelIds: string[]): Source[] {
  // Hindi channels lead.
  const ids = [...new Set(channelIds)];
  const chans = [
    ...shuffle(ids.filter((id) => HINDI_CHANNEL_IDS.includes(id))),
    ...shuffle(ids.filter((id) => !HINDI_CHANNEL_IDS.includes(id))),
  ];
  const topics = shuffle(TOPICS);
  const out: Source[] = [];
  while (chans.length || topics.length) {
    for (let k = 0; k < 2 && chans.length; k++) out.push({ kind: 'channel', id: chans.shift()! });
    if (topics.length) out.push({ kind: 'search', q: topics.shift()! });
  }
  return out;
}

async function fetchSource(s: Source): Promise<VideoResult[]> {
  const items = s.kind === 'channel'
    ? (await channelShorts(s.id)).slice(0, 12)
    : await searchShorts(s.q);
  learnFrom(items);
  return items.filter(isIskconShort);
}

// ---------------------------------------------------------------------------

const ShortPage = memo(function ShortPage({
  item, height, live, onSkip,
}: {
  item: VideoResult;
  height: number;
  /** On screen, tab focused, app in the foreground. */
  live: boolean;
  onSkip: (videoId: string) => void;
}) {
  const { hideChannel } = useLibrary();
  const web = useRef<WebView>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!live) {
      setStarted(false);
      setPaused(false);
    }
  }, [live]);

  const source = useMemo(
    () => ({ html: youtubeEmbedHtml(item.videoId, 0, SHORT_PARAMS(item.videoId)), baseUrl: YOUTUBE_EMBED_ORIGIN }),
    [item.videoId],
  );

  const toggle = () => {
    if (!started) return;
    web.current?.injectJavaScript(paused ? PLAY_SCRIPT : PAUSE_SCRIPT);
    setPaused(!paused);
  };

  const onMessage = (msg: string) => {
    if (msg === 'state:playing') {
      setStarted(true);
      setPaused(false);
    } else if (msg.startsWith('playerError') || msg === 'error') {
      // Embedding switched off by the uploader, or removed: just move on.
      onSkip(item.videoId);
    }
  };

  const hide = () =>
    confirmHideChannel(item.channel, () => {
      hideChannel({ channelId: item.channelId ?? '', title: item.channel });
      onSkip(item.videoId);
    });

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {live && (
        <WebView
          ref={web}
          style={StyleSheet.absoluteFill}
          source={source}
          originWhitelist={['https://*']}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onMessage={({ nativeEvent }) => onMessage(String(nativeEvent.data))}
          onShouldStartLoadWithRequest={(req) =>
            req.url.includes('/embed/') ||
            req.url.startsWith(YOUTUBE_EMBED_ORIGIN) ||
            req.url.startsWith('about:') ||
            req.url.startsWith('data:')
          }
        />
      )}
      {!started && (
        <View style={StyleSheet.absoluteFill}>
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {live && <ActivityIndicator style={styles.center} size="large" color="#fff" />}
        </View>
      )}

      {/* Takes every touch: taps pause/play, and swipes go to the list, not the player. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        {started && paused && (
          <View style={styles.center} pointerEvents="none">
            <View style={styles.bigPlay}>
              <Ionicons name="play" size={44} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>

      <View style={[styles.side, { bottom: 24 }]}>
        <Pressable onPress={() => shareVideo(item)} style={styles.sideBtn} hitSlop={6}>
          <Ionicons name="arrow-redo" size={30} color="#fff" />
          <Text style={styles.sideText}>Share</Text>
        </Pressable>
        <Pressable onPress={hide} style={styles.sideBtn} hitSlop={6}>
          <Ionicons name="eye-off" size={28} color="#fff" />
          <Text style={styles.sideText}>Not{'\n'}interested</Text>
        </Pressable>
      </View>

      <View style={[styles.info, { bottom: 20 }]} pointerEvents="box-none">
        {item.channel ? (
          <Pressable
            onPress={() => {
              if (item.channelId && isIskconChannel({ channelId: item.channelId, title: item.channel })) {
                openChannel({ channelId: item.channelId, title: item.channel, avatar: item.channelAvatar });
              }
            }}
            style={styles.channelRow}
            hitSlop={6}
          >
            {item.channelAvatar ? <Image source={{ uri: item.channelAvatar }} style={styles.avatar} /> : null}
            <Text style={styles.channel} numberOfLines={1}>{item.channel}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
        {item.viewsText ? <Text style={styles.views}>{item.viewsText}</Text> : null}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------

export default function ShortsScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { subscriptions } = useLibrary();
  useHiddenVersion();

  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const [height, setHeight] = useState(0);
  const [items, setItems] = useState<VideoResult[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sources = useRef<Source[]>([]);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const listRef = useRef<FlatList<VideoResult>>(null);
  const detailsAsked = useRef(new Set<string>());

  const reset = useCallback(() => {
    const subs = subscriptions
      .filter((s) => isIskconChannel(s))
      .map((s) => s.channelId);
    sources.current = buildSources([...subs, ...TRUSTED_CHANNELS.map((c) => c.channelId)]);
    seen.current = new Set();
    detailsAsked.current = new Set();
  }, [subscriptions]);

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    let added = 0;
    let failures = 0;
    try {
      // Pull sources two at a time until a handful of new Shorts arrive.
      for (let round = 0; round < 5 && added < 6 && sources.current.length; round++) {
        const batch = sources.current.splice(0, 2);
        const results = await Promise.allSettled(batch.map(fetchSource));
        const fresh: VideoResult[] = [];
        for (const r of results) {
          if (r.status === 'rejected') {
            failures++;
            continue;
          }
          for (const v of r.value) {
            if (seen.current.has(v.videoId)) continue;
            seen.current.add(v.videoId);
            fresh.push(v);
          }
        }
        added += fresh.length;
        if (fresh.length) setItems((prev) => [...prev, ...hindiFirst(shuffle(fresh))]);
      }
      if (added === 0 && failures > 0) setError("Couldn't load Shorts. Check the internet connection.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reset();
    loadMore();
    // Built once per visit to the app; pull more as the list runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Near the end: fetch more.
  useEffect(() => {
    if (items.length && index >= items.length - 4) {
      if (!sources.current.length) reset();
      loadMore();
    }
  }, [index, items.length, loadMore, reset]);

  const removeItem = useCallback((videoId: string) => {
    setItems((prev) => prev.filter((v) => v.videoId !== videoId));
  }, []);

  // Search Shorts carry no channel: look it up for the Short on screen, then
  // drop it if the channel is hidden or fails the filter.
  const current = items[index];
  useEffect(() => {
    if (!current || current.channelId || detailsAsked.current.has(current.videoId)) return;
    detailsAsked.current.add(current.videoId);
    const id = current.videoId;
    getVideo(id)
      .then((d) => {
        const full: VideoResult = {
          ...current,
          channel: d.channel,
          channelId: d.channelId,
          channelAvatar: d.channelAvatar,
        };
        if (!isIskconShort(full)) removeItem(id);
        else setItems((prev) => prev.map((v) => (v.videoId === id ? full : v)));
      })
      .catch(() => {});
  }, [current, removeItem]);

  const visible = items.filter((v) => !isHiddenChannel(v.channelId, v.channel));

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!height) return;
    const i = Math.round(e.nativeEvent.contentOffset.y / height);
    setIndex(Math.max(0, Math.min(i, visible.length - 1)));
  };

  const live = focused && appActive;

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && visible.length > 0 && (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item, index: i }) => (
            <ShortPage
              item={item}
              height={height}
              live={live && i === index}
              onSkip={removeItem}
            />
          )}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      )}

      {visible.length === 0 && (
        error ? (
          <ErrorView message={error} onRetry={() => { reset(); loadMore(); }} />
        ) : (
          <View style={styles.centerFill}>
            {loading ? <ActivityIndicator size="large" color={C.accent} /> : (
              <Text style={styles.empty}>No Shorts right now</Text>
            )}
          </View>
        )
      )}

      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="none">
        <Text style={styles.headerText}>Shorts</Text>
      </View>
    </View>
  );
}

const shadow = { textShadowColor: '#000a', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: { position: 'absolute', left: 16, top: 0 },
  headerText: { color: '#fff', fontSize: 21, fontWeight: '800', ...shadow },
  center: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.textDim, fontSize: 14 },
  bigPlay: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#0008',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 6,
  },
  side: { position: 'absolute', right: 8, alignItems: 'center', gap: 22 },
  sideBtn: { alignItems: 'center', width: 70 },
  sideText: { color: '#fff', fontSize: 11.5, fontWeight: '700', marginTop: 3, textAlign: 'center', ...shadow },
  info: { position: 'absolute', left: 12, right: 90 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, alignSelf: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#333' },
  channel: { color: '#fff', fontSize: 14.5, fontWeight: '700', ...shadow },
  title: { color: '#fff', fontSize: 14.5, lineHeight: 20, ...shadow },
  views: { color: '#ddd', fontSize: 12.5, marginTop: 5, ...shadow },
});
