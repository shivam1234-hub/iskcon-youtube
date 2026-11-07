import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VideoResult } from '../data/types';

const KEY = 'watch_history_v1';
const MAX_ENTRIES = 500;

export interface HistoryEntry extends VideoResult {
  watchedAt: string; // ISO
  positionSec: number;
}

interface Ctx {
  /** False until the stored history has been read. */
  loaded: boolean;
  history: HistoryEntry[];
  /** videoId -> entry, for progress bars on every list. */
  byId: Map<string, HistoryEntry>;
  recordWatch: (v: VideoResult) => void;
  updatePosition: (videoId: string, positionSec: number, durationSec: number) => void;
  remove: (videoId: string) => void;
  clear: () => void;
}

const HistoryContext = createContext<Ctx | null>(null);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const loaded = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setHistory(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setIsLoaded(true);
      });
  }, []);

  // Writes are coalesced: position updates arrive every few seconds and each
  // would otherwise serialise the whole list.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((list: HistoryEntry[]) => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
    }, 800);
  }, []);

  const recordWatch = useCallback((v: VideoResult) => {
    setHistory((prev) => {
      const existing = prev.find((e) => e.videoId === v.videoId);
      const entry: HistoryEntry = {
        ...existing,
        ...v,
        // Keep what we already know if this open carried less metadata.
        thumbnail: v.thumbnail || existing?.thumbnail,
        channelAvatar: v.channelAvatar || existing?.channelAvatar,
        durationSec: v.durationSec ?? existing?.durationSec ?? null,
        positionSec: existing?.positionSec ?? 0,
        watchedAt: new Date().toISOString(),
      };
      const next = [entry, ...prev.filter((e) => e.videoId !== v.videoId)].slice(0, MAX_ENTRIES);
      persist(next);
      return next;
    });
  }, [persist]);

  const updatePosition = useCallback((videoId: string, positionSec: number, durationSec: number) => {
    setHistory((prev) => {
      const i = prev.findIndex((e) => e.videoId === videoId);
      if (i === -1) return prev;
      const next = [...prev];
      next[i] = {
        ...next[i],
        positionSec,
        durationSec: durationSec > 0 ? durationSec : next[i].durationSec,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const remove = useCallback((videoId: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.videoId !== videoId);
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  const byId = useMemo(() => new Map(history.map((e) => [e.videoId, e])), [history]);

  const value = useMemo(
    () => ({ loaded: isLoaded, history, byId, recordWatch, updatePosition, remove, clear }),
    [isLoaded, history, byId, recordWatch, updatePosition, remove, clear],
  );
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): Ctx {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within HistoryProvider');
  return ctx;
}

/** Where to resume: 0 if unwatched or practically finished. */
export function resumePoint(e: HistoryEntry | undefined): number {
  if (!e || e.positionSec < 10) return 0;
  if (e.durationSec && e.positionSec > e.durationSec - 15) return 0;
  return e.positionSec;
}
