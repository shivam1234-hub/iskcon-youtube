import { useSyncExternalStore } from 'react';
import { hiddenSnapshot, subscribeHidden } from '../utils/iskcon';

/**
 * Re-renders the caller whenever a channel is hidden or brought back, so
 * rows already on screen disappear at once (lists were filtered when they
 * were fetched, which was before the channel was hidden).
 */
export function useHiddenVersion(): number {
  return useSyncExternalStore(subscribeHidden, hiddenSnapshot, hiddenSnapshot);
}
