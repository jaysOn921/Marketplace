import { useSyncExternalStore } from 'react';
import type { PushKeyResponse } from '@tzed/shared';
import { api, del, post } from './api';

// Installing TZed on the home screen, new-version notices and phone notifications.
// public/sw.js is the service worker these talk to.

/** Chrome's install event (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Android/desktop Chrome: the browser is ready to show its install dialog. */
  installEvent: InstallPromptEvent | null;
  /** A new version is downloaded and waiting for a reload. */
  waitingWorker: ServiceWorker | null;
  /** Someone tapped "Install app" in the menu: show the banner even if it was dismissed. */
  installAsked: boolean;
}

let state: PwaState = { installEvent: null, waitingWorker: null, installAsked: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function usePwa() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode: the prompt may simply show again next time.
    }
  },
};

/** Already opened from the home screen. */
export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true);

/** iPhone and iPad Safari can't show an install dialog; people use Share → Add to Home Screen. */
export const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const canInstall = (s: PwaState) => !isInstalled() && (Boolean(s.installEvent) || isIos());

const DISMISS_DAYS = 30;

/** Ask only people who came back or did something real (ordered, listed), and not too often. */
export function installBannerWanted(s: PwaState) {
  if (!canInstall(s)) return false;
  if (s.installAsked) return true;
  const dismissed = Number(storage.get('tzed.installDismissedAt') ?? 0);
  if (Date.now() - dismissed < DISMISS_DAYS * 24 * 60 * 60 * 1000) return false;
  return storage.get('tzed.engaged') === '1' || Number(storage.get('tzed.visits') ?? 0) >= 2;
}

/** Called after an order or a listing: a good moment to suggest the app. */
export function markEngaged() {
  storage.set('tzed.engaged', '1');
}

export function dismissInstall() {
  storage.set('tzed.installDismissedAt', String(Date.now()));
  set({ installAsked: false });
}

export function askInstall() {
  set({ installAsked: true });
}

export async function promptInstall() {
  const event = state.installEvent;
  if (!event) return;
  await event.prompt();
  await event.userChoice.catch(() => undefined);
  set({ installEvent: null, installAsked: false });
}

let updating = false;

/** Reloads into the waiting version. */
export function applyUpdate() {
  updating = true;
  state.waitingWorker?.postMessage('SKIP_WAITING');
}

export function registerServiceWorker() {
  // Built app only: on the dev server it would cache files that change on every save.
  // scripts/pwa-check.sh tests it against a production build.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // Count visits (once per browser session) for installBannerWanted().
  try {
    if (!sessionStorage.getItem('tzed.counted')) {
      sessionStorage.setItem('tzed.counted', '1');
      storage.set('tzed.visits', String(Number(storage.get('tzed.visits') ?? 0) + 1));
    }
  } catch {
    // ignore
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own, quieter banner instead
    set({ installEvent: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ installEvent: null, installAsked: false }));

  // Reload only when the person chose to update. On a first visit the worker also takes
  // control (a controller change), and the page must not reload under them then.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating) return;
    updating = false;
    window.location.reload();
  });

  void navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Only an update (a worker already controls the page) needs a reload; a first install doesn't.
    const offer = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) set({ waitingWorker: worker });
    };
    offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offer(worker);
      });
    });
    // Check for a new version when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  });
}

/** Forgets the listings kept for offline reading (on sign-out: phones are often shared). */
export async function clearOfflineData() {
  if (typeof caches !== 'undefined') await caches.delete('tzed-public').catch(() => undefined);
}

// ─── Phone notifications ─────────────────────────────────────────────────────

export type PushStatus = 'unsupported' | 'unavailable' | 'blocked' | 'on' | 'off';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

async function thisDevice(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (!(await api<PushKeyResponse>('/push/key')).publicKey) return 'unavailable';
  return (await thisDevice()) ? 'on' : 'off';
}

function keyBytes(base64url: string) {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Asks the browser for permission and subscribes this phone. Returns the new status. */
export async function turnOnPush(): Promise<PushStatus> {
  const { publicKey } = await api<PushKeyResponse>('/push/key');
  if (!publicKey) return 'unavailable';
  if ((await Notification.requestPermission()) !== 'granted') return 'blocked';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await post('/me/push', sub.toJSON());
  return 'on';
}

/** Stops notifications on this phone only. */
export async function turnOffPush() {
  const sub = await thisDevice();
  if (!sub) return;
  await del('/me/push', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}
