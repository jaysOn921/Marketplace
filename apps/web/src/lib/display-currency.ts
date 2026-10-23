import type { CurrencyCode } from '@tzed/shared';
import { useSyncExternalStore } from 'react';
import { useMe } from './auth';

/**
 * Which currency the viewer wants approximate prices in: 'TZS', 'ZMW', or null for "both"
 * (show the other currency next to every price). Stored per browser; signed-in users
 * default to their own country's currency.
 */
const KEY = 'tzed.displayCurrency';
const listeners = new Set<() => void>();

function read(): CurrencyCode | 'BOTH' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'TZS' || v === 'ZMW' || v === 'BOTH' ? v : null;
  } catch {
    return null;
  }
}

export function setDisplayCurrency(value: CurrencyCode | 'BOTH') {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage unavailable (private mode): the choice lasts until reload.
    memory = value;
  }
  listeners.forEach((l) => l());
}

let memory: CurrencyCode | 'BOTH' | null = null;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The chosen display currency, or null when prices should show both currencies. */
export function useDisplayCurrency(): {
  value: CurrencyCode | null;
  choice: CurrencyCode | 'BOTH';
} {
  const stored = useSyncExternalStore(
    subscribe,
    () => read() ?? memory,
    () => null,
  );
  const { data: user } = useMe();
  const choice = stored ?? user?.currency ?? 'BOTH';
  return { value: choice === 'BOTH' ? null : choice, choice };
}
