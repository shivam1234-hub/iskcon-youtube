import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * YouTube's official embedded player in an iframe, driven over the same
 * postMessage "widget" protocol the IFrame API uses (no extra script).
 *
 * The page is served from http://127.0.0.1 (desktop/lib/server.js), so the
 * iframe carries a real referrer and the embed plays instead of failing
 * with error 153. `origin` tells the player where to post its events.
 */
export type PlayerEvent =
  | { type: 'ready' }
  | { type: 'state'; state: 'playing' | 'paused' | 'ended' | 'buffering' | 'cued' }
  | { type: 'time'; time: number; videoId?: string }
  | { type: 'duration'; duration: number; videoId?: string }
  | { type: 'muted'; muted: boolean }
  | { type: 'error'; code: string };

export interface PlayerHandle {
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  seekBy(delta: number): void;
  toggleMute(): void;
  /** Swap to another video inside the same player (keeps fullscreen). */
  load(videoId: string, start: number, autoplay?: boolean): void;
  time(): number;
  muted(): boolean;
}

export function embedSrc(videoId: string, start: number): string {
  const p = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    fs: '1',
    enablejsapi: '1',
    autoplay: '1',
    iv_load_policy: '3',
    origin: window.location.origin,
  });
  if (start > 0) p.set('start', String(Math.floor(start)));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${p}`;
}

const STATES: Record<number, 'playing' | 'paused' | 'ended' | 'buffering' | 'cued'> = {
  0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued',
};

const YouTubePlayer = forwardRef<PlayerHandle, {
  videoId: string;
  start: number;
  onEvent: (e: PlayerEvent) => void;
}>(function YouTubePlayer({ videoId, start, onEvent }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const timeRef = useRef(0);
  const mutedRef = useRef(false);
  const durSent = useRef<string>('');
  const lastState = useRef<string>('');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // The iframe's src is fixed at mount; later videos go in via loadVideoById.
  const [src] = useState(() => embedSrc(videoId, start));

  const send = (func: string, args: unknown[] = []) => {
    try {
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }),
        '*',
      );
    } catch {}
  };

  useImperativeHandle(ref, () => ({
    play: () => send('playVideo'),
    pause: () => send('pauseVideo'),
    seekTo: (s) => send('seekTo', [Math.max(0, s), true]),
    seekBy: (d) => send('seekTo', [Math.max(0, timeRef.current + d), true]),
    toggleMute: () => {
      send(mutedRef.current ? 'unMute' : 'mute');
      mutedRef.current = !mutedRef.current;
      onEventRef.current({ type: 'muted', muted: mutedRef.current });
    },
    load: (id, s, autoplay = true) => {
      timeRef.current = s;
      durSent.current = '';
      lastState.current = '';
      send(autoplay ? 'loadVideoById' : 'cueVideoById', [{ videoId: id, startSeconds: Math.floor(s) }]);
    },
    time: () => timeRef.current,
    muted: () => mutedRef.current,
  }));

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      let d: any;
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!d) return;
      const emitAll = onEventRef.current;
      // State arrives both as onStateChange and inside every infoDelivery.
      const emit = (ev: PlayerEvent) => {
        if (ev.type === 'state') {
          if (lastState.current === ev.state) return;
          lastState.current = ev.state;
        }
        emitAll(ev);
      };
      if (d.event === 'onError') {
        emit({ type: 'error', code: String(d.info) });
        return;
      }
      if (d.event === 'onStateChange' && typeof d.info === 'number') {
        const s = STATES[d.info];
        if (s) emit({ type: 'state', state: s });
        return;
      }
      const info = d.info;
      if (!info || typeof info !== 'object') return;
      const vid: string | undefined = info.videoData?.video_id;
      if (typeof info.playerState === 'number' && STATES[info.playerState] && d.event === 'infoDelivery') {
        emit({ type: 'state', state: STATES[info.playerState] });
      }
      if (typeof info.currentTime === 'number') {
        timeRef.current = info.currentTime;
        emit({ type: 'time', time: info.currentTime, videoId: vid });
      }
      if (typeof info.duration === 'number' && info.duration > 0 && durSent.current !== (vid ?? '?')) {
        durSent.current = vid ?? '?';
        emit({ type: 'duration', duration: info.duration, videoId: vid });
      }
      if (typeof info.muted === 'boolean' && info.muted !== mutedRef.current) {
        mutedRef.current = info.muted;
        emit({ type: 'muted', muted: info.muted });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onLoad = () => {
    const listen = () => {
      try {
        frame.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
          '*',
        );
      } catch {}
    };
    listen();
    setTimeout(listen, 500);
    setTimeout(listen, 1500);
    onEventRef.current({ type: 'ready' });
  };

  return (
    <iframe
      ref={frame}
      src={src}
      title="YouTube video player"
      onLoad={onLoad}
      onError={() => onEventRef.current({ type: 'error', code: 'load' })}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowFullScreen
      style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#000' }}
    />
  );
});

export default YouTubePlayer;
