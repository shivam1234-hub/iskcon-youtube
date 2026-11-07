import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChannelResult, VideoResult } from '../data/types';
import { hideChannel as hideInFilter } from '../utils/iskcon';

/**
 * Everything the user keeps, stored on the phone only: subscriptions,
 * "Watch later" and recent searches. No Google account is involved, so none
 * of this syncs with youtube.com.
 */
const SUBS_KEY = 'subscriptions_v1';
const LATER_KEY = 'watch_later_v1';
const SEARCHES_KEY = 'recent_searches_v1';
const MAX_SEARCHES = 20;

interface Ctx {
  /** False until the stored subscriptions have been read. */
  loaded: boolean;
  subscriptions: ChannelResult[];
  isSubscribed: (channelId: string | undefined) => boolean;
  toggleSubscription: (c: ChannelResult) => void;
  /** "Not interested": hide everywhere and unsubscribe. */
  hideChannel: (c: { channelId?: string; title: string }) => void;

  watchLater: VideoResult[];
  isSaved: (videoId: string) => boolean;
  toggleWatchLater: (v: VideoResult) => void;

  recentSearches: string[];
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;
}

const LibraryContext = createContext<Ctx | null>(null);

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) setValue(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setIsLoaded(true);
      });
  }, [key]);
  const set = useCallback(
    (fn: (prev: T) => T) => {
      setValue((prev) => {
        const next = fn(prev);
        // Never overwrite stored data with the empty initial value before the
        // load has come back.
        if (loaded.current) AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [key],
  );
  return [value, set, isLoaded] as const;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [subscriptions, setSubs, subsLoaded] = usePersisted<ChannelResult[]>(SUBS_KEY, []);
  const [watchLater, setLater] = usePersisted<VideoResult[]>(LATER_KEY, []);
  const [recentSearches, setSearches] = usePersisted<string[]>(SEARCHES_KEY, []);

  const subIds = useMemo(() => new Set(subscriptions.map((s) => s.channelId)), [subscriptions]);
  const laterIds = useMemo(() => new Set(watchLater.map((v) => v.videoId)), [watchLater]);

  const toggleSubscription = useCallback((c: ChannelResult) => {
    if (!c.channelId) return;
    setSubs((prev) =>
      prev.some((s) => s.channelId === c.channelId)
        ? prev.filter((s) => s.channelId !== c.channelId)
        : [...prev, c].sort((a, b) => a.title.localeCompare(b.title)),
    );
  }, [setSubs]);

  const hideChannel = useCallback((c: { channelId?: string; title: string }) => {
    hideInFilter({ channelId: c.channelId ?? '', title: c.title });
    if (c.channelId) setSubs((prev) => prev.filter((s) => s.channelId !== c.channelId));
  }, [setSubs]);

  const toggleWatchLater = useCallback((v: VideoResult) => {
    setLater((prev) =>
      prev.some((x) => x.videoId === v.videoId)
        ? prev.filter((x) => x.videoId !== v.videoId)
        : [v, ...prev],
    );
  }, [setLater]);

  const addSearch = useCallback((q: string) => {
    const t = q.trim();
    if (!t) return;
    setSearches((prev) =>
      [t, ...prev.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_SEARCHES),
    );
  }, [setSearches]);

  const removeSearch = useCallback((q: string) => {
    setSearches((prev) => prev.filter((s) => s !== q));
  }, [setSearches]);

  const clearSearches = useCallback(() => setSearches(() => []), [setSearches]);

  const value = useMemo<Ctx>(() => ({
    loaded: subsLoaded,
    subscriptions,
    isSubscribed: (id) => !!id && subIds.has(id),
    toggleSubscription,
    hideChannel,
    watchLater,
    isSaved: (id) => laterIds.has(id),
    toggleWatchLater,
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches,
  }), [
    subsLoaded, subscriptions, subIds, toggleSubscription, hideChannel, watchLater, laterIds, toggleWatchLater,
    recentSearches, addSearch, removeSearch, clearSearches,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Ctx {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
