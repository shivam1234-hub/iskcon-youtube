import { hindiFirst } from '../utils/iskcon';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, Session } from '../utils/youtube';

export interface Paged<T> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const HARD_TIMEOUT_MS = 30000;
/** With a filter, keep fetching until this many items pass (or pages run out). */
const FILL_TARGET = 8;
const MAX_EXTRA_PAGES = 4;

/**
 * One paged YouTube list: a first-page fetch plus a continuation fetch.
 *
 * `key` identifies the list; changing it aborts whatever is in flight and
 * starts over, so fast typing or chip switching never lands stale results.
 * A null key means "nothing to load yet".
 */
export function usePaged<T>(
  key: string | null,
  first: (signal: AbortSignal) => Promise<Page<T>>,
  more: (session: Session, continuation: string, signal: AbortSignal) => Promise<Page<T>>,
  idOf: (item: T) => string,
  /** Items failing this are never shown (the ISKCON-only rule). */
  keep: (item: T) => boolean = () => true,
  /** Sees each raw batch before filtering (used to learn ISKCON channels). */
  beforeFilter?: (items: T[]) => void,
): Paged<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const pageRef = useRef<{ session: Session | null; continuation: string | null }>({
    session: null,
    continuation: null,
  });
  const seenRef = useRef<Set<string>>(new Set());
  const firstRef = useRef(first);
  firstRef.current = first;
  const moreRef = useRef(more);
  moreRef.current = more;
  const idRef = useRef(idOf);
  idRef.current = idOf;
  const keepRef = useRef(keep);
  keepRef.current = keep;
  const beforeRef = useRef(beforeFilter);
  beforeRef.current = beforeFilter;

  /**
   * Filter a page; while too few items pass, follow the continuation for
   * more. Without this a strict filter leaves a near-empty screen, and the
   * list is too short for onEndReached to ever ask for the next page.
   */
  const fill = useCallback(
    async (page: Page<T>, seen: Set<string>, signal: AbortSignal): Promise<Page<T>> => {
      const take = (items: T[]) => {
        beforeRef.current?.(items);
        return items.filter((i) => {
          const id = idRef.current(i);
          if (seen.has(id) || !keepRef.current(i)) return false;
          seen.add(id);
          return true;
        });
      };
      const kept = take(page.items);
      let { continuation } = page;
      const session = page.session;
      for (let n = 0; kept.length < FILL_TARGET && session && continuation && n < MAX_EXTRA_PAGES; n++) {
        if (signal.aborted) break;
        try {
          const next = await moreRef.current(session, continuation, signal);
          kept.push(...take(next.items));
          continuation = next.items.length ? next.continuation : null;
        } catch {
          break;
        }
      }
      return { items: hindiFirst(kept), continuation, session };
    },
    [],
  );
  const busyMore = useRef(false);
  const isRefresh = useRef(false);

  useEffect(() => {
    if (key == null) {
      setItems([]);
      setLoading(false);
      setHasMore(false);
      return;
    }
    const ctrl = new AbortController();
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, HARD_TIMEOUT_MS);

    if (isRefresh.current) setRefreshing(true);
    else {
      setLoading(true);
      setItems([]);
    }
    setError(null);

    const seen = new Set<string>();
    firstRef.current(ctrl.signal)
      .then((raw) => fill(raw, seen, ctrl.signal))
      .then((page) => {
        if (ctrl.signal.aborted) return;
        seenRef.current = seen;
        pageRef.current = { session: page.session, continuation: page.continuation };
        setItems(page.items);
        setHasMore(!!(page.session && page.continuation));
      })
      .catch((e: any) => {
        if (timedOut) setError('YouTube took too long to respond');
        else if (ctrl.signal.aborted || e?.name === 'AbortError') return;
        else setError(e?.message ?? 'Something went wrong');
      })
      .finally(() => {
        clearTimeout(killer);
        if (!ctrl.signal.aborted || timedOut) {
          setLoading(false);
          setRefreshing(false);
          isRefresh.current = false;
        }
      });

    return () => {
      clearTimeout(killer);
      ctrl.abort();
    };
  }, [key, nonce, fill]);

  const loadMore = useCallback(() => {
    const { session, continuation } = pageRef.current;
    if (!session || !continuation || busyMore.current) return;
    busyMore.current = true;
    setLoadingMore(true);
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), HARD_TIMEOUT_MS);
    moreRef.current(session, continuation, ctrl.signal)
      // fill() drops repeats (YouTube repeats results across pages) and
      // anything the filter rejects.
      .then((raw) => fill(raw, seenRef.current, ctrl.signal))
      .then((page) => {
        pageRef.current = { session, continuation: page.continuation };
        setHasMore(!!page.continuation);
        setItems((prev) => [...prev, ...page.items]);
      })
      .catch(() => {
        // A failed next page shouldn't wipe what is shown; just stop paging.
        pageRef.current = { session, continuation: null };
        setHasMore(false);
      })
      .finally(() => {
        clearTimeout(killer);
        busyMore.current = false;
        setLoadingMore(false);
      });
  }, []);

  const refresh = useCallback(() => {
    isRefresh.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { items, loading, refreshing, loadingMore, error, hasMore, loadMore, refresh };
}
