import { useCallback, useSyncExternalStore } from 'react';

import { networkStore } from '../core/store';
import type { NetworkEntry } from '../types';

/** All captured entries, newest first. */
export function useNetworkEntries(): readonly NetworkEntry[] {
  return useSyncExternalStore(
    networkStore.subscribe,
    networkStore.getSnapshot,
    networkStore.getSnapshot,
  );
}

/**
 * A single entry. Subscribing per-id keeps the detail screen from re-rendering
 * every time an unrelated request makes progress — the store returns a stable
 * reference for untouched entries, so React bails out on its own.
 */
export function useNetworkEntry(id: string | null | undefined): NetworkEntry | undefined {
  const getSnapshot = useCallback(
    () => (id ? networkStore.getEntry(id) : undefined),
    [id],
  );
  return useSyncExternalStore(networkStore.subscribe, getSnapshot, getSnapshot);
}

export function useNetworkStore() {
  return networkStore;
}
