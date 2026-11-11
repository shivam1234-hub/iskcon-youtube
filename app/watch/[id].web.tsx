import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resumePoint, useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { VideoResult } from '../../data/types';
import {
  VideoDetails, compactViews, formatPublishDate, getVideo, relatedMore, watchUrl,
} from '../../utils/youtube';
import { confirmHideChannel, openChannel } from '../../utils/nav';
import { isIskconVideo, learnFrom } from '../../utils/iskcon';
import YouTubePlayer, { PlayerEvent, PlayerHandle } from '../../components/desktop/Player';
import { DAvatar, Pill, Spinner, SubscribePill, Txt, web } from '../../components/desktop/ui';
import { MoreSpinner, PageScroll } from '../../components/desktop/Layout';
import { UpNextRow, copyVideoLink } from '../../components/desktop/VideoItems';
import { isTyping } from '../../components/desktop/Shell';
import { toast } from '../../components/desktop/overlays';
import { useT } from '../../components/desktop/theme';

function playerErrorText(code: string): string {
  if (code === '101' || code === '150' || code === '152') {
    return "The owner of this video doesn't allow it to play in other apps.";
  }
  if (code === '100') return 'This video is private or has been removed.';
  if (code === 'load') return "Couldn't load the player.";
  return "This video can't be played here.";
}

const desktop = () => (typeof window !== 'undefined' ? (window as any).desktop : undefined);
const SIDE = 402;

/**
 * Desktop watch page. Same behaviour as the phone's (one player, Up next
 * swaps in place, resume, history, autoplay, ISKCON-filtered Up next), laid
 * out like youtube.com: big player and details on the left, Up next on the
 * right. Float opens an always-on-top mini player window (desktop/main.js).
 */
export default function WatchScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string; v?: string; t?: string }>();
  const { width: winW, height: winH } = useWindowDimensions();
  const { byId, recordWatch, updatePosition } = useHistory();
  const { isSaved, toggleWatchLater, hideChannel } = useLibrary();
  const settings = useSettings();

  const [current, setCurrent] = useState<{ video: VideoResult; start: number }>(() => {
    let v: VideoResult = { videoId: String(params.id), title: '', channel: '', durationSec: null };
    try {
      if (params.v) v = { ...v, ...JSON.parse(String(params.v)) };
    } catch {}
    const explicit = Number(params.t);
    return { video: v, start: explicit > 0 ? explicit : resumePoint(byId.get(v.videoId)) };
  });
  const videoId = current.video.videoId;

  // A new route id (e.g. opening another video from the masthead search)
  // replaces the current one.
  useEffect(() => {
    const id = String(params.id);
    if (id && id !== currentRef.current.video.videoId) {
      let v: VideoResult = { videoId: id, title: '', channel: '', durationSec: null };
      try {
        if (params.v) v = { ...v, ...JSON.parse(String(params.v)) };
      } catch {}
      playOtherRef.current(v, Number(params.t) > 0 ? Number(params.t) : undefined);
    }
  }, [params.id]);

  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [related, setRelated] = useState<VideoResult[]>([]);
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [descOpen, setDescOpen] = useState(false);
  const [floating, setFloating] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  const player = useRef<PlayerHandle>(null);
  const stageRef = useRef<any>(null);
  const playingRef = useRef(false);
  const readyRef = useRef(false);
  const durationRef = useRef(0);
  const timeRef = useRef(0);
  const lastSavedRef = useRef(0);
  const swapAtRef = useRef(0);
  const contRef = useRef<{ session: VideoDetails['session']; continuation: string | null }>({ session: null, continuation: null });
  const scrollRef = useRef<ScrollView>(null);
  const floatingRef = useRef(false);
  floatingRef.current = floating;
  const currentRef = useRef(current);
  currentRef.current = current;

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

  const savePosition = useCallback(() => {
    if (timeRef.current > 0) updatePosition(videoRef.current.videoId, timeRef.current, durationRef.current);
  }, [updatePosition]);

  /** Swap to another video in place: one player for the whole session. */
  const playOther = useCallback(
    (v: VideoResult, startAt?: number) => {
      savePosition();
      const start = startAt ?? resumePoint(byId.get(v.videoId));
      timeRef.current = start;
      durationRef.current = 0;
      lastSavedRef.current = 0;
      swapAtRef.current = Date.now();
      setDetails(null);
      setRelated([]);
      setDescOpen(false);
      setCurrent({ video: v, start });
      if (readyRef.current && !failure && player.current) {
        // While the mini player is up the main one only cues.
        player.current.load(v.videoId, start, !floatingRef.current);
        recordWatch(v);
      } else {
        readyRef.current = false;
        setLoading(true);
        setPlayerKey((k) => k + 1);
      }
      setFailure(null);
      // Keep the page on the player.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    },
    [savePosition, byId, failure, recordWatch],
  );
  const playOtherRef = useRef(playOther);
  playOtherRef.current = playOther;
  // Development hook for the screenshot harness (desktop/main.js YT_SHOTS).
  useEffect(() => {
    (window as any).__ytSwap = (id: string) =>
      playOtherRef.current({ videoId: id, title: '', channel: '', durationSec: null });
    return () => {
      delete (window as any).__ytSwap;
    };
  }, []);

  // ---- details + Up next ---------------------------------------------------
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

  useEffect(() => {
    if (details && readyRef.current) recordWatch(videoRef.current);
  }, [details, recordWatch]);

  const loadMoreRelated = useCallback(() => {
    const { session, continuation } = contRef.current;
    if (!session || !continuation || relatedBusy) return;
    setRelatedBusy(true);
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
      .finally(() => setRelatedBusy(false));
  }, [relatedBusy]);

  // The filter can leave Up next short; fetch a few more pages (capped).
  const topUps = useRef(0);
  useEffect(() => {
    topUps.current = 0;
  }, [videoId]);
  useEffect(() => {
    if (details && related.length < 8 && contRef.current.continuation && !relatedBusy && topUps.current < 4) {
      topUps.current++;
      loadMoreRelated();
    }
  }, [details, related.length, relatedBusy, loadMoreRelated]);

  // ---- playback controls ---------------------------------------------------
  const setPlaying = (p: boolean) => {
    playingRef.current = p;
    setIsPlaying(p);
  };
  const togglePlayback = useCallback(() => {
    if (playingRef.current) player.current?.pause();
    else player.current?.play();
    setPlaying(!playingRef.current);
  }, []);
  const playNext = useCallback(() => {
    const next = relatedRef.current[0];
    if (next) playOtherRef.current(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else (stageRef.current as HTMLElement | null)?.requestFullscreen?.().catch(() => {});
  }, []);

  // Keyboard shortcuts (when the player itself doesn't have focus — inside
  // the iframe YouTube's own identical shortcuts apply).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[data-modal-open]')) return;
      const k = e.key;
      if (k === 'k' || k === 'K' || k === ' ') {
        e.preventDefault();
        togglePlayback();
      } else if (k === 'j' || k === 'J') player.current?.seekBy(-10);
      else if (k === 'l' || k === 'L') player.current?.seekBy(10);
      else if (k === 'ArrowLeft') {
        e.preventDefault();
        player.current?.seekBy(-5);
      } else if (k === 'ArrowRight') {
        e.preventDefault();
        player.current?.seekBy(5);
      } else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'm' || k === 'M') {
        player.current?.toggleMute();
        toast(player.current?.muted() ? 'Muted' : 'Sound on');
      } else if (k === 'N' && e.shiftKey) playNext();
      else if (k === '0' || k === 'Home') player.current?.seekTo(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlayback, toggleFullscreen, playNext]);

  // Hardware media keys (held only while this page is open) and the window
  // being minimised with "Keep playing" off.
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    d.media.hold(true);
    const offKey = d.media.onKey((k: string) => {
      if (k === 'playPause') togglePlayback();
      else if (k === 'pause') {
        player.current?.pause();
        setPlaying(false);
      } else if (k === 'next') playNext();
      else if (k === 'previous') player.current?.seekTo(0);
    });
    const offWin = d.onWindow((w: string) => {
      if (w === 'minimized' && !settingsRef.current.backgroundPlay) {
        player.current?.pause();
        setPlaying(false);
      }
    });
    return () => {
      d.media.hold(false);
      offKey();
      offWin();
    };
  }, [togglePlayback, playNext]);

  // ---- Float (mini player window) -----------------------------------------
  const openFloat = useCallback(() => {
    const d = desktop();
    if (!d) return;
    player.current?.pause();
    setPlaying(false);
    setFloating(true);
    d.float.open({ videoId: videoRef.current.videoId, start: timeRef.current, title: videoRef.current.title });
  }, []);

  useEffect(() => {
    const d = desktop();
    if (!d) return;
    const offClosed = d.float.onClosed((s: { videoId: string; time: number; playing: boolean }) => {
      setFloating(false);
      if (s.videoId === currentRef.current.video.videoId) {
        timeRef.current = s.time;
        player.current?.seekTo(s.time);
        if (s.playing) {
          player.current?.play();
          setPlaying(true);
        }
      }
    });
    // A video that ends in the mini player continues there with Up next.
    const offEnded = d.float.onEnded((s: { videoId: string; time: number }) => {
      if (s.videoId !== currentRef.current.video.videoId) return;
      updatePosition(s.videoId, durationRef.current || s.time, durationRef.current || s.time);
      const next = relatedRef.current[0];
      if (settingsRef.current.autoplay && next) {
        playOtherRef.current(next, 0);
        d.float.open({ videoId: next.videoId, start: 0, title: next.title });
      }
    });
    return () => {
      offClosed();
      offEnded();
      d.float.close();
    };
  }, [updatePosition]);

  useEffect(() => () => savePosition(), [savePosition]);

  // No load event within 15 s: stop the spinner and offer alternatives.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setFailure("Couldn't load the player. Check your connection.");
    }, 15000);
    return () => clearTimeout(timer);
  }, [loading, videoId, playerKey]);

  const onPlayerEvent = useCallback((e: PlayerEvent) => {
    const id = currentRef.current.video.videoId;
    if (e.type !== 'time' && (window as any).__ytDebug) console.log('[player]', id, JSON.stringify(e));
    switch (e.type) {
      case 'ready':
        setLoading(false);
        readyRef.current = true;
        setPlaying(true);
        recordWatch(videoRef.current);
        break;
      case 'error':
        setLoading(false);
        setPlaying(false);
        setFailure(playerErrorText(e.code));
        break;
      case 'duration':
        if (!e.videoId || e.videoId === id) durationRef.current = e.duration;
        break;
      case 'time': {
        if (e.videoId && e.videoId !== id) return;
        if (Date.now() - swapAtRef.current < 1500) return;
        const tt = Math.floor(e.time);
        timeRef.current = tt;
        if (Math.abs(tt - lastSavedRef.current) >= 5) {
          lastSavedRef.current = tt;
          updatePosition(id, tt, durationRef.current);
        }
        break;
      }
      case 'state':
        if (e.state === 'playing') setPlaying(true);
        else if (e.state === 'paused') setPlaying(false);
        else if (e.state === 'ended') {
          // A video that fails to load right after a swap can report "ended";
          // only a real end (near the duration) moves on.
          const sinceSwap = Date.now() - swapAtRef.current;
          const nearEnd = durationRef.current <= 0 || timeRef.current >= durationRef.current - 5;
          if (sinceSwap < 4000 || !nearEnd) break;
          setPlaying(false);
          updatePosition(id, durationRef.current, durationRef.current);
          timeRef.current = 0;
          const next = relatedRef.current[0];
          if (settingsRef.current.autoplay && next) playOtherRef.current(next);
        }
        break;
      default:
        break;
    }
  }, [recordWatch, updatePosition]);

  // ---- layout ---------------------------------------------------------------
  // As big as the column allows, but never taller than the window can show
  // with the title underneath.
  const layoutFor = (contentW: number) => {
    const twoCol = contentW >= 960;
    const primaryW = twoCol ? contentW - SIDE - 24 : contentW;
    const maxH = Math.max(300, winH - 56 - 24 - 110);
    const playerW = Math.min(primaryW, Math.round((maxH * 16) / 9));
    return { twoCol, primaryW, playerW, playerH: Math.round((playerW * 9) / 16) };
  };

  const saved = isSaved(videoId);
  const metaLine = [
    details?.viewCount != null ? compactViews(details.viewCount) : video.viewsText,
    formatPublishDate(details?.publishDate) || video.publishedText,
  ].filter(Boolean).join('  ');

  const renderStage = (playerW: number, playerH: number) => (
    <View
      ref={stageRef}
      style={{
        width: playerW, height: playerH, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden',
        alignSelf: 'center',
      }}
    >
      {failure ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#aaa" />
          <Txt size={16} style={{ color: '#eee', textAlign: 'center' }}>{failure}</Txt>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pill label="Try again" icon="refresh" onPress={() => {
              setFailure(null);
              setLoading(true);
              readyRef.current = false;
              setPlayerKey((k) => k + 1);
            }} />
            {related[0] ? <Pill label="Next video" icon="play-skip-forward" onPress={() => playOther(related[0])} /> : null}
            <Pill label="Watch on YouTube" icon="open-outline" onPress={() => Linking.openURL(watchUrl(videoId)).catch(() => {})} />
          </View>
        </View>
      ) : (
        <>
          <YouTubePlayer
            key={`${playerKey}`}
            ref={player}
            videoId={videoId}
            start={current.start}
            onEvent={onPlayerEvent}
          />
          {floating ? (
            <View style={web({ position: 'absolute', inset: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16 })}>
              <Ionicons name="albums-outline" size={48} color="#aaa" />
              <Txt size={16} style={{ color: '#eee' }}>Playing in the mini player</Txt>
              <Pill label="Bring it back" icon="contract-outline" onPress={() => desktop()?.float.close()} />
            </View>
          ) : null}
          {loading ? (
            <View pointerEvents="none" style={web({ position: 'absolute', inset: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' })}>
              <Spinner pad={0} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const goChannel = () =>
    video.channelId && openChannel({ channelId: video.channelId, title: video.channel, avatar: video.channelAvatar });

  const renderBelow = (playerW: number) => (
    <View style={{ width: playerW, alignSelf: 'center' }}>
      <Txt size={20} weight="700" style={{ marginTop: 12, lineHeight: 28 }} selectable>{video.title || ' '}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexGrow: 1, minWidth: 260 }}>
          <Pressable onPress={goChannel} style={web({ cursor: 'pointer' })}>
            <DAvatar uri={video.channelAvatar} name={video.channel} size={40} />
          </Pressable>
          <Pressable onPress={goChannel} style={web({ cursor: 'pointer', flexShrink: 1, minWidth: 0, maxWidth: 260 })}>
            <Txt size={16} weight="500" numberOfLines={1}>{video.channel || ' '}</Txt>
            {details?.subscribersText ? <Txt dim size={12} numberOfLines={1}>{details.subscribersText}</Txt> : null}
          </Pressable>
          {video.channelId ? (
            <SubscribePill
              channel={{ channelId: video.channelId, title: video.channel, avatar: video.channelAvatar, subscribersText: details?.subscribersText }}
            />
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pill icon={isPlaying ? 'pause' : 'play'} label={isPlaying ? 'Pause' : 'Play'} onPress={togglePlayback} tip="k" />
          <Pill
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            label={saved ? 'Saved' : 'Save'}
            onPress={() => {
              toggleWatchLater(video);
              toast(saved ? 'Removed from Watch later' : 'Saved to Watch later');
            }}
          />
          <Pill icon="arrow-redo-outline" label="Share" onPress={() => copyVideoLink(video)} tip="Copy link" />
          {desktop() ? <Pill icon="albums-outline" label="Float" onPress={openFloat} tip="Mini player on top of other windows" /> : null}
          {video.channel ? (
            <Pill
              icon="eye-off-outline"
              label="Not interested"
              onPress={() =>
                confirmHideChannel(video.channel, () => {
                  player.current?.pause();
                  hideChannel({ channelId: video.channelId, title: video.channel });
                  if (router.canGoBack()) router.back();
                  else router.navigate('/');
                })
              }
            />
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={() => setDescOpen((o) => !o)}
        style={({ hovered }: any) =>
          web({
            marginTop: 12, borderRadius: 12, padding: 12, cursor: descOpen ? 'default' : 'pointer',
            backgroundColor: hovered && !descOpen ? t.chipHover : t.chip,
          })
        }
      >
        <Txt size={14} weight="500">{metaLine || ' '}</Txt>
        {details?.description ? (
          <>
            <Txt size={14} numberOfLines={descOpen ? undefined : 3} style={{ marginTop: 4, lineHeight: 20 }} selectable={descOpen}>
              {details.description}
            </Txt>
            <Txt size={14} weight="500" style={{ marginTop: 6 }}>{descOpen ? 'Show less' : '...more'}</Txt>
          </>
        ) : null}
      </Pressable>
    </View>
  );

  const renderUpNext = (twoCol: boolean) => (
    <View style={{ width: twoCol ? SIDE : '100%', marginTop: twoCol ? 0 : 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Txt size={16} weight="500" style={{ flex: 1 }}>Up next</Txt>
        <Txt dim size={13} style={{ marginRight: 8 }}>Autoplay</Txt>
        <Switch
          value={settings.autoplay}
          onValueChange={(v) => settings.update({ autoplay: v })}
          trackColor={{ false: t.chipHover, true: t.link }}
          thumbColor="#ffffff"
          {...({ activeThumbColor: '#ffffff' } as any)}
        />
      </View>
      {!details && !detailsError ? <Spinner pad={24} /> : null}
      {detailsError ? <Txt dim size={13}>Couldn't load related videos.</Txt> : null}
      <View style={{ gap: 8 }}>
        {related.map((v) => (
          <UpNextRow key={v.videoId} video={v} onPress={(x) => playOther(x)} />
        ))}
      </View>
      <MoreSpinner show={relatedBusy} />
    </View>
  );

  return (
    <PageScroll scrollRef={scrollRef} contentStyle={{ paddingTop: 24 }} maxWidth={1754} onEnd={loadMoreRelated}>
      {(w) => {
        const { twoCol, primaryW, playerW, playerH } = layoutFor(w);
        return twoCol ? (
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            <View style={{ width: primaryW }}>
              {renderStage(playerW, playerH)}
              {renderBelow(playerW)}
            </View>
            {renderUpNext(true)}
          </View>
        ) : (
          <View>
            {renderStage(playerW, playerH)}
            {renderBelow(playerW)}
            {renderUpNext(false)}
          </View>
        );
      }}
    </PageScroll>
  );
}
