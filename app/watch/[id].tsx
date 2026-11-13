import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, AppStateStatus, BackHandler, FlatList, Linking, Pressable,
  ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import VideoCard from '../../components/VideoCard';
import Avatar from '../../components/Avatar';
import SubscribeButton from '../../components/SubscribeButton';
import { resumePoint, useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { VideoResult } from '../../data/types';
import {
  PAUSE_SCRIPT, PLAY_SCRIPT, VideoDetails, YOUTUBE_EMBED_ORIGIN, compactViews,
  formatPublishDate, getVideo, relatedMore, watchUrl, youtubeEmbedHtml,
} from '../../utils/youtube';
import {
  PipState, enterPip, isPipSupported, isPipWindow, onPipAction, onPipModeChanged,
  setPipEnabled, setPipPlaying,
} from '../../utils/pip';
import {
  ACTION_PAUSE, ACTION_RESUME, clearVideoNotification, prepareVideoNotifications,
  showVideoNotification,
} from '../../utils/videoNotification';
import { onMediaButton, releaseMediaButtons, setMediaButtonsState } from '../../utils/mediaButtons';
import { confirmHideChannel, openChannel, shareVideo } from '../../utils/nav';
import { isIskconVideo, learnFrom } from '../../utils/iskcon';
import { C } from '../../theme/colors';

const EXIT_FULLSCREEN_SCRIPT = `
  (function () {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
    true;
  })();
`;

/** What the embedded player's onError codes mean, in words a viewer can act on. */
function playerErrorText(code: string): string {
  if (code === '101' || code === '150' || code === '152') {
    return "The owner of this video doesn't allow it to play in other apps.";
  }
  if (code === '100') return 'This video is private or has been removed.';
  return "This video can't be played here.";
}

/**
 * The watch screen. One player for the whole session: choosing an Up next
 * video (or autoplay) swaps the video in place rather than stacking another
 * screen, so there is never a second player playing behind this one, and the
 * swap also works while the app sits in a picture-in-picture window.
 *
 * Playback is YouTube's official embedded player, hosted in an iframe inside
 * our own wrapper page — see YOUTUBE_EMBED_ORIGIN for why it can't be loaded
 * directly.
 */
export default function WatchScreen() {
  const params = useLocalSearchParams<{ id: string; v?: string; t?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { byId, recordWatch, updatePosition } = useHistory();
  const { isSaved, toggleWatchLater, hideChannel } = useLibrary();
  const settings = useSettings();

  const [current, setCurrent] = useState<{ video: VideoResult; start: number }>(() => {
    let v: VideoResult = { videoId: String(params.id), title: '', channel: '', durationSec: null };
    try {
      if (params.v) v = { ...v, ...JSON.parse(String(params.v)) };
    } catch {}
    const explicit = Number(params.t);
    const start = explicit > 0 ? explicit : resumePoint(byId.get(v.videoId));
    return { video: v, start };
  });
  const videoId = current.video.videoId;

  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [related, setRelated] = useState<VideoResult[]>([]);
  const [relatedMoreBusy, setRelatedMoreBusy] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [descOpen, setDescOpen] = useState(false);

  const webRef = useRef<WebView>(null);
  const listRef = useRef<FlatList<VideoResult>>(null);
  const playingRef = useRef(false);
  const notifIdRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  const timeRef = useRef(0);
  const lastSavedRef = useRef(0);
  const readyRef = useRef(false);
  const contRef = useRef<{ session: VideoDetails['session']; continuation: string | null }>({
    session: null,
    continuation: null,
  });

  // Everything the listing knew, overlaid with what the watch page knows.
  const video: VideoResult = useMemo(
    () => ({
      ...current.video,
      title: details?.title || current.video.title,
      channel: details?.channel || current.video.channel,
      channelId: details?.channelId || current.video.channelId,
      channelAvatar: details?.channelAvatar || current.video.channelAvatar,
      durationSec: details?.lengthSec ?? current.video.durationSec,
    }),
    [current.video, details],
  );
  const videoRef = useRef(video);
  videoRef.current = video;
  const relatedRef = useRef(related);
  relatedRef.current = related;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pauseVideo = useCallback(() => webRef.current?.injectJavaScript(PAUSE_SCRIPT), []);
  const playVideo = useCallback(() => webRef.current?.injectJavaScript(PLAY_SCRIPT), []);

  const savePosition = useCallback(() => {
    if (timeRef.current > 0) {
      updatePosition(videoRef.current.videoId, timeRef.current, durationRef.current);
    }
  }, [updatePosition]);

  /** Swap to another video in place. */
  const playOther = useCallback(
    (v: VideoResult) => {
      savePosition();
      readyRef.current = false;
      timeRef.current = 0;
      durationRef.current = 0;
      lastSavedRef.current = 0;
      setDetails(null);
      setRelated([]);
      setDescOpen(false);
      setFailure(null);
      setLoading(true);
      setCurrent({ video: v, start: resumePoint(byId.get(v.videoId)) });
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [savePosition, byId],
  );

  // ---- details + Up next --------------------------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    setDetailsError(false);
    getVideo(videoId, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setDetails(d);
        learnFrom(d.related);
        setRelated(d.related.filter(isIskconVideo));
        contRef.current = { session: d.session, continuation: d.continuation };
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDetailsError(true);
      });
    return () => ctrl.abort();
  }, [videoId]);

  // Once the page has told us the real title/channel, enrich the history row.
  useEffect(() => {
    if (details && readyRef.current) recordWatch(videoRef.current);
  }, [details, recordWatch]);

  const loadMoreRelated = useCallback(() => {
    const { session, continuation } = contRef.current;
    if (!session || !continuation || relatedMoreBusy) return;
    setRelatedMoreBusy(true);
    relatedMore(session, continuation)
      .then((p) => {
        contRef.current = { session, continuation: p.continuation };
        learnFrom(p.items);
        setRelated((prev) => {
          const seen = new Set(prev.map((v) => v.videoId));
          return [...prev, ...p.items.filter((v) => !seen.has(v.videoId) && isIskconVideo(v))];
        });
      })
      .catch(() => {
        contRef.current = { session, continuation: null };
      })
      .finally(() => setRelatedMoreBusy(false));
  }, [relatedMoreBusy]);

  // The ISKCON filter can leave Up next with only a few rows; fetch a few
  // more pages automatically (capped, in case YouTube offers nothing ISKCON).
  const topUps = useRef(0);
  useEffect(() => {
    topUps.current = 0;
  }, [videoId]);
  useEffect(() => {
    if (
      details && related.length < 8 && contRef.current.continuation &&
      !relatedMoreBusy && topUps.current < 4
    ) {
      topUps.current++;
      loadMoreRelated();
    }
  }, [details, related.length, relatedMoreBusy, loadMoreRelated]);

  // ---- picture-in-picture -------------------------------------------------
  const [pip, setPip] = useState<PipState>({ inPip: false, width: 0, height: 0 });
  useEffect(() => onPipModeChanged(setPip), []);
  const inPip = pip.inPip || isPipWindow(width, height);
  const pipAvailable = useMemo(() => isPipSupported(), []);

  useEffect(
    () =>
      onPipAction(() => {
        // The native side already paused/resumed the WebView; only catch up
        // the on-screen state. Re-sending a command here would be queued
        // until the app resumes and could undo the native toggle.
        const next = !playingRef.current;
        playingRef.current = next;
        setIsPlaying(next);
      }),
    [],
  );

  // Armed only while this screen is up, and only with background play on:
  // otherwise pressing Home anywhere would shrink the whole app.
  useEffect(() => {
    setPipEnabled(settings.backgroundPlay);
    return () => setPipEnabled(false);
  }, [settings.backgroundPlay]);

  const togglePlayback = useCallback(() => {
    const next = !playingRef.current;
    if (next) playVideo();
    else pauseVideo();
    playingRef.current = next;
    setIsPlaying(next);
    setPipPlaying(next);
  }, [playVideo, pauseVideo]);

  // ---- orientation + fullscreen ------------------------------------------
  useEffect(() => {
    ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, [fullscreen]);

  useEffect(
    () => () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      webRef.current?.injectJavaScript(EXIT_FULLSCREEN_SCRIPT);
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  // ---- leaving the app ----------------------------------------------------
  // Set up while in the FOREGROUND: Android won't show a permission prompt to
  // an app on its way out, so doing this on backgrounding never resolves.
  useEffect(() => {
    if (settings.backgroundPlay) prepareVideoNotifications();
  }, [settings.backgroundPlay]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      const leaving = state === 'background' || state === 'inactive';
      if (leaving) savePosition();
      if (!settingsRef.current.backgroundPlay) {
        if (leaving) pauseVideo();
        return;
      }
      if (leaving) {
        // PiP keeps the page visible, so the player carries on. These
        // buttons are the way to stop it without coming back into the app.
        notifIdRef.current = await showVideoNotification(
          videoRef.current.title || 'Video',
          playingRef.current !== false,
        );
      } else if (state === 'active') {
        await clearVideoNotification(notifIdRef.current);
        notifIdRef.current = null;
      }
    });
    return () => sub.remove();
  }, [pauseVideo, savePosition]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (resp) => {
      const action = resp.actionIdentifier;
      if (action === ACTION_PAUSE) {
        pauseVideo();
        playingRef.current = false;
        setIsPlaying(false);
        notifIdRef.current = await showVideoNotification(videoRef.current.title, false);
      } else if (action === ACTION_RESUME) {
        playVideo();
        playingRef.current = true;
        setIsPlaying(true);
        notifIdRef.current = await showVideoNotification(videoRef.current.title, true);
      }
    });
    return () => sub.remove();
  }, [pauseVideo, playVideo]);

  // Earphone / Bluetooth play-pause button.
  useEffect(() => onMediaButton(async (action) => {
    const play = action === 'play';
    if (play) playVideo(); else pauseVideo();
    playingRef.current = play;
    setIsPlaying(play);
    setMediaButtonsState(play, videoRef.current.title || 'Video');
    if (notifIdRef.current) {
      notifIdRef.current = await showVideoNotification(videoRef.current.title, play);
    }
  }), [pauseVideo, playVideo]);

  useEffect(
    () => () => {
      clearVideoNotification(notifIdRef.current);
      releaseMediaButtons();
      savePosition();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Navigating to another screen (a channel) pauses; leaving the APP does
  // not blur a screen, but guard on AppState anyway so it can never pause a
  // video that background play is meant to keep going.
  useFocusEffect(
    useCallback(
      () => () => {
        if (AppState.currentState === 'active') pauseVideo();
      },
      [pauseVideo],
    ),
  );

  // The iframe's load event is our only "ready"; if it never comes, stop
  // spinning and offer YouTube instead.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      setFailure("Couldn't load the player. Check your connection.");
    }, 15000);
    return () => clearTimeout(t);
  }, [loading, videoId]);

  const openExternally = () => {
    pauseVideo();
    Linking.openURL(watchUrl(videoId)).catch(() => {});
  };

  const onMessage = (msg: string) => {
    if (msg === 'ready') {
      setLoading(false);
      playingRef.current = true;
      readyRef.current = true;
      recordWatch(videoRef.current);
      return;
    }
    if (msg === 'error') {
      setLoading(false);
      setFailure("Couldn't load the player.");
      return;
    }
    if (msg.startsWith('playerError:')) {
      setFailure(playerErrorText(msg.slice(12)));
      return;
    }
    if (msg === 'fullscreen:on') return setFullscreen(true);
    if (msg === 'fullscreen:off') return setFullscreen(false);
    if (msg.startsWith('dur:')) {
      const d = Number(msg.slice(4));
      if (d > 0) durationRef.current = d;
      return;
    }
    if (msg.startsWith('time:')) {
      const t = Number(msg.slice(5));
      if (!Number.isNaN(t)) {
        timeRef.current = t;
        if (Math.abs(t - lastSavedRef.current) >= 5) {
          lastSavedRef.current = t;
          updatePosition(videoId, t, durationRef.current);
        }
      }
      return;
    }
    if (msg === 'state:playing') {
      playingRef.current = true;
      setIsPlaying(true);
      setPipPlaying(true);
      setMediaButtonsState(true, videoRef.current.title || 'Video');
      return;
    }
    if (msg === 'state:paused' || msg === 'state:ended') {
      playingRef.current = false;
      setIsPlaying(false);
      setPipPlaying(false);
      setMediaButtonsState(false, videoRef.current.title || 'Video');
      if (msg === 'state:ended') {
        // Finished: next open starts from the beginning.
        updatePosition(videoId, durationRef.current, durationRef.current);
        timeRef.current = 0;
        const next = relatedRef.current[0];
        if (settingsRef.current.autoplay && next) {
          playOther(next);
          return;
        }
      }
      if (notifIdRef.current) {
        showVideoNotification(videoRef.current.title, false).then((id) => {
          notifIdRef.current = id;
        });
      }
    }
  };

  const source = useMemo(
    () => ({ html: youtubeEmbedHtml(videoId, current.start), baseUrl: YOUTUBE_EMBED_ORIGIN }),
    [videoId, current.start],
  );

  // In PiP RN keeps reporting full-screen dimensions, so size from what the
  // activity reported; a pixel-sized stage would show only a black corner.
  const stage = inPip
    ? { width: pip.width || width, height: pip.height || height }
    : fullscreen
      ? { width, height }
      : { width, height: Math.round(width * (9 / 16)) };

  // In the floating window the PLAYER keeps its normal portrait size and is
  // only scaled down visually. Resizing it to the real window (~230x130dp)
  // put it under YouTube's 200x200 minimum player size, and the player
  // paused itself the moment the window appeared.
  const portraitRef = useRef({ width: 0, height: 0 });
  if (!inPip && !fullscreen && width > 0) {
    portraitRef.current = { width, height: Math.round(width * (9 / 16)) };
  }
  const base = portraitRef.current.width > 0 ? portraitRef.current : { width: 400, height: 225 };
  const playerStyle = inPip
    ? (() => {
        const k = Math.min(stage.width / base.width, stage.height / base.height);
        return {
          position: 'absolute' as const,
          width: base.width,
          height: base.height,
          left: (stage.width - base.width) / 2,
          top: (stage.height - base.height) / 2,
          transform: [{ scale: k }],
        };
      })()
    : stage;

  const saved = isSaved(videoId);
  const metaLine = [
    details?.viewCount != null ? compactViews(details.viewCount) : video.viewsText,
    formatPublishDate(details?.publishDate) || video.publishedText,
  ]
    .filter(Boolean)
    .join(' · ');

  const header = (
    <View>
      <Pressable onPress={() => setDescOpen((o) => !o)} style={styles.titleBox}>
        <Text style={styles.title}>{video.title || ' '}</Text>
        <Text style={styles.meta}>
          {metaLine}
          {details?.description ? <Text style={styles.moreLink}>{descOpen ? '  less' : '  ...more'}</Text> : null}
        </Text>
      </Pressable>

      {video.channelId ? (
        <View style={styles.channelRow}>
          <Pressable
            style={styles.channelTap}
            onPress={() =>
              openChannel({ channelId: video.channelId!, title: video.channel, avatar: video.channelAvatar })
            }
          >
            <Avatar uri={video.channelAvatar} name={video.channel} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.channelName} numberOfLines={1}>{video.channel}</Text>
              {details?.subscribersText ? (
                <Text style={styles.subs}>{details.subscribersText}</Text>
              ) : null}
            </View>
          </Pressable>
          <SubscribeButton
            channel={{
              channelId: video.channelId,
              title: video.channel,
              avatar: video.channelAvatar,
              subscribersText: details?.subscribersText,
            }}
          />
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        <Pressable onPress={togglePlayback} style={styles.action}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={17} color={C.text} />
          <Text style={styles.actionText}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={() => toggleWatchLater(video)} style={styles.action}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color={C.text} />
          <Text style={styles.actionText}>{saved ? 'Saved' : 'Save'}</Text>
        </Pressable>
        <Pressable onPress={() => shareVideo(video)} style={styles.action}>
          <Ionicons name="arrow-redo-outline" size={17} color={C.text} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        {pipAvailable && (
          <Pressable onPress={enterPip} style={styles.action}>
            <Ionicons name="contract-outline" size={17} color={C.text} />
            <Text style={styles.actionText}>Float</Text>
          </Pressable>
        )}
        {video.channel ? (
          <Pressable
            onPress={() =>
              confirmHideChannel(video.channel, () => {
                pauseVideo();
                hideChannel({ channelId: video.channelId, title: video.channel });
                router.back();
              })
            }
            style={styles.action}
          >
            <Ionicons name="eye-off-outline" size={17} color={C.text} />
            <Text style={styles.actionText}>Not interested</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => settings.update({ autoplay: !settings.autoplay })} style={styles.action}>
          <Ionicons
            name={settings.autoplay ? 'play-forward' : 'play-forward-outline'}
            size={17}
            color={settings.autoplay ? C.accent : C.text}
          />
          <Text style={styles.actionText}>Autoplay {settings.autoplay ? 'on' : 'off'}</Text>
        </Pressable>
      </ScrollView>

      {descOpen && details?.description ? (
        <View style={styles.descBox}>
          <Text style={styles.desc} selectable>{details.description}</Text>
        </View>
      ) : null}

      <Text style={styles.upNext}>Up next</Text>
      {!details && !detailsError ? <ActivityIndicator color={C.accent} style={{ margin: 16 }} /> : null}
      {detailsError ? (
        <Text style={styles.note}>Couldn't load related videos.</Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, !fullscreen && !inPip && { paddingTop: insets.top }]}>
      <StatusBar hidden={fullscreen} style="light" />
      <View style={[styles.stage, stage]}>
        {failure ? (
          <View style={[styles.fallback, stage]}>
            <Ionicons name="alert-circle-outline" size={32} color={C.textDim} />
            <Text style={styles.fallbackText}>{failure}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={openExternally} style={styles.fallbackBtn}>
                <Text style={styles.fallbackBtnText}>Watch on YouTube</Text>
              </Pressable>
              {related[0] ? (
                <Pressable onPress={() => playOther(related[0])} style={styles.fallbackBtn}>
                  <Text style={styles.fallbackBtnText}>Next video</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <>
            <WebView
              ref={webRef}
              key={videoId}
              // Explicit pixel size, not flex: a flex-sized WebView inside a
              // sized parent collapsed to zero on Android.
              style={[styles.web, playerStyle]}
              source={source}
              originWhitelist={['https://*']}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              onMessage={({ nativeEvent }) => onMessage(String(nativeEvent.data))}
              onError={() => {
                setLoading(false);
                setFailure("Couldn't load the player.");
              }}
              onHttpError={({ nativeEvent }) => {
                if (nativeEvent.url?.includes('/embed/')) {
                  setLoading(false);
                  setFailure("Couldn't load the player.");
                }
              }}
              // Keep the WebView on the player; logo/title taps go to the
              // real YouTube app or browser instead. (Never test
              // navigationType here: it is iOS-only and always 'other' on
              // Android, which would silently block every tap.)
              onShouldStartLoadWithRequest={(req) => {
                if (req.url.includes('/embed/')) return true;
                if (
                  req.url === YOUTUBE_EMBED_ORIGIN ||
                  req.url === `${YOUTUBE_EMBED_ORIGIN}/` ||
                  req.url.startsWith('about:') ||
                  req.url.startsWith('data:')
                ) {
                  return true;
                }
                // Logo / title / end-screen taps would lead into the full
                // YouTube app with all its distractions: swallow them.
                return false;
              }}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator color={C.accent} />
              </View>
            )}
          </>
        )}
      </View>

      {!fullscreen && !inPip && (
        <FlatList
          ref={listRef}
          data={related}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} variant="compact" onPress={playOther} />}
          ListHeaderComponent={header}
          onEndReached={loadMoreRelated}
          onEndReachedThreshold={1}
          ListFooterComponent={
            relatedMoreBusy ? <ActivityIndicator style={{ margin: 16 }} color={C.accent} /> : null
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          initialNumToRender={6}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  stage: { backgroundColor: '#000', overflow: 'hidden' },
  web: { backgroundColor: '#000' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#000',
  },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  fallbackText: { color: C.textDim, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  fallbackBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 18,
    paddingHorizontal: 14, minHeight: 36, justifyContent: 'center',
  },
  fallbackBtnText: { color: C.text, fontSize: 13, fontWeight: '700' },
  titleBox: { paddingHorizontal: 12, paddingTop: 12 },
  title: { color: C.text, fontSize: 17.5, fontWeight: '700', lineHeight: 23 },
  meta: { color: C.textDim, fontSize: 12.5, marginTop: 5 },
  moreLink: { color: C.text, fontWeight: '700' },
  channelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 14,
  },
  channelTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  channelName: { color: C.text, fontSize: 15, fontWeight: '700' },
  subs: { color: C.textDim, fontSize: 12, marginTop: 2 },
  actions: { paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surfaceHi, borderRadius: 18, paddingHorizontal: 14, minHeight: 36,
  },
  actionText: { color: C.text, fontSize: 13, fontWeight: '600' },
  descBox: {
    marginHorizontal: 12, marginBottom: 10, padding: 12,
    backgroundColor: C.surface, borderRadius: 12,
  },
  desc: { color: C.text, fontSize: 13.5, lineHeight: 19 },
  upNext: { color: C.text, fontSize: 16, fontWeight: '800', marginHorizontal: 12, marginBottom: 6 },
  note: { color: C.textMute, fontSize: 12.5, marginHorizontal: 12, marginBottom: 10 },
});
