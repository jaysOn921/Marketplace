import { useQuery } from '@tanstack/react-query';
import type { ListingSummary } from '@tzed/shared';
import { useCallback, useSyncExternalStore } from 'react';
import { api } from './api';

const KEY = 'tzed.recent';
const MAX = 12;
const listeners = new Set<() => void>();

function read(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
let cache = read();

function write(ids: number[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: keep the list for this visit only.
  }
  listeners.forEach((l) => l());
}

/** Remembers a listing as viewed on this device (most recent first, at most 12). */
export function rememberViewed(id: number) {
  write([id, ...cache.filter((x) => x !== id)].slice(0, MAX));
}
export const clearViewed = () => write([]);

/** Listings viewed on this device, newest first, excluding `exclude` (e.g. the current one). */
export function useRecentlyViewed(exclude?: number) {
  const ids = useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => cache,
  ).filter((id) => id !== exclude);
  return useQuery({
    queryKey: ['recent', ids.join(',')],
    queryFn: () => api<{ listings: ListingSummary[] }>(`/listings/by-ids?ids=${ids.join(',')}`),
    enabled: ids.length > 0,
    select: (d) => d.listings,
  });
}
